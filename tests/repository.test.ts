import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createArticle } from "../src/app/articles.js";
import { DomainError } from "../src/storage/repository.js";
import { makeTempRepo, marketRecord, writeJson, writeText } from "./helpers.js";

describe("Repository: 記事", () => {
  it("作成した記事を読み戻せる", () => {
    const repo = makeTempRepo();
    createArticle(repo, { id: "a-001", title: "T", priceJpy: 500 });
    const meta = repo.readMeta("a-001");
    expect(meta.status).toBe("idea");
    expect(meta.price_jpy).toBe(500);
    expect(repo.listArticleIds()).toEqual(["a-001"]);
  });

  it("同じIDの記事は二重に作れない", () => {
    const repo = makeTempRepo();
    createArticle(repo, { id: "a-001" });
    expect(() => createArticle(repo, { id: "a-001" })).toThrow(DomainError);
  });

  it.each(["../escape", "A-001", "a/b", "", "-a"])("不正なID %j はパスに使わない", (id) => {
    const repo = makeTempRepo();
    expect(() => createArticle(repo, { id })).toThrow(DomainError);
    expect(() => repo.readApproval(id)).toThrow(DomainError);
  });

  it("壊れた meta.json は分かりやすいエラーになる", () => {
    const repo = makeTempRepo();
    writeText(repo, "data/articles/a-001/meta.json", "{ not json");
    expect(() => repo.readMeta("a-001")).toThrow(/JSON として読めません/);
  });

  it("meta.json の status を不正な値に書き換えると読み込みで検出する", () => {
    const repo = makeTempRepo();
    createArticle(repo, { id: "a-001" });
    const path = join(repo.root, "data/articles/a-001/meta.json");
    const meta = JSON.parse(readFileSync(path, "utf8"));
    writeJson(repo, "data/articles/a-001/meta.json", { ...meta, status: "done" });
    expect(() => repo.readMeta("a-001")).toThrow(DomainError);
  });

  it("書き込み後に一時ファイルが残らない", () => {
    const repo = makeTempRepo();
    createArticle(repo, { id: "a-001" });
    expect(readdirSync(join(repo.root, "data/articles/a-001"))).toEqual(["meta.json"]);
  });
});

describe("Repository: 市場データ", () => {
  it("正しいデータと不正なデータを区別して返す", () => {
    const repo = makeTempRepo();
    writeJson(repo, "data/market/2026-10-23-001.json", marketRecord);
    const { source_url: _omit, ...noSource } = { ...marketRecord, id: "2026-10-23-002" };
    writeJson(repo, "data/market/2026-10-23-002.json", noSource);
    writeText(repo, "data/market/2026-10-23-003.json", "壊れたJSON");
    writeJson(repo, "data/market/wrong-name.json", { ...marketRecord, id: "2026-10-23-004" });

    const results = repo.loadMarketRecords();
    expect(results.map((r) => [r.file, r.errors.length > 0])).toEqual([
      ["2026-10-23-001.json", false],
      ["2026-10-23-002.json", true],
      ["2026-10-23-003.json", true],
      ["wrong-name.json", true],
    ]);
    expect(results[1]!.errors.join()).toContain("source_url");
  });

  it("market ディレクトリがなければ空", () => {
    expect(makeTempRepo().loadMarketRecords()).toEqual([]);
  });
});

describe("Repository: 監査ログ", () => {
  it("追記のみで、既存の行は変わらない", () => {
    const repo = makeTempRepo();
    repo.appendAudit({ actor: "ai", action: "article_created", article_id: "a-001" });
    const path = join(repo.root, "data/audit.log.jsonl");
    const first = readFileSync(path, "utf8");
    repo.appendAudit({ actor: "ai", action: "transition", article_id: "a-001", from: "idea", to: "researching" });
    const second = readFileSync(path, "utf8");
    expect(second.startsWith(first)).toBe(true);
    expect(repo.readAudit()).toHaveLength(2);
  });

  it("各行にタイムゾーン付きの日時が入る", () => {
    const repo = makeTempRepo();
    const entry = repo.appendAudit({ actor: "owner", action: "approved", article_id: "a-001" });
    expect(entry.at).toMatch(/[+-]\d{2}:\d{2}$/);
  });
});
