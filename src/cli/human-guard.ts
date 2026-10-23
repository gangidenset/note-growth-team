/**
 * オーナー専用コマンド（approve / publish:record / article:archive）を、
 * 人間が操作する端末からしか実行できないようにする確認。
 * Claude Code の Bash ツールは対話端末（TTY）ではなく、環境変数 CLAUDECODE=1 が設定されている。
 */
export interface TerminalInfo {
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
  env: Record<string, string | undefined>;
}

export function checkHumanTerminal(info: TerminalInfo): string[] {
  const errors: string[] = [];
  if (info.env.CLAUDECODE) {
    errors.push("Claude Code の中からは実行できません。オーナー自身のターミナルで実行してください。");
  }
  if (!info.stdinIsTTY || !info.stdoutIsTTY) {
    errors.push("対話できる端末（TTY）で実行してください（パイプや自動実行では動きません）。");
  }
  return errors;
}

export function currentTerminal(): TerminalInfo {
  return {
    stdinIsTTY: Boolean(process.stdin.isTTY),
    stdoutIsTTY: Boolean(process.stdout.isTTY),
    env: process.env,
  };
}
