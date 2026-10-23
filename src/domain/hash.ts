/**
 * 記事本文の内容ハッシュ。承認はこのハッシュに紐づき、1文字でも変われば承認は無効になる。
 * 仕様: docs/architecture.md §4、docs/requirements.md FR-5.3
 */
import { createHash } from "node:crypto";

export interface ArticleContent {
  title: string;
  price_jpy: number | null;
  free: string;
  paid: string;
}

/** 有料部分の境界マーカー（paid.md にちょうど1つ置く） */
export const PAYWALL_MARKER = "<!-- paywall -->";
const PAYWALL_PATTERN = /<!--\s*paywall\s*-->/g;

/** 見た目が同じ本文が同じハッシュになるよう、BOM と改行コード（CRLF/CR）だけをそろえる */
export function normalizeText(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

/** タイトル・価格・無料記事・有料記事から SHA-256（16進64文字）を計算する */
export function contentHash(content: ArticleContent): string {
  // 各要素の境目があいまいにならないよう、JSON にしてからハッシュする
  const canonical = JSON.stringify({
    v: 1,
    title: normalizeText(content.title),
    price_jpy: content.price_jpy,
    free: normalizeText(content.free),
    paid: normalizeText(content.paid),
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function countPaywalls(paid: string): number {
  return paid.match(PAYWALL_PATTERN)?.length ?? 0;
}
