#!/usr/bin/env node
/**
 * Claude Code の PreToolUse フック: 承認ゲートと秘密情報を守る。
 * 仕様: docs/architecture.md §4（承認ゲートの多層防御の第4層）
 *
 * - deny: オーナー専用コマンド（approve / publish:record / article:archive）の実行、
 *         data/approvals/ への書き込み、.env 等の秘密ファイルへの書き込み
 * - ask : 守りの設定（.claude/settings.json, .claude/hooks/）の変更はオーナーに確認
 *
 * 依存パッケージなし（npm install 前でも動き、壊れたときは安全側＝拒否に倒す）。
 */
import { isAbsolute, normalize, relative } from "node:path";
import { pathToFileURL } from "node:url";

export const OWNER_COMMANDS = ["approve", "publish:record", "article:archive"];
const RUNNERS = new Set(["npm", "pnpm", "yarn", "npx", "bun", "tsx", "node"]);
const WRAPPERS = new Set(["sudo", "env", "time", "nice", "nohup", "command", "exec", "xargs"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);
const SECRET_FILE = /^(?:\.env|\.env\.local|\.env\..+\.local|\.env\.(?:development|production|staging|test))$/;
const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

/** ヒアドキュメントの本文を取り除く（コミットメッセージ等の文章で誤検知しないため） */
export function stripHeredocs(command) {
  return command.replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g, "\n");
}

/**
 * シェルのコマンド列を、引用符を考慮して「コマンドごとの単語リスト」に分ける。
 * ; & | 改行 で区切り、> の直後の単語はリダイレクト先として記録する。
 * 完全なシェル構文解析ではないが、防御の1層として十分な精度を狙う。
 */
export function splitCommands(command) {
  const segments = [];
  let words = [];
  let redirects = [];
  let current = "";
  let hasCurrent = false;
  let quote = null;
  let redirectNext = false;

  const pushWord = () => {
    if (!hasCurrent) return;
    (redirectNext ? redirects : words).push(current);
    redirectNext = false;
    current = "";
    hasCurrent = false;
  };
  const pushSegment = () => {
    pushWord();
    if (words.length > 0 || redirects.length > 0) segments.push({ words, redirects });
    words = [];
    redirects = [];
  };

  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"' && i + 1 < command.length) current += command[++i];
      else current += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      hasCurrent = true;
    } else if (c === "\\" && i + 1 < command.length) {
      current += command[++i];
      hasCurrent = true;
    } else if (c === ";" || c === "&" || c === "|" || c === "\n" || c === "(" || c === ")" || c === "`") {
      pushSegment();
    } else if (c === ">") {
      pushWord();
      redirectNext = true;
    } else if (c === "<") {
      pushWord();
    } else if (/\s/.test(c)) {
      pushWord();
    } else {
      current += c;
      hasCurrent = true;
    }
  }
  pushSegment();
  return segments;
}

/** 先頭の環境変数代入やラッパー（sudo, env など）を飛ばした実際のコマンド名の位置 */
function commandIndex(words) {
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) i++;
    else if (WRAPPERS.has(w)) i++;
    else if (w.startsWith("-") && i > 0 && WRAPPERS.has(words[i - 1])) i++;
    else break;
  }
  return i;
}

function baseName(word) {
  return word.split("/").pop() ?? word;
}

function touchesApprovals(path) {
  return /(^|\/)data\/approvals(\/|$)/.test(normalize(path).replace(/\\/g, "/"));
}

function isSecretFile(path) {
  return SECRET_FILE.test(baseName(path));
}

/** Bash のコマンド文字列を判定する */
export function evaluateBash(command, depth = 0) {
  if (depth > 3) return { decision: "deny", reason: "入れ子が深すぎるコマンドは確認できません" };
  for (const { words, redirects } of splitCommands(stripHeredocs(command))) {
    for (const target of redirects) {
      if (touchesApprovals(target)) {
        return { decision: "deny", reason: "data/approvals/ への書き込みはオーナー専用コマンド（npm run approve）だけが行います" };
      }
      if (isSecretFile(target)) {
        return { decision: "deny", reason: ".env 等の秘密ファイルには書き込みません（CLAUDE.md ルール5）" };
      }
    }
    const i = commandIndex(words);
    const cmd = baseName(words[i] ?? "");
    const args = words.slice(i + 1);

    if (SHELLS.has(cmd) || cmd === "eval") {
      const cIndex = args.indexOf("-c");
      const inner = cmd === "eval" ? args.join(" ") : cIndex >= 0 ? args[cIndex + 1] : undefined;
      if (inner) {
        const result = evaluateBash(inner, depth + 1);
        if (result.decision !== "allow") return result;
      }
      continue;
    }

    if (RUNNERS.has(cmd) || words[i]?.includes("cli/index")) {
      const hit = args.find((a) => OWNER_COMMANDS.includes(a));
      if (hit) {
        return {
          decision: "deny",
          reason: `「${hit}」はオーナー専用コマンドです。Claude Code からは実行しません。オーナー自身のターミナルで実行してもらうよう依頼してください。`,
        };
      }
    }

    const mutating = ["rm", "mv", "cp", "tee", "touch", "ln", "install", "rsync", "truncate", "dd"];
    if (mutating.includes(cmd) || (cmd === "sed" && args.some((a) => a.startsWith("-i")))) {
      if (args.some(touchesApprovals)) {
        return { decision: "deny", reason: "data/approvals/ はオーナー専用コマンドだけが変更します" };
      }
    }
  }
  return { decision: "allow", reason: "" };
}

/** ファイル書き込み系ツールの対象パスを判定する */
export function evaluateWrite(filePath, cwd) {
  if (typeof filePath !== "string" || filePath === "") return { decision: "allow", reason: "" };
  const rel = isAbsolute(filePath) && cwd ? relative(cwd, filePath) : filePath;
  const p = normalize(rel).replace(/\\/g, "/");
  if (touchesApprovals(p)) {
    return { decision: "deny", reason: "data/approvals/ はオーナー専用コマンド（npm run approve）だけが書き込みます" };
  }
  if (isSecretFile(p)) {
    return { decision: "deny", reason: ".env 等の秘密ファイルには書き込みません（CLAUDE.md ルール5）" };
  }
  if (/(^|\/)\.claude\/(settings\.json|hooks\/)/.test(p)) {
    return { decision: "ask", reason: "承認ゲートを守る設定（.claude/settings.json / .claude/hooks/）の変更です。オーナーの確認が必要です。" };
  }
  return { decision: "allow", reason: "" };
}

/** フック入力（JSON）全体を判定する */
export function evaluate(input) {
  if (!input || typeof input !== "object") return { decision: "deny", reason: "フック入力を解釈できません" };
  const tool = input.tool_name;
  const toolInput = input.tool_input ?? {};
  if (tool === "Bash") return evaluateBash(String(toolInput.command ?? ""));
  if (WRITE_TOOLS.has(tool)) return evaluateWrite(toolInput.file_path ?? toolInput.notebook_path, input.cwd);
  return { decision: "allow", reason: "" };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  let result;
  try {
    result = evaluate(JSON.parse(await readStdin()));
  } catch {
    result = { decision: "deny", reason: "承認ガード: 入力を解釈できなかったため安全のため拒否しました" };
  }
  if (result.decision === "deny") {
    process.stderr.write(`承認ガード: ${result.reason}\n`);
    process.exit(2); // exit 2 = ツール実行をブロックし、理由を Claude に伝える
  }
  if (result.decision === "ask") {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason: result.reason,
        },
      }),
    );
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
