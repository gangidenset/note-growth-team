/**
 * 記事パッケージの状態機械（純粋関数のみ。ファイル入出力は持たない）。
 * 仕様: docs/architecture.md §3「記事の状態機械」、.claude/skills/approval-workflow/SKILL.md
 *
 * 重要: approved / published / archived への遷移は owner（人間）だけが実行できる。
 */
import type { Actor, ArticleState, QaReport } from "./schemas.js";

/** 遷移の判定に必要な情報。ファイルの読み込みは呼び出し側（CLI）が行って渡す。 */
export interface TransitionContext {
  actor: Actor;
  /** 遷移理由（差し戻し・中止などでは必須） */
  reason?: string;
  /** テーマに紐づく市場データの件数 */
  marketEvidenceCount?: number;
  /** テーマが selected として記録済みか */
  hasSelectedTheme?: boolean;
  hasFreeDraft?: boolean;
  hasPaidDraft?: boolean;
  /** paid.md 内の `<!-- paywall -->` の個数 */
  paywallCount?: number;
  qa?: QaReport | null;
  /** 承認記録が存在し、その content_sha256 が現在の本文ハッシュと一致するか */
  approvalMatchesContent?: boolean;
  publishedUrl?: string;
}

export type TransitionResult = { ok: true } | { ok: false; errors: string[] };

type Guard = (ctx: TransitionContext) => string[];

interface TransitionRule {
  from: ArticleState;
  to: ArticleState;
  /** 実行できる者 */
  actors: readonly Actor[];
  guard?: Guard;
}

const BOTH: readonly Actor[] = ["ai", "owner"];
const OWNER_ONLY: readonly Actor[] = ["owner"];

/** AI が遷移させてはいけない行き先 */
export const OWNER_ONLY_TARGETS: readonly ArticleState[] = ["approved", "published", "archived"];

const requireReason: Guard = (ctx) =>
  ctx.reason && ctx.reason.trim() !== "" ? [] : ["理由（reason）の記載が必要です"];

const requireMarketEvidence: Guard = (ctx) =>
  (ctx.marketEvidenceCount ?? 0) > 0 ? [] : ["市場データ（出典付き）が1件以上必要です"];

const requireSelectedTheme: Guard = (ctx) =>
  ctx.hasSelectedTheme ? [] : ["selected 状態のテーマ記録が必要です"];

const requireDrafts: Guard = (ctx) => {
  const errors: string[] = [];
  if (!ctx.hasFreeDraft) errors.push("無料記事 free.md がありません");
  if (!ctx.hasPaidDraft) errors.push("有料記事 paid.md がありません");
  if (ctx.paywallCount !== 1) {
    errors.push(
      `paid.md の <!-- paywall --> はちょうど1つ必要です（現在 ${ctx.paywallCount ?? 0} 個）`,
    );
  }
  return errors;
};

const requirePassedQa: Guard = (ctx) => {
  const qa = ctx.qa;
  if (!qa) return ["品質チェック結果 qa.json がありません"];
  const errors: string[] = [];
  const critical = qa.results.filter((r) => r.status === "fail" && r.severity === "critical");
  if (critical.length > 0) {
    errors.push(`重大（critical）な指摘が残っています: ${critical.map((r) => r.id).join(", ")}`);
  }
  const unchecked = qa.results.filter((r) => r.status === "not_checked");
  if (unchecked.length > 0) {
    errors.push(`未チェックの項目があります: ${unchecked.map((r) => r.id).join(", ")}`);
  }
  if (qa.verdict !== "ready_for_approval") {
    errors.push("品質チェックの判定が ready_for_approval ではありません");
  }
  return errors;
};

const requireApprovalMatch: Guard = (ctx) =>
  ctx.approvalMatchesContent
    ? []
    : ["承認記録がない、または承認後に本文が変更されています（再承認が必要）"];

const requireNoteUrl: Guard = (ctx) => {
  if (!ctx.publishedUrl) return ["公開URLが必要です"];
  try {
    const url = new URL(ctx.publishedUrl);
    const host = url.hostname;
    if (url.protocol === "https:" && (host === "note.com" || host.endsWith(".note.com"))) return [];
  } catch {
    // 下で同じエラーを返す
  }
  return ["公開URLは https://note.com/ の記事URLである必要があります"];
};

const all =
  (...guards: Guard[]): Guard =>
  (ctx) =>
    guards.flatMap((g) => g(ctx));

const RULES: readonly TransitionRule[] = [
  { from: "idea", to: "researching", actors: BOTH },
  { from: "researching", to: "planning", actors: BOTH, guard: requireMarketEvidence },
  { from: "planning", to: "drafting", actors: BOTH, guard: requireSelectedTheme },
  { from: "drafting", to: "qa", actors: BOTH, guard: requireDrafts },
  { from: "qa", to: "awaiting_approval", actors: BOTH, guard: all(requireDrafts, requirePassedQa) },
  { from: "qa", to: "needs_revision", actors: BOTH, guard: requireReason },
  { from: "awaiting_approval", to: "needs_revision", actors: BOTH, guard: requireReason },
  { from: "needs_revision", to: "planning", actors: BOTH },
  { from: "needs_revision", to: "drafting", actors: BOTH },
  { from: "awaiting_approval", to: "approved", actors: OWNER_ONLY, guard: requireApprovalMatch },
  // 承認後に本文が変わった場合などの承認取り消し（安全側の遷移なので AI も可）
  { from: "approved", to: "awaiting_approval", actors: BOTH, guard: requireReason },
  {
    from: "approved",
    to: "published",
    actors: OWNER_ONLY,
    guard: all(requireApprovalMatch, requireNoteUrl),
  },
  // 中止はどの状態からでも（archived 自身を除く）オーナーのみ
  ...(
    [
      "idea",
      "researching",
      "planning",
      "drafting",
      "qa",
      "needs_revision",
      "awaiting_approval",
      "approved",
      "published",
    ] as const
  ).map(
    (from): TransitionRule => ({ from, to: "archived", actors: OWNER_ONLY, guard: requireReason }),
  ),
];

function findRule(from: ArticleState, to: ArticleState): TransitionRule | undefined {
  return RULES.find((r) => r.from === from && r.to === to);
}

/** 遷移が可能かを判定する。状態は変更しない。 */
export function checkTransition(
  from: ArticleState,
  to: ArticleState,
  ctx: TransitionContext,
): TransitionResult {
  const rule = findRule(from, to);
  if (!rule) {
    return { ok: false, errors: [`${from} から ${to} への遷移は定義されていません`] };
  }
  if (!rule.actors.includes(ctx.actor)) {
    return {
      ok: false,
      errors: [`${to} への遷移はオーナー（人間）だけが実行できます`],
    };
  }
  const errors = rule.guard ? rule.guard(ctx) : [];
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/** ある状態から、その実行者が（ガード条件を除いて）遷移しうる行き先の一覧 */
export function nextStates(from: ArticleState, actor: Actor): ArticleState[] {
  return RULES.filter((r) => r.from === from && r.actors.includes(actor)).map((r) => r.to);
}
