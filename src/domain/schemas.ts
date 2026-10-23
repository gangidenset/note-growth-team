/**
 * データ構造の定義と検証（zod）。
 * 「出典が欠けた市場データは保存できない」などの要件は、ここで機械的に強制する。
 * 仕様: docs/requirements.md FR-1〜FR-5、.claude/skills/source-recording/SKILL.md
 */
import { z } from "zod";

// ---------- 共通 ----------

/** タイムゾーン付きの ISO 8601 日時（例: 2026-10-23T10:15:00+09:00）。タイムゾーンなしは拒否。 */
export const zonedDateTime = z.iso.datetime({ offset: true });

const httpUrl = z.url({ protocol: /^https?$/ });

export const AGENT_NAMES = [
  "market-researcher",
  "marketing-strategist",
  "editor-writer",
  "quality-analyst",
] as const;

/** 記録者: AI社員 または オーナー */
export const Collector = z.enum([...AGENT_NAMES, "owner"]);

// ---------- 市場データ ----------

export const MARKET_METHODS = [
  "manual",
  "web_search",
  "web_fetch",
  "official_api",
  "owner_dashboard",
] as const;
export const MEASUREMENTS = ["observed", "estimated", "self_reported"] as const;

/**
 * 売上・購入数を表す指標キー。他者のこれらの値は原則非公開のため、記録に追加条件を課す。
 */
export const SALES_METRIC_KEYS = [
  "sales_count",
  "purchases",
  "units_sold",
  "revenue_jpy",
  "sales_jpy",
] as const;

export const EstimationBasis = z.object({
  /** 推定の元にした市場データID */
  based_on: z.array(z.string().min(1)).min(1),
  /** 計算式や推論の手順 */
  formula: z.string().min(1),
  /** 置いた仮定 */
  assumptions: z.array(z.string().min(1)).default([]),
});

export const MarketRecord = z
  .object({
    id: z.string().regex(/^\d{4}-\d{2}-\d{2}-\d{3}$/, "id は YYYY-MM-DD-NNN 形式"),
    topic: z.string().min(1),
    source_url: httpUrl,
    source_title: z.string().min(1),
    retrieved_at: zonedDateTime,
    method: z.enum(MARKET_METHODS),
    measurement: z.enum(MEASUREMENTS),
    metrics: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).default({}),
    estimation_basis: EstimationBasis.nullable().default(null),
    notes: z.string().default(""),
    collected_by: Collector,
  })
  .superRefine((r, ctx) => {
    if (r.measurement === "estimated" && r.estimation_basis === null) {
      ctx.addIssue({
        code: "custom",
        path: ["estimation_basis"],
        message: "推定値（estimated）には estimation_basis（根拠・計算式）が必須です",
      });
    }
    if (r.measurement !== "estimated" && r.estimation_basis !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["estimation_basis"],
        message: "estimation_basis は推定値（estimated）のときだけ記録します",
      });
    }
    if (
      r.measurement === "self_reported" &&
      r.method !== "owner_dashboard" &&
      r.method !== "manual"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["method"],
        message: "自社実績（self_reported）は owner_dashboard か manual で取得したものに限ります",
      });
    }
    const salesKeys = Object.keys(r.metrics).filter((k) =>
      (SALES_METRIC_KEYS as readonly string[]).includes(k),
    );
    if (salesKeys.length > 0 && r.measurement === "observed" && r.notes.trim() === "") {
      ctx.addIssue({
        code: "custom",
        path: ["notes"],
        message: `売上・購入数（${salesKeys.join(", ")}）を実測として記録する場合は、ページ上のどこに公開表示されていたかを notes に書いてください`,
      });
    }
  });
export type MarketRecord = z.infer<typeof MarketRecord>;

// ---------- テーマ ----------

export const GENRES = [
  "app_dev",
  "demo_app",
  "shogi",
  "slot",
  "tennis",
  "game_switch2",
  "other",
] as const;

const score = z.number().int().min(1).max(5);

export const ThemeRecord = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "id は英小文字・数字・ハイフン"),
    title: z.string().min(1),
    genre: z.enum(GENRES),
    status: z.enum(["candidate", "selected", "rejected"]),
    /** 根拠となる市場データID */
    evidence_ids: z.array(z.string().min(1)).default([]),
    scores: z.object({
      demand: score,
      competition: score,
      owner_strength: score,
      production_cost: score,
    }),
    rationale: z.string().min(1),
    /** 未検証の仮説（計画値・推測はここに書く） */
    hypotheses: z.array(z.string()).default([]),
    price_plan_jpy: z.number().int().positive().nullable().default(null),
    decided_by: Collector,
    updated_at: zonedDateTime,
  })
  .superRefine((t, ctx) => {
    if (t.status === "selected" && t.evidence_ids.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["evidence_ids"],
        message: "選定（selected）したテーマには根拠となる市場データIDが1つ以上必要です",
      });
    }
  });
export type ThemeRecord = z.infer<typeof ThemeRecord>;

// ---------- 記事 ----------

export const ARTICLE_STATES = [
  "idea",
  "researching",
  "planning",
  "drafting",
  "qa",
  "needs_revision",
  "awaiting_approval",
  "approved",
  "published",
  "archived",
] as const;
export const ArticleState = z.enum(ARTICLE_STATES);
export type ArticleState = z.infer<typeof ArticleState>;

export const Actor = z.enum(["ai", "owner"]);
export type Actor = z.infer<typeof Actor>;

export const HistoryEntry = z.object({
  from: ArticleState,
  to: ArticleState,
  at: zonedDateTime,
  by: Actor,
  reason: z.string().default(""),
});

export const ArticleMeta = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "id は英小文字・数字・ハイフン"),
  theme_id: z.string().min(1).nullable().default(null),
  status: ArticleState,
  title: z.string().default(""),
  price_jpy: z.number().int().positive().nullable().default(null),
  published_url: httpUrl.nullable().default(null),
  created_at: zonedDateTime,
  updated_at: zonedDateTime,
  history: z.array(HistoryEntry).default([]),
});
export type ArticleMeta = z.infer<typeof ArticleMeta>;

// ---------- 品質チェック ----------

export const QA_CHECK_IDS = [
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11",
] as const;

export const QaResult = z
  .object({
    id: z.enum(QA_CHECK_IDS),
    status: z.enum(["pass", "fail", "not_checked"]),
    severity: z.enum(["critical", "major", "minor"]).nullable().default(null),
    note: z.string().default(""),
  })
  .refine((r) => r.status !== "fail" || r.severity !== null, {
    message: "fail の項目には severity が必要です",
    path: ["severity"],
  });

export const QaReport = z.object({
  article_id: z.string().min(1),
  checked_at: zonedDateTime,
  checked_by: Collector,
  results: z.array(QaResult),
  verdict: z.enum(["ready_for_approval", "needs_revision"]),
});
export type QaReport = z.infer<typeof QaReport>;

// ---------- 承認 ----------

export const ApprovalRecord = z.object({
  article_id: z.string().min(1),
  /** 承認者はオーナー（人間）の名前。AI社員名は不可 */
  approver: z
    .string()
    .min(1)
    .refine((n) => !(AGENT_NAMES as readonly string[]).includes(n), {
      message: "AI社員は承認者になれません",
    }),
  approved_at: zonedDateTime,
  content_sha256: z.string().regex(/^[a-f0-9]{64}$/, "SHA-256（16進64文字）"),
  note: z.string().default(""),
});
export type ApprovalRecord = z.infer<typeof ApprovalRecord>;
