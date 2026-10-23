import { describe, expect, it } from "vitest";
import { contentHash, countPaywalls, normalizeText } from "../src/domain/hash.js";
import { toZonedIso } from "../src/domain/time.js";
import { zonedDateTime } from "../src/domain/schemas.js";

const base = { title: "タイトル", price_jpy: 980, free: "無料\n本文\n", paid: "有料\n<!-- paywall -->\n本文\n" };

describe("contentHash", () => {
  it("16進64文字の SHA-256 を返す", () => {
    expect(contentHash(base)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("同じ内容なら同じハッシュ", () => {
    expect(contentHash({ ...base })).toBe(contentHash(base));
  });

  it.each([
    ["無料記事", { free: "無料\n本文。\n" }],
    ["有料記事", { paid: "有料\n<!-- paywall -->\n本文!\n" }],
    ["タイトル", { title: "タイトル2" }],
    ["価格", { price_jpy: 1980 }],
    ["価格の未定化", { price_jpy: null }],
    ["末尾の空白", { free: "無料\n本文 \n" }],
  ])("%s が1か所でも変わればハッシュが変わる", (_label, change) => {
    expect(contentHash({ ...base, ...change })).not.toBe(contentHash(base));
  });

  it("改行コード（CRLF / CR）と BOM の違いは同じ内容とみなす", () => {
    const crlf = { ...base, free: "﻿無料\r\n本文\r\n", paid: base.paid.replace(/\n/g, "\r") };
    expect(contentHash(crlf)).toBe(contentHash(base));
  });

  it("無料と有料の境目をずらしても同じハッシュにならない", () => {
    const shifted = { ...base, free: "無料\n本文\n有料\n", paid: "<!-- paywall -->\n本文\n" };
    expect(contentHash(shifted)).not.toBe(contentHash(base));
  });
});

describe("normalizeText / countPaywalls", () => {
  it("改行をそろえる", () => {
    expect(normalizeText("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("paywall マーカーを数える（空白の揺れも許容）", () => {
    expect(countPaywalls("a")).toBe(0);
    expect(countPaywalls("a<!-- paywall -->b")).toBe(1);
    expect(countPaywalls("<!--paywall--> x <!--  paywall  -->")).toBe(2);
  });
});

describe("toZonedIso", () => {
  it("タイムゾーン付きの日時を返し、スキーマを満たす", () => {
    const s = toZonedIso(new Date("2026-10-23T01:15:00Z"));
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(zonedDateTime.safeParse(s).success).toBe(true);
    // 同じ時刻を指していること
    expect(Date.parse(s)).toBe(Date.parse("2026-10-23T01:15:00Z"));
  });
});
