import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkHumanTerminal } from "../src/cli/human-guard.js";
import { makeTempRepo, marketRecord, writeJson } from "./helpers.js";

const PROJECT_ROOT = join(import.meta.dirname, "..");
// .bin/tsx は Windows では tsx.cmd になり直接起動できないため、node で JS 本体を起動する
const TSX_CLI = join(PROJECT_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const CLI = join(PROJECT_ROOT, "src", "cli", "index.ts");

/** CLI を別プロセスで実行する（標準入力はパイプ＝非TTY） */
function runCli(root: string, args: string[], env: Record<string, string | undefined> = {}) {
  const result = spawnSync(process.execPath, [TSX_CLI, CLI, ...args], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, NGT_ROOT: root, ...env },
    encoding: "utf8",
    input: "",
  });
  return { code: result.status, out: result.stdout + result.stderr };
}

describe("checkHumanTerminal", () => {
  const human = { stdinIsTTY: true, stdoutIsTTY: true, env: {} };

  it("人間の対話端末なら通す", () => {
    expect(checkHumanTerminal(human)).toEqual([]);
  });

  it("Claude Code の中（CLAUDECODE）なら拒否", () => {
    expect(checkHumanTerminal({ ...human, env: { CLAUDECODE: "1" } })).toHaveLength(1);
  });

  it.each([
    ["標準入力が非TTY", { stdinIsTTY: false }],
    ["標準出力が非TTY", { stdoutIsTTY: false }],
  ])("%s なら拒否", (_label, change) => {
    expect(checkHumanTerminal({ ...human, ...change })).toHaveLength(1);
  });
});

describe("CLI（別プロセス実行）", () => {
  it("article:new と article:status が動く", () => {
    const repo = makeTempRepo();
    const created = runCli(repo.root, ["article:new", "demo-001", "--title", "デモ", "--price", "500"]);
    expect(created.code).toBe(0);
    const status = runCli(repo.root, ["article:status"]);
    expect(status.code).toBe(0);
    expect(status.out).toContain("demo-001\tidea\t500円\tデモ");
  });

  it("article:transition で approved にはできない", () => {
    const repo = makeTempRepo();
    runCli(repo.root, ["article:new", "demo-001"]);
    const r = runCli(repo.root, ["article:transition", "demo-001", "approved"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("npm run approve");
  });

  it.each([
    ["approve", ["approve", "demo-001"]],
    ["publish:record", ["publish:record", "demo-001", "https://note.com/x/n/abc"]],
    ["article:archive", ["article:archive", "demo-001", "--reason", "x"]],
  ])("%s は非TTY・Claude Code から実行すると拒否され、何も変わらない", (_label, args) => {
    const repo = makeTempRepo();
    runCli(repo.root, ["article:new", "demo-001"]);
    const r = runCli(repo.root, args, { CLAUDECODE: "1" });
    expect(r.code).toBe(1);
    expect(r.out).toContain("オーナー自身のターミナル");
    expect(repo.readMeta("demo-001").status).toBe("idea");
    expect(repo.readApproval("demo-001")).toBeNull();
  });

  it("CLAUDECODE がなくても非TTYなら approve は拒否", () => {
    const repo = makeTempRepo();
    runCli(repo.root, ["article:new", "demo-001"]);
    const r = runCli(repo.root, ["approve", "demo-001"], { CLAUDECODE: undefined });
    expect(r.code).toBe(1);
    expect(r.out).toContain("TTY");
  });

  it("market:validate は不正データがあると終了コード1", () => {
    const repo = makeTempRepo();
    writeJson(repo, "data/market/2026-10-23-001.json", marketRecord);
    expect(runCli(repo.root, ["market:validate"]).code).toBe(0);
    writeJson(repo, "data/market/2026-10-23-002.json", { ...marketRecord, id: "2026-10-23-002", retrieved_at: "昨日" });
    const r = runCli(repo.root, ["market:validate"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("2026-10-23-002.json");
  });

  it("不明なコマンドは使い方を表示して終了コード1", () => {
    const r = runCli(makeTempRepo().root, ["unknown"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("使い方");
  });
});
