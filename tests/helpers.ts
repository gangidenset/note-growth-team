import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Repository } from "../src/storage/repository.js";

/** 一時ディレクトリに空の data/ を持つリポジトリを作る。時計は1秒ずつ進む固定値。 */
export function makeTempRepo(): Repository {
  const root = mkdtempSync(join(tmpdir(), "ngt-test-"));
  mkdirSync(join(root, "data"), { recursive: true });
  let t = Date.parse("2026-10-23T03:00:00Z");
  return new Repository(root, () => new Date((t += 1000)));
}

export function writeJson(repo: Repository, relPath: string, data: unknown): void {
  const path = join(repo.root, relPath);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

export function writeText(repo: Repository, relPath: string, text: string): void {
  const path = join(repo.root, relPath);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
}

export const marketRecord = {
  id: "2026-10-23-001",
  topic: "Flutterで作るデモアプリ",
  source_url: "https://note.com/example/n/n0000000000",
  source_title: "例: 記事タイトル",
  retrieved_at: "2026-10-23T10:15:00+09:00",
  method: "web_fetch",
  measurement: "observed",
  metrics: { price_jpy: 980 },
  collected_by: "market-researcher",
};

export const selectedTheme = {
  id: "flutter-demo",
  title: "Flutterでデモアプリを1日で作る",
  genre: "demo_app",
  status: "selected",
  evidence_ids: ["2026-10-23-001"],
  scores: { demand: 3, competition: 2, owner_strength: 5, production_cost: 3 },
  rationale: "オーナーの得意分野",
  decided_by: "marketing-strategist",
  updated_at: "2026-10-23T12:00:00+09:00",
};

export const FREE_MD = "# 無料記事\n\n本文です。\n";
export const PAID_MD = "# 有料記事\n\n無料部分\n\n<!-- paywall -->\n\n有料部分\n";

export function passedQa(articleId: string) {
  return {
    article_id: articleId,
    checked_at: "2026-10-23T12:30:00+09:00",
    checked_by: "quality-analyst",
    results: [{ id: "F1", status: "pass", severity: null, note: "" }],
    verdict: "ready_for_approval",
  };
}
