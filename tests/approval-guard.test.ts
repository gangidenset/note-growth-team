import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluate,
  evaluateBash,
  evaluateWrite,
  splitCommands,
  stripHeredocs,
} from "../.claude/hooks/approval-guard.mjs";

const HOOK = join(import.meta.dirname, "..", ".claude", "hooks", "approval-guard.mjs");

describe("Bash: オーナー専用コマンドを止める", () => {
  it.each([
    "npm run approve -- demo-001",
    "npm run -s approve -- demo-001",
    "npm --silent run approve demo-001",
    "npm run-script approve demo-001",
    "cd /home/user/note-growth-team && npm run approve -- demo-001",
    "NGT_ROOT=/tmp/x npm run approve -- demo-001",
    "env FOO=1 npm run publish:record -- demo-001 https://note.com/a/n/b",
    "pnpm approve demo-001",
    "yarn article:archive demo-001 --reason x",
    "npx tsx src/cli/index.ts approve demo-001",
    "node_modules/.bin/tsx src/cli/index.ts approve demo-001",
    "./src/cli/index.ts approve demo-001",
    "echo ok; npm run approve -- demo-001",
    "true || npm run 'approve' -- demo-001",
    "bash -c 'npm run approve -- demo-001'",
    "sh -c \"cd x && npm run publish:record -- a b\"",
    "eval npm run approve -- demo-001",
    "sudo npm run approve -- demo-001",
    "(npm run approve -- demo-001)",
    "echo $(npm run approve -- demo-001)",
  ])("拒否: %s", (command) => {
    expect(evaluateBash(command).decision).toBe("deny");
  });

  it.each([
    "npm run check",
    "npm run article:transition -- demo-001 awaiting_approval",
    "npm run article:status",
    "npm test",
    "git status",
    "grep -rn approve src/",
    'git commit -m "npm run approve の説明を追加"',
    "git commit -q -F - <<'EOF'\nnpm run approve を実行しないこと\nEOF\ngit push -u origin main",
    "cat data/approvals/demo-001.json",
    "ls data/approvals",
    "echo 'approve'",
  ])("許可: %s", (command) => {
    expect(evaluateBash(command).decision).toBe("allow");
  });
});

describe("Bash: data/approvals と秘密ファイルへの書き込みを止める", () => {
  it.each([
    "echo '{}' > data/approvals/demo-001.json",
    "cat x >> ./data/approvals/demo-001.json",
    "cp /tmp/a.json data/approvals/demo-001.json",
    "rm -f data/approvals/demo-001.json",
    "sed -i 's/a/b/' data/approvals/demo-001.json",
    "tee data/approvals/x.json < /tmp/a",
    "echo KEY=1 > .env",
    "printf x >> config/.env.local",
  ])("拒否: %s", (command) => {
    expect(evaluateBash(command).decision).toBe("deny");
  });
});

describe("ファイル書き込みツール", () => {
  const cwd = "/home/user/note-growth-team";

  it.each([
    "data/approvals/demo-001.json",
    `${cwd}/data/approvals/demo-001.json`,
    `${cwd}/data/articles/../approvals/demo-001.json`,
    ".env",
    `${cwd}/.env.local`,
  ])("拒否: %s", (path) => {
    expect(evaluateWrite(path, cwd).decision).toBe("deny");
  });

  it.each([".claude/settings.json", `${cwd}/.claude/hooks/approval-guard.mjs`])(
    "オーナーに確認: %s",
    (path) => {
      expect(evaluateWrite(path, cwd).decision).toBe("ask");
    },
  );

  it.each(["data/articles/demo-001/paid.md", ".env.example", "docs/progress.md", `${cwd}/src/cli/index.ts`])(
    "許可: %s",
    (path) => {
      expect(evaluateWrite(path, cwd).decision).toBe("allow");
    },
  );

  it("evaluate は tool_name で振り分ける", () => {
    expect(evaluate({ tool_name: "Edit", tool_input: { file_path: "data/approvals/a.json" }, cwd }).decision).toBe("deny");
    expect(evaluate({ tool_name: "Read", tool_input: { file_path: "data/approvals/a.json" }, cwd }).decision).toBe("allow");
    expect(evaluate(null).decision).toBe("deny");
  });
});

describe("補助関数", () => {
  it("引用符の中の区切り文字では分割しない", () => {
    expect(splitCommands('git commit -m "a; npm run approve"')).toEqual([
      { words: ["git", "commit", "-m", "a; npm run approve"], redirects: [] },
    ]);
  });

  it("ヒアドキュメントの本文を取り除く", () => {
    expect(stripHeredocs("cat <<'EOF'\nnpm run approve\nEOF\necho done")).not.toContain("approve");
  });
});

describe("フック本体（別プロセス、Claude Code と同じ入出力）", () => {
  const run = (input: string) => spawnSync(process.execPath, [HOOK], { input, encoding: "utf8" });

  it("拒否時は終了コード2と理由を stderr に出す", () => {
    const r = run(JSON.stringify({ tool_name: "Bash", tool_input: { command: "npm run -s approve -- a" } }));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("オーナー専用");
  });

  it("許可時は終了コード0で何も出さない", () => {
    const r = run(JSON.stringify({ tool_name: "Bash", tool_input: { command: "npm run check" } }));
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });

  it("確認が必要なときは permissionDecision: ask を返す", () => {
    const r = run(JSON.stringify({ tool_name: "Write", tool_input: { file_path: ".claude/settings.json" } }));
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision).toBe("ask");
  });

  it("壊れた入力は安全側（拒否）に倒す", () => {
    expect(run("not json").status).toBe(2);
  });
});
