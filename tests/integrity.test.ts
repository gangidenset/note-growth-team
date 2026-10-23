import { rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { approveArticle, createArticle, recordPublication, transitionArticle } from "../src/app/articles.js";
import { checkIntegrity } from "../src/app/integrity.js";
import type { Repository } from "../src/storage/repository.js";
import { FREE_MD, PAID_MD, makeTempRepo, marketRecord, passedQa, selectedTheme, writeJson, writeText } from "./helpers.js";

const ID = "flutter-demo-001";
const NOTE_URL = "https://note.com/someone/n/n1234567890ab";

function messages(repo: Repository): string {
  return checkIntegrity(repo).map((i) => `${i.target}: ${i.message}`).join("\n");
}

/** 公開まで正しく進めたリポジトリ */
function publishedRepo(): Repository {
  const repo = makeTempRepo();
  writeJson(repo, "data/market/2026-10-23-001.json", marketRecord);
  writeJson(repo, "data/themes/flutter-demo.json", selectedTheme);
  createArticle(repo, { id: ID, themeId: "flutter-demo", title: "T", priceJpy: 980 });
  for (const to of ["researching", "planning", "drafting"] as const) transitionArticle(repo, ID, to);
  writeText(repo, `data/articles/${ID}/free.md`, FREE_MD);
  writeText(repo, `data/articles/${ID}/paid.md`, PAID_MD);
  transitionArticle(repo, ID, "qa");
  writeJson(repo, `data/articles/${ID}/qa.json`, passedQa(ID));
  transitionArticle(repo, ID, "awaiting_approval");
  approveArticle(repo, ID, "owner");
  recordPublication(repo, ID, NOTE_URL);
  return repo;
}

describe("checkIntegrity", () => {
  it("空のデータ・正しく進めたデータでは問題なし", () => {
    expect(checkIntegrity(makeTempRepo())).toEqual([]);
    expect(checkIntegrity(publishedRepo())).toEqual([]);
  });

  it("meta.json の status を直接 approved に書き換えると検出する", () => {
    const repo = makeTempRepo();
    createArticle(repo, { id: ID });
    repo.writeMeta({ ...repo.readMeta(ID), status: "approved" });
    const text = messages(repo);
    expect(text).toContain("履歴の最後");
    expect(text).toContain("承認記録");
  });

  it("履歴ごと偽装して AI が approved にしたことも検出する", () => {
    const repo = makeTempRepo();
    createArticle(repo, { id: ID });
    const meta = repo.readMeta(ID);
    repo.writeMeta({
      ...meta,
      status: "approved",
      history: [{ from: "idea", to: "approved", at: meta.created_at, by: "ai", reason: "" }],
    });
    expect(messages(repo)).toContain("オーナー以外");
  });

  it("公開後に本文を変えると検出する", () => {
    const repo = publishedRepo();
    writeText(repo, `data/articles/${ID}/paid.md`, `${PAID_MD}追記\n`);
    expect(messages(repo)).toContain("承認時と一致しません");
  });

  it("承認記録が消えた公開記事を検出する", () => {
    const repo = publishedRepo();
    rmSync(`${repo.root}/data/approvals/${ID}.json`);
    expect(messages(repo)).toContain("承認記録");
  });

  it("記事のない承認記録・中身の食い違う承認記録を検出する", () => {
    const repo = publishedRepo();
    writeJson(repo, "data/approvals/ghost.json", {
      article_id: "other",
      approver: "owner",
      approved_at: "2026-10-23T15:00:00+09:00",
      content_sha256: "a".repeat(64),
    });
    const text = messages(repo);
    expect(text).toContain("ファイル名と一致しません");
    expect(text).toContain("対応する記事");
  });

  it("不正な市場データ・存在しない根拠IDのテーマを検出する", () => {
    const repo = makeTempRepo();
    writeJson(repo, "data/market/2026-10-23-001.json", { ...marketRecord, measurement: "estimated" });
    writeJson(repo, "data/themes/flutter-demo.json", selectedTheme);
    const text = messages(repo);
    expect(text).toContain("estimation_basis");
    expect(text).toContain("根拠の市場データ 2026-10-23-001");
  });

  it("未来の取得日時・更新日時を検出する（5分までは許容）", () => {
    const repo = makeTempRepo(); // 時計は 2026-10-23T03:00:00Z 付近（= 12:00 JST）
    writeJson(repo, "data/market/2026-10-23-001.json", { ...marketRecord, retrieved_at: "2026-10-23T12:03:00+09:00" });
    expect(checkIntegrity(repo)).toEqual([]);
    writeJson(repo, "data/market/2026-10-23-001.json", { ...marketRecord, retrieved_at: "2026-10-23T14:55:00+09:00" });
    writeJson(repo, "data/themes/flutter-demo.json", { ...selectedTheme, updated_at: "2026-10-24T09:00:00+09:00" });
    const text = messages(repo);
    expect(text).toContain("retrieved_at（2026-10-23T14:55:00+09:00）が未来");
    expect(text).toContain("updated_at（2026-10-24T09:00:00+09:00）が未来");
  });

  it("壊れた監査ログの行を検出する", () => {
    const repo = makeTempRepo();
    writeText(repo, "data/audit.log.jsonl", "{壊れた行\n");
    expect(messages(repo)).toContain("監査ログ");
  });
});
