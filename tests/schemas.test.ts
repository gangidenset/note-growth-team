import { describe, expect, it } from "vitest";
import {
  ApprovalRecord,
  ArticleMeta,
  MarketRecord,
  QaReport,
  ThemeRecord,
} from "../src/domain/schemas.js";

const validMarket = {
  id: "2026-10-23-001",
  topic: "Flutterで作るデモアプリ",
  source_url: "https://note.com/example/n/n0000000000",
  source_title: "例: 記事タイトル",
  retrieved_at: "2026-10-23T10:15:00+09:00",
  method: "web_fetch",
  measurement: "observed",
  metrics: { price_jpy: 980, likes: 120 },
  collected_by: "market-researcher",
};

/** 必須項目を1つ取り除いたコピーを作る */
function without<T extends object>(obj: T, key: keyof T): Partial<T> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

describe("MarketRecord（市場データ）", () => {
  it("出典項目がそろったデータは受け付ける", () => {
    const parsed = MarketRecord.parse(validMarket);
    expect(parsed.estimation_basis).toBeNull();
    expect(parsed.notes).toBe("");
  });

  it.each(["source_url", "source_title", "retrieved_at", "method", "measurement", "collected_by"] as const)(
    "%s が欠けていると拒否する",
    (key) => {
      expect(MarketRecord.safeParse(without(validMarket, key)).success).toBe(false);
    },
  );

  it("タイムゾーンのない取得日時を拒否する", () => {
    const r = MarketRecord.safeParse({ ...validMarket, retrieved_at: "2026-10-23T10:15:00" });
    expect(r.success).toBe(false);
  });

  it("UTC（Z）表記の取得日時は受け付ける", () => {
    const r = MarketRecord.safeParse({ ...validMarket, retrieved_at: "2026-10-23T01:15:00Z" });
    expect(r.success).toBe(true);
  });

  it("http(s) 以外の出典URLを拒否する", () => {
    expect(MarketRecord.safeParse({ ...validMarket, source_url: "ftp://example.com/x" }).success).toBe(false);
    expect(MarketRecord.safeParse({ ...validMarket, source_url: "不明" }).success).toBe(false);
  });

  it("未定義の取得方法・区分を拒否する", () => {
    expect(MarketRecord.safeParse({ ...validMarket, method: "guess" }).success).toBe(false);
    expect(MarketRecord.safeParse({ ...validMarket, measurement: "rumor" }).success).toBe(false);
  });

  it("推定値に estimation_basis がないと拒否する", () => {
    const r = MarketRecord.safeParse({ ...validMarket, measurement: "estimated" });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("estimation_basis");
  });

  it("推定値に根拠があれば受け付ける", () => {
    const r = MarketRecord.safeParse({
      ...validMarket,
      measurement: "estimated",
      estimation_basis: {
        based_on: ["2026-10-23-001", "2026-10-23-002"],
        formula: "2件の価格の平均",
        assumptions: ["価格は取得時点のもの"],
      },
    });
    expect(r.success).toBe(true);
  });

  it("推定以外で estimation_basis を書くと拒否する（区分の取り違え防止）", () => {
    const r = MarketRecord.safeParse({
      ...validMarket,
      estimation_basis: { based_on: ["x"], formula: "y" },
    });
    expect(r.success).toBe(false);
  });

  it("自社実績は owner_dashboard / manual 以外の取得方法を拒否する", () => {
    const base = { ...validMarket, measurement: "self_reported", collected_by: "owner" };
    expect(MarketRecord.safeParse({ ...base, method: "web_fetch" }).success).toBe(false);
    expect(MarketRecord.safeParse({ ...base, method: "owner_dashboard" }).success).toBe(true);
  });

  it("他者の売上を実測として記録するには公開表示箇所の notes が必要", () => {
    const sales = { ...validMarket, metrics: { sales_count: 100 } };
    expect(MarketRecord.safeParse(sales).success).toBe(false);
    expect(
      MarketRecord.safeParse({ ...sales, notes: "記事ページ上部に「100部突破」と著者が表示" }).success,
    ).toBe(true);
  });

  it("id の形式が違うと拒否する", () => {
    expect(MarketRecord.safeParse({ ...validMarket, id: "2026-10-23-1" }).success).toBe(false);
  });
});

describe("ThemeRecord（テーマ）", () => {
  const theme = {
    id: "flutter-demo-app",
    title: "Flutterでデモアプリを1日で作る",
    genre: "demo_app",
    status: "candidate",
    scores: { demand: 3, competition: 2, owner_strength: 5, production_cost: 3 },
    rationale: "オーナーの得意分野",
    decided_by: "marketing-strategist",
    updated_at: "2026-10-23T12:00:00+09:00",
  };

  it("候補テーマは根拠IDなしでも記録できる", () => {
    expect(ThemeRecord.safeParse(theme).success).toBe(true);
  });

  it("selected には根拠となる市場データIDが必要", () => {
    expect(ThemeRecord.safeParse({ ...theme, status: "selected" }).success).toBe(false);
    expect(
      ThemeRecord.safeParse({ ...theme, status: "selected", evidence_ids: ["2026-10-23-001"] }).success,
    ).toBe(true);
  });

  it("スコアは1〜5の整数", () => {
    expect(ThemeRecord.safeParse({ ...theme, scores: { ...theme.scores, demand: 6 } }).success).toBe(false);
    expect(ThemeRecord.safeParse({ ...theme, scores: { ...theme.scores, demand: 2.5 } }).success).toBe(false);
  });

  it("未定義のジャンルを拒否する", () => {
    expect(ThemeRecord.safeParse({ ...theme, genre: "cooking" }).success).toBe(false);
  });
});

describe("ArticleMeta（記事メタ情報）", () => {
  const meta = {
    id: "flutter-demo-001",
    status: "idea",
    created_at: "2026-10-23T12:00:00+09:00",
    updated_at: "2026-10-23T12:00:00+09:00",
  };

  it("最小構成を受け付け、既定値を補う", () => {
    const parsed = ArticleMeta.parse(meta);
    expect(parsed.history).toEqual([]);
    expect(parsed.published_url).toBeNull();
  });

  it("未定義の状態を拒否する", () => {
    expect(ArticleMeta.safeParse({ ...meta, status: "done" }).success).toBe(false);
  });

  it("id に大文字や空白を含むと拒否する", () => {
    expect(ArticleMeta.safeParse({ ...meta, id: "My Article" }).success).toBe(false);
  });
});

describe("QaReport（品質チェック）", () => {
  it("fail に severity がないと拒否する", () => {
    const r = QaReport.safeParse({
      article_id: "a",
      checked_at: "2026-10-23T12:00:00+09:00",
      checked_by: "quality-analyst",
      results: [{ id: "F1", status: "fail" }],
      verdict: "needs_revision",
    });
    expect(r.success).toBe(false);
  });
});

describe("ApprovalRecord（承認記録）", () => {
  const approval = {
    article_id: "flutter-demo-001",
    approver: "owner",
    approved_at: "2026-10-23T15:00:00+09:00",
    content_sha256: "a".repeat(64),
  };

  it("正しい承認記録を受け付ける", () => {
    expect(ApprovalRecord.safeParse(approval).success).toBe(true);
  });

  it.each(["quality-analyst", "orchestrator"])("AI（%s）を承認者にできない", (approver) => {
    expect(ApprovalRecord.safeParse({ ...approval, approver }).success).toBe(false);
  });

  it("ハッシュ形式が不正なら拒否する", () => {
    expect(ApprovalRecord.safeParse({ ...approval, content_sha256: "abc" }).success).toBe(false);
  });
});
