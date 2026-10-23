/**
 * 秘密情報スキャン。Git に入る（入りうる）ファイルから APIキー等のパターンを探す。
 * 見つかった値そのものは絶対に表示せず、ファイル名・行番号・種類だけを返す。
 * 仕様: docs/requirements.md NFR-1/NFR-2、docs/architecture.md §5
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

export interface SecretRule {
  name: string;
  pattern: RegExp;
}

export const SECRET_RULES: readonly SecretRule[] = [
  { name: "Anthropic APIキー", pattern: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "OpenAI APIキー", pattern: /\bsk-(?:proj-)?[A-Za-z0-9]{20,}/ },
  { name: "GitHub トークン", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: "GitHub トークン（細粒度）", pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}/ },
  { name: "AWS アクセスキー", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: "Google APIキー", pattern: /\bAIza[0-9A-Za-z_-]{35}/ },
  { name: "Slack トークン", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: "秘密鍵", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    name: "秘密情報らしき代入",
    pattern: /\b[A-Za-z_]*(?:API_?KEY|SECRET|TOKEN|PASSWORD)[A-Za-z_]*\s*[:=]\s*["']?(?<value>[A-Za-z0-9_\-/+=.]{20,})/i,
  },
];

/** ダミー値とみなす文字列（.env.example の記入例など） */
const PLACEHOLDER = /your|example|dummy|placeholder|changeme|xxxx|here|sample|test|<|\$\{/i;

/** この印がある行は検査しない（どうしても必要な場合だけ使う） */
export const ALLOW_MARKER = "secret-scan:allow";

/** 中身を読まずに「Git に入っていること自体が問題」とするファイル名 */
const FORBIDDEN_FILE = /^(?:\.env|\.env\.local|\.env\..+\.local|\.env\.(?:development|production|staging|test)|.+\.pem|.+\.key|id_rsa|id_ed25519)$/;

const MAX_BYTES = 1_000_000;

export interface SecretFinding {
  file: string;
  /** 1始まり。ファイル名そのものが問題の場合は 0 */
  line: number;
  rule: string;
}

export function isForbiddenFile(file: string): boolean {
  return FORBIDDEN_FILE.test(basename(file));
}

/** テキストを検査する。値は返さない。 */
export function scanText(file: string, text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.includes(ALLOW_MARKER)) return;
    for (const rule of SECRET_RULES) {
      const m = rule.pattern.exec(line);
      if (!m) continue;
      const value = m.groups?.value;
      if (value !== undefined && PLACEHOLDER.test(value)) continue;
      findings.push({ file, line: i + 1, rule: rule.name });
      break; // 1行につき1件で十分（値を何度も扱わない）
    }
  });
  return findings;
}

/** root からの相対パスで与えたファイル群を検査する */
export function scanFiles(root: string, files: readonly string[]): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const file of files) {
    if (isForbiddenFile(file)) {
      findings.push({ file, line: 0, rule: "Git に入れてはいけないファイル名" });
      continue; // 中身は読まない
    }
    const path = join(root, file);
    if (!existsSync(path)) continue; // 削除済みでまだコミットされていないファイルなど
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > MAX_BYTES) continue;
    const buf = readFileSync(path);
    if (buf.includes(0)) continue; // バイナリ
    findings.push(...scanText(file, buf.toString("utf8")));
  }
  return findings;
}

export function formatFinding(f: SecretFinding): string {
  return f.line === 0 ? `${f.file}: ${f.rule}` : `${f.file}:${f.line}: ${f.rule}の可能性`;
}
