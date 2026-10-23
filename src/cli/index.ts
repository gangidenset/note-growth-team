/**
 * ngt CLI。package.json の scripts から `npm run <コマンド> -- <引数>` で呼ぶ。
 * 仕様: docs/architecture.md §2.4
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import {
  approveArticle,
  archiveArticle,
  createArticle,
  currentContentHash,
  listArticleStatuses,
  recordPublication,
  transitionArticle,
  validateMarket,
} from "../app/articles.js";
import { checkIntegrity } from "../app/integrity.js";
import { ArticleState } from "../domain/schemas.js";
import { DomainError, Repository } from "../storage/repository.js";
import { checkHumanTerminal, currentTerminal } from "./human-guard.js";

const USAGE = `使い方: npm run <コマンド> -- <引数>

AI・オーナー共通:
  article:new -- <記事ID> [--theme <テーマID>] [--title <タイトル>] [--price <円>]
  article:transition -- <記事ID> <遷移先> [--reason <理由>]
  article:status
  market:validate
  data:check

オーナー専用（自分のターミナルで実行。Claude Code からは実行不可）:
  approve -- <記事ID> [--note <メモ>]
  publish:record -- <記事ID> <noteの公開URL>
  article:archive -- <記事ID> --reason <理由>`;

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      theme: { type: "string" },
      title: { type: "string" },
      price: { type: "string" },
      reason: { type: "string" },
      note: { type: "string" },
    },
  });
}

function requirePositional(values: string[], count: number, usage: string): string[] {
  if (values.length < count) throw new DomainError([`引数が足りません。${usage}`]);
  return values;
}

function parsePrice(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new DomainError([`--price は正の整数（円）で指定してください: ${raw}`]);
  return n;
}

/** オーナー専用コマンドの前に、人間の端末かを確認し、.env から承認者名などを読み込む */
function requireHuman(root: string): void {
  const errors = checkHumanTerminal(currentTerminal());
  if (errors.length > 0) throw new DomainError(errors);
  const envFile = join(root, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

async function confirm(question: string, expected: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(question);
    return answer.trim() === expected;
  } finally {
    rl.close();
  }
}

export async function main(argv: string[]): Promise<number> {
  // 記録日時は日本時間をそろえる（TZ が明示されていればそれを使う）
  process.env.TZ ??= "Asia/Tokyo";
  const [command, ...rest] = argv;
  const root = process.env.NGT_ROOT ?? process.cwd();
  const repo = new Repository(root);
  const { values, positionals } = parse(rest);

  switch (command) {
    case "article:new": {
      const [id] = requirePositional(positionals, 1, "例: npm run article:new -- flutter-demo-001");
      const meta = createArticle(repo, {
        id: id!,
        themeId: values.theme ?? null,
        title: values.title ?? "",
        priceJpy: parsePrice(values.price),
      });
      console.log(`記事 ${meta.id} を作成しました（状態: ${meta.status}）`);
      console.log(`本文の置き場所: data/articles/${meta.id}/free.md と paid.md`);
      return 0;
    }

    case "article:transition": {
      const [id, to] = requirePositional(positionals, 2, "例: npm run article:transition -- <記事ID> qa");
      const target = ArticleState.safeParse(to);
      if (!target.success) {
        throw new DomainError([`遷移先 "${to}" は不明です。指定できる状態: ${ArticleState.options.join(", ")}`]);
      }
      const meta = transitionArticle(repo, id!, target.data, values.reason ?? "");
      console.log(`記事 ${meta.id}: ${meta.history.at(-1)?.from} → ${meta.status}`);
      if (meta.status === "awaiting_approval") {
        console.log(`承認待ちになりました。オーナーは自分のターミナルで npm run approve -- ${meta.id} を実行してください。`);
      }
      return 0;
    }

    case "article:status": {
      const rows = listArticleStatuses(repo);
      if (rows.length === 0) {
        console.log("記事はまだありません。npm run article:new -- <記事ID> で作成できます。");
        return 0;
      }
      for (const r of rows) {
        const price = r.price_jpy === null ? "価格未定" : `${r.price_jpy}円`;
        console.log(`${r.id}\t${r.status}\t${price}\t${r.title || "(タイトル未定)"}\t更新 ${r.updated_at}`);
        if (r.warning) console.log(`  ⚠ ${r.warning}`);
      }
      return rows.some((r) => r.warning) ? 1 : 0;
    }

    case "market:validate": {
      const summary = validateMarket(repo);
      console.log(`市場データ: ${summary.total} 件中 ${summary.valid} 件が有効`);
      for (const bad of summary.invalid) {
        console.log(`✗ data/market/${bad.file}`);
        for (const e of bad.errors) console.log(`    - ${e}`);
      }
      return summary.invalid.length === 0 ? 0 : 1;
    }

    case "data:check": {
      const issues = checkIntegrity(repo);
      if (issues.length === 0) {
        console.log("データ整合性チェック: 問題は見つかりませんでした");
        return 0;
      }
      console.log(`データ整合性チェック: ${issues.length} 件の問題があります`);
      for (const i of issues) console.log(`✗ ${i.target}: ${i.message}`);
      return 1;
    }

    case "approve": {
      requireHuman(root);
      const [id] = requirePositional(positionals, 1, "例: npm run approve -- <記事ID>");
      const meta = repo.readMeta(id!);
      const hash = currentContentHash(repo, meta);
      console.log(`記事: ${meta.id}\nタイトル: ${meta.title || "(未定)"}\n価格: ${meta.price_jpy ?? "未定"}\n状態: ${meta.status}`);
      console.log(`内容ハッシュ: ${hash ?? "(本文がそろっていません)"}`);
      console.log("free.md と paid.md を読んで内容を確認してから承認してください。");
      if (!(await confirm(`承認するには記事ID（${meta.id}）を入力してください: `, meta.id))) {
        console.log("入力が一致しないため、承認を中止しました。");
        return 1;
      }
      const approver = process.env.NGT_APPROVER_NAME?.trim() || "owner";
      const record = approveArticle(repo, meta.id, approver, values.note ?? "");
      console.log(`承認しました（承認者: ${record.approver}）。note で手動投稿したら次を実行してください:`);
      console.log(`  npm run publish:record -- ${meta.id} <公開URL>`);
      return 0;
    }

    case "publish:record": {
      requireHuman(root);
      const [id, url] = requirePositional(positionals, 2, "例: npm run publish:record -- <記事ID> https://note.com/...");
      if (!(await confirm(`記事 ${id} を公開済み（${url}）として記録します。よろしければ yes と入力: `, "yes"))) {
        console.log("記録を中止しました。");
        return 1;
      }
      const meta = recordPublication(repo, id!, url!);
      console.log(`記事 ${meta.id} を公開済みとして記録しました。`);
      return 0;
    }

    case "article:archive": {
      requireHuman(root);
      const [id] = requirePositional(positionals, 1, "例: npm run article:archive -- <記事ID> --reason 理由");
      if (!(await confirm(`記事 ${id} を中止（archived）にします。記事IDを入力してください: `, id!))) {
        console.log("入力が一致しないため、中止しました。");
        return 1;
      }
      const meta = archiveArticle(repo, id!, values.reason ?? "");
      console.log(`記事 ${meta.id} を archived にしました。`);
      return 0;
    }

    default:
      console.log(USAGE);
      return command === undefined || command === "help" ? 0 : 1;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    if (error instanceof DomainError) {
      for (const m of error.messages) console.error(`エラー: ${m}`);
    } else if (error instanceof Error && error.name === "TypeError" && "code" in error) {
      // parseArgs の不明なオプションなど
      console.error(`エラー: ${error.message}\n\n${USAGE}`);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  },
);
