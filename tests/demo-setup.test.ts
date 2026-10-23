import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { approveArticle, recordPublication } from "../src/app/articles.js";
import { checkIntegrity } from "../src/app/integrity.js";
import { DEMO_ARTICLE_ID, setupDemo } from "../scripts/demo-setup.js";

describe("demo:setup（練習用データ）", () => {
  it("記事を承認待ちまで進め、データに矛盾がない", () => {
    const repo = setupDemo(mkdtempSync(join(tmpdir(), "ngt-demo-test-")));
    expect(repo.readMeta(DEMO_ARTICLE_ID).status).toBe("awaiting_approval");
    expect(repo.readApproval(DEMO_ARTICLE_ID)).toBeNull();
    expect(checkIntegrity(repo)).toEqual([]);
  });

  it("オーナーが手元で行う承認・公開記録が、このデータで最後まで通る", () => {
    const repo = setupDemo(mkdtempSync(join(tmpdir(), "ngt-demo-test-")));
    approveArticle(repo, DEMO_ARTICLE_ID, "owner");
    recordPublication(repo, DEMO_ARTICLE_ID, "https://note.com/demo/n/n0000000000");
    expect(repo.readMeta(DEMO_ARTICLE_ID).status).toBe("published");
    expect(checkIntegrity(repo)).toEqual([]);
  });
});
