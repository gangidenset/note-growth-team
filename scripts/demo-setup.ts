/**
 * npm run demo:setup
 * 承認・公開記録の流れを試すための練習用データを、一時フォルダに作る。
 * 記事を awaiting_approval（承認待ち）まで進めるだけで、承認はしない。本物の data/ には触れない。
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createArticle, transitionArticle } from "../src/app/articles.js";
import { Repository } from "../src/storage/repository.js";

export const DEMO_ARTICLE_ID = "demo-001";

function writeFile(root: string, relPath: string, content: string): void {
  const path = join(root, relPath);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

/** 練習用データを root に作り、記事を承認待ちまで進める */
export function setupDemo(root: string): Repository {
  process.env.TZ ??= "Asia/Tokyo";
  const repo = new Repository(root);
  const now = repo.now();
  const id = DEMO_ARTICLE_ID;

  writeFile(root, "data/market/2026-01-01-001.json", JSON.stringify({
    id: "2026-01-01-001",
    topic: "【練習用】デモアプリ作成",
    source_url: "https://example.com/demo-source",
    source_title: "練習用の架空の出典（実在のデータではありません）",
    retrieved_at: now,
    method: "manual",
    measurement: "observed",
    metrics: {},
    notes: "承認フローの練習用ダミーデータ",
    collected_by: "owner",
  }, null, 2));

  writeFile(root, "data/themes/demo-theme.json", JSON.stringify({
    id: "demo-theme",
    title: "【練習用】デモアプリを作る",
    genre: "demo_app",
    status: "selected",
    evidence_ids: ["2026-01-01-001"],
    scores: { demand: 3, competition: 3, owner_strength: 3, production_cost: 3 },
    rationale: "承認フローの練習用",
    decided_by: "owner",
    updated_at: now,
  }, null, 2));

  createArticle(repo, { id, themeId: "demo-theme", title: "【練習用】デモ記事", priceJpy: 500 });
  transitionArticle(repo, id, "researching");
  transitionArticle(repo, id, "planning");
  transitionArticle(repo, id, "drafting");

  writeFile(root, `data/articles/${id}/free.md`, "# 【練習用】無料記事\n\nこれは承認フローを試すための練習用の記事です。\n");
  writeFile(root, `data/articles/${id}/paid.md`, "# 【練習用】有料記事\n\n無料で読める部分です。\n\n<!-- paywall -->\n\nここから有料部分です。\n");
  transitionArticle(repo, id, "qa");

  writeFile(root, `data/articles/${id}/qa.json`, JSON.stringify({
    article_id: id,
    checked_at: repo.now(),
    checked_by: "quality-analyst",
    results: [{ id: "F1", status: "pass", severity: null, note: "練習用" }],
    verdict: "ready_for_approval",
  }, null, 2));
  transitionArticle(repo, id, "awaiting_approval");
  return repo;
}

// npm run demo:setup で直接実行されたときだけ動く（テストから import した場合は動かない）
if (process.argv[1]?.endsWith("demo-setup.ts")) {
  const root = mkdtempSync(join(tmpdir(), "ngt-demo-"));
  setupDemo(root);
  const id = DEMO_ARTICLE_ID;
  const setRoot =
    process.platform === "win32" ? `$env:NGT_ROOT="${root}"` : `export NGT_ROOT="${root}"`;
  console.log(`練習用データを作りました: ${root}`);
  console.log(`記事 ${id} は「承認待ち（awaiting_approval）」です。本物の data/ は変更していません。\n`);
  console.log("次のコマンドを、上から1行ずつ実行してください（1行目を飛ばすと本物の data/ を見てしまいます）:\n");
  console.log(`  1. ${setRoot}`);
  console.log(`  2. npm run approve -- ${id}        （記事IDの入力を求められたら ${id} と入力）`);
  console.log(`  3. npm run publish:record -- ${id} https://note.com/demo/n/n0000000000   （yes と入力）`);
  console.log("  4. npm run article:status");
  console.log("  5. npm run data:check");
  if (process.platform === "win32") {
    console.log("\n（Mac / Linux の場合、1. は export NGT_ROOT=\"...\" の形になります）");
  }
}
