/**
 * 記事の操作（作成・遷移・承認・公開記録・中止・一覧）。
 * ファイルから状態機械の判定材料（TransitionContext）を組み立て、判定に通った操作だけを保存・監査ログに残す。
 * 端末が人間のものかの確認（TTY など）は CLI 側（src/cli/human-guard.ts）で行う。
 */
import { contentHash, countPaywalls } from "../domain/hash.js";
import type { Actor, ApprovalRecord, ArticleMeta, ArticleState } from "../domain/schemas.js";
import { OWNER_ONLY_TARGETS, checkTransition, type TransitionContext } from "../domain/state-machine.js";
import { DomainError, type Repository } from "../storage/repository.js";

export interface NewArticleInput {
  id: string;
  themeId?: string | null;
  title?: string;
  priceJpy?: number | null;
}

export function createArticle(repo: Repository, input: NewArticleInput): ArticleMeta {
  repo.assertId(input.id);
  if (input.themeId) repo.assertId(input.themeId, "テーマID");
  if (repo.articleExists(input.id)) {
    throw new DomainError([`記事 "${input.id}" は既に存在します`]);
  }
  const now = repo.now();
  const meta: ArticleMeta = {
    id: input.id,
    theme_id: input.themeId ?? null,
    status: "idea",
    title: input.title ?? "",
    price_jpy: input.priceJpy ?? null,
    published_url: null,
    created_at: now,
    updated_at: now,
    history: [],
  };
  repo.writeMeta(meta);
  repo.appendAudit({ actor: "ai", action: "article_created", article_id: meta.id });
  return meta;
}

/** 現在の本文ハッシュ。free.md / paid.md のどちらかがなければ null */
export function currentContentHash(repo: Repository, meta: ArticleMeta): string | null {
  const free = repo.readDraft(meta.id, "free.md");
  const paid = repo.readDraft(meta.id, "paid.md");
  if (free === null || paid === null) return null;
  return contentHash({ title: meta.title, price_jpy: meta.price_jpy, free, paid });
}

/** 承認記録があり、その内容ハッシュが現在の本文と一致するか */
export function approvalMatches(repo: Repository, meta: ArticleMeta): boolean {
  const approval = repo.readApproval(meta.id);
  const hash = currentContentHash(repo, meta);
  return approval !== null && hash !== null && approval.content_sha256 === hash;
}

function buildContext(
  repo: Repository,
  meta: ArticleMeta,
  actor: Actor,
  extra: Partial<TransitionContext> = {},
): TransitionContext {
  const free = repo.readDraft(meta.id, "free.md");
  const paid = repo.readDraft(meta.id, "paid.md");
  const theme = meta.theme_id ? repo.readTheme(meta.theme_id) : null;
  const validMarketIds = new Set(
    repo.loadMarketRecords().flatMap((r) => (r.record ? [r.record.id] : [])),
  );
  return {
    actor,
    marketEvidenceCount: theme ? theme.evidence_ids.filter((id) => validMarketIds.has(id)).length : 0,
    hasSelectedTheme: theme?.status === "selected",
    hasFreeDraft: free !== null && free.trim() !== "",
    hasPaidDraft: paid !== null && paid.trim() !== "",
    paywallCount: paid === null ? 0 : countPaywalls(paid),
    qa: repo.readQa(meta.id),
    approvalMatchesContent: approvalMatches(repo, meta),
    ...extra,
  };
}

function applyTransition(
  repo: Repository,
  meta: ArticleMeta,
  to: ArticleState,
  actor: Actor,
  reason: string,
  changes: Partial<ArticleMeta> = {},
): ArticleMeta {
  const at = repo.now();
  const updated: ArticleMeta = {
    ...meta,
    ...changes,
    status: to,
    updated_at: at,
    history: [...meta.history, { from: meta.status, to, at, by: actor, reason }],
  };
  repo.writeMeta(updated);
  return updated;
}

/**
 * 通常の状態遷移（npm run article:transition）。
 * approved / published / archived へは、専用のオーナー用コマンドでしか進めない。
 */
export function transitionArticle(
  repo: Repository,
  id: string,
  to: ArticleState,
  reason = "",
): ArticleMeta {
  if (OWNER_ONLY_TARGETS.includes(to)) {
    const command = { approved: "approve", published: "publish:record", archived: "article:archive" }[
      to as "approved" | "published" | "archived"
    ];
    throw new DomainError([
      `${to} への遷移はオーナー（人間）だけが実行できます。`,
      `オーナー自身のターミナルで npm run ${command} を実行してください。`,
    ]);
  }
  const meta = repo.readMeta(id);
  const result = checkTransition(meta.status, to, buildContext(repo, meta, "ai", { reason }));
  if (!result.ok) throw new DomainError(result.errors);
  const updated = applyTransition(repo, meta, to, "ai", reason);
  repo.appendAudit({ actor: "ai", action: "transition", article_id: id, from: meta.status, to, reason });
  return updated;
}

/** 承認（オーナー専用）。現在の本文ハッシュで承認記録を作る。 */
export function approveArticle(
  repo: Repository,
  id: string,
  approver: string,
  note = "",
): ApprovalRecord {
  const meta = repo.readMeta(id);
  if (meta.status !== "awaiting_approval") {
    throw new DomainError([`承認できるのは awaiting_approval の記事だけです（現在: ${meta.status}）`]);
  }
  const hash = currentContentHash(repo, meta);
  if (hash === null) throw new DomainError(["free.md と paid.md がそろっていません"]);

  const record: ApprovalRecord = {
    article_id: id,
    approver,
    approved_at: repo.now(),
    content_sha256: hash,
    note,
  };
  // 書き込む承認記録は現在の本文と一致するので approvalMatchesContent は true として判定する
  const result = checkTransition(
    meta.status,
    "approved",
    buildContext(repo, meta, "owner", { approvalMatchesContent: true }),
  );
  if (!result.ok) throw new DomainError(result.errors);

  repo.writeApproval(record);
  applyTransition(repo, meta, "approved", "owner", note);
  repo.appendAudit({
    actor: "owner",
    action: "approved",
    article_id: id,
    from: meta.status,
    to: "approved",
    content_sha256: hash,
  });
  return record;
}

/** 公開記録（オーナー専用）。note で手動投稿したあとに URL を記録する。 */
export function recordPublication(repo: Repository, id: string, url: string): ArticleMeta {
  const meta = repo.readMeta(id);
  const result = checkTransition(meta.status, "published", buildContext(repo, meta, "owner", { publishedUrl: url }));
  if (!result.ok) throw new DomainError(result.errors);
  const updated = applyTransition(repo, meta, "published", "owner", "", { published_url: url });
  repo.appendAudit({
    actor: "owner",
    action: "published",
    article_id: id,
    from: meta.status,
    to: "published",
    url,
    content_sha256: currentContentHash(repo, meta) ?? undefined,
  });
  return updated;
}

/** 中止（オーナー専用） */
export function archiveArticle(repo: Repository, id: string, reason: string): ArticleMeta {
  const meta = repo.readMeta(id);
  const result = checkTransition(meta.status, "archived", buildContext(repo, meta, "owner", { reason }));
  if (!result.ok) throw new DomainError(result.errors);
  const updated = applyTransition(repo, meta, "archived", "owner", reason);
  repo.appendAudit({ actor: "owner", action: "archived", article_id: id, from: meta.status, to: "archived", reason });
  return updated;
}

export interface ArticleStatusRow {
  id: string;
  status: ArticleState;
  title: string;
  price_jpy: number | null;
  updated_at: string;
  /** 承認済み・公開済みなのに本文が承認時と違う場合の警告 */
  warning: string | null;
}

export function listArticleStatuses(repo: Repository): ArticleStatusRow[] {
  return repo.listArticleIds().map((id) => {
    const meta = repo.readMeta(id);
    let warning: string | null = null;
    if ((meta.status === "approved" || meta.status === "published") && !approvalMatches(repo, meta)) {
      warning =
        meta.status === "approved"
          ? "承認後に本文が変更されています。承認は無効です（awaiting_approval に戻して再承認が必要）"
          : "公開後に本文が承認時から変更されています";
    }
    return {
      id,
      status: meta.status,
      title: meta.title,
      price_jpy: meta.price_jpy,
      updated_at: meta.updated_at,
      warning,
    };
  });
}

export interface MarketValidationSummary {
  total: number;
  valid: number;
  invalid: { file: string; errors: string[] }[];
}

export function validateMarket(repo: Repository): MarketValidationSummary {
  const results = repo.loadMarketRecords();
  const invalid = results.filter((r) => r.errors.length > 0).map(({ file, errors }) => ({ file, errors }));
  return { total: results.length, valid: results.length - invalid.length, invalid };
}
