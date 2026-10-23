/**
 * data/ 全体の整合性チェック（npm run data:check）。
 * 「承認記録のない approved 記事」「承認後に本文が変わった published 記事」
 * 「コマンドを通さずに書き換えられた状態」などを検出する。
 * 仕様: docs/architecture.md §4 第5層、docs/implementation-plan.md 手順9
 */
import { DomainError, type Repository } from "../storage/repository.js";
import { approvalMatches } from "./articles.js";

export interface IntegrityIssue {
  target: string;
  message: string;
}

function messagesOf(e: unknown): string[] {
  return e instanceof DomainError ? e.messages : [String(e)];
}

export function checkIntegrity(repo: Repository): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const add = (target: string, message: string) => issues.push({ target, message });

  // 市場データ
  const market = repo.loadMarketRecords();
  for (const r of market) for (const e of r.errors) add(`data/market/${r.file}`, e);
  const marketIds = new Set(market.flatMap((r) => (r.record ? [r.record.id] : [])));

  // テーマ
  for (const { file, theme, errors } of repo.loadThemes()) {
    for (const e of errors) add(`data/themes/${file}`, e);
    if (!theme) continue;
    for (const id of theme.evidence_ids) {
      if (!marketIds.has(id)) add(`data/themes/${file}`, `根拠の市場データ ${id} が存在しないか不正です`);
    }
  }

  // 記事
  const articleIds = repo.listArticleIds();
  for (const id of articleIds) {
    const target = `data/articles/${id}`;
    let meta;
    try {
      meta = repo.readMeta(id);
      repo.readQa(id);
    } catch (e) {
      for (const m of messagesOf(e)) add(target, m);
      continue;
    }

    // 状態は履歴の最後と一致するはず（meta.json の status を直接書き換えると不一致になる）
    const last = meta.history.at(-1);
    const expected = last ? last.to : "idea";
    if (meta.status !== expected) {
      add(target, `状態 ${meta.status} が履歴の最後（${expected}）と一致しません。コマンドを通さずに書き換えられた可能性があります`);
    }
    for (const [i, h] of meta.history.entries()) {
      const prev = i === 0 ? "idea" : meta.history[i - 1]!.to;
      if (h.from !== prev) add(target, `履歴 ${i + 1} 件目の遷移元 ${h.from} が直前の状態 ${prev} と一致しません`);
      if ((h.to === "approved" || h.to === "published" || h.to === "archived") && h.by !== "owner") {
        add(target, `${h.to} への遷移がオーナー以外（${h.by}）によって記録されています`);
      }
    }

    if (meta.status === "approved" || meta.status === "published") {
      try {
        if (!repo.readApproval(id)) {
          add(target, `${meta.status} なのに承認記録 data/approvals/${id}.json がありません`);
        } else if (!approvalMatches(repo, meta)) {
          add(target, `${meta.status} だが本文・タイトル・価格が承認時と一致しません（再承認が必要）`);
        }
      } catch (e) {
        for (const m of messagesOf(e)) add(`data/approvals/${id}.json`, m);
      }
    }
    if (meta.status === "published" && !meta.published_url) {
      add(target, "published なのに公開URLが記録されていません");
    }
  }

  // 承認記録
  const known = new Set(articleIds);
  for (const id of repo.listApprovalIds()) {
    const target = `data/approvals/${id}.json`;
    try {
      const approval = repo.readApproval(id);
      if (approval && approval.article_id !== id) add(target, `article_id（${approval.article_id}）がファイル名と一致しません`);
    } catch (e) {
      for (const m of messagesOf(e)) add(target, m);
      continue;
    }
    if (!known.has(id)) add(target, `対応する記事 data/articles/${id} がありません`);
  }

  // 監査ログ
  try {
    repo.readAudit();
  } catch (e) {
    add("data/audit.log.jsonl", `監査ログに読めない行があります: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  }

  return issues;
}
