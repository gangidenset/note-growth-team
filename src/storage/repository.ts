/**
 * data/ 配下のファイル読み書きと監査ログ。
 * - すべての読み込みは zod スキーマで検証する
 * - JSON は一時ファイルに書いてから rename し、書きかけのファイルが残らないようにする
 * - 監査ログ（data/audit.log.jsonl）は追記のみ。既存行は変更しない
 * 仕様: docs/architecture.md §2.5
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  Actor,
  ApprovalRecord,
  ArticleMeta,
  ArticleState,
  MarketRecord,
  QaReport,
  ThemeRecord,
  zonedDateTime,
} from "../domain/schemas.js";
import { toZonedIso } from "../domain/time.js";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** 利用者に見せる前提のエラー。messages は日本語の説明。 */
export class DomainError extends Error {
  constructor(readonly messages: string[]) {
    super(messages.join("\n"));
    this.name = "DomainError";
  }
}

export const AuditEntry = z.object({
  at: zonedDateTime,
  actor: Actor,
  action: z.enum(["article_created", "transition", "approved", "published", "archived"]),
  article_id: z.string(),
  from: ArticleState.optional(),
  to: ArticleState.optional(),
  reason: z.string().optional(),
  content_sha256: z.string().optional(),
  url: z.string().optional(),
});
export type AuditEntry = z.infer<typeof AuditEntry>;

export interface MarketFileResult {
  file: string;
  record: MarketRecord | null;
  errors: string[];
}

function formatZodError(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join(".") || "(全体)"}: ${i.message}`);
}

export class Repository {
  constructor(
    /** リポジトリのルート（data/ を含むディレクトリ） */
    readonly root: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  now(): string {
    return toZonedIso(this.clock());
  }

  // ---------- パス ----------

  private dataPath(...parts: string[]): string {
    return join(this.root, "data", ...parts);
  }

  /** パスに使う前に ID を検証する（../ などによるディレクトリ外アクセスを防ぐ） */
  assertId(id: string, label = "記事ID"): void {
    if (!ID_PATTERN.test(id)) {
      throw new DomainError([`${label} "${id}" は英小文字・数字・ハイフンのみ（先頭は英数字、64文字以内）で指定してください`]);
    }
  }

  articleDir(id: string): string {
    this.assertId(id);
    return this.dataPath("articles", id);
  }

  // ---------- 汎用 ----------

  private readJson<T>(path: string, schema: z.ZodType<T>, label: string): T | null {
    if (!existsSync(path)) return null;
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      throw new DomainError([`${label} が JSON として読めません: ${path}`]);
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new DomainError([`${label} の形式が不正です: ${path}`, ...formatZodError(parsed.error)]);
    }
    return parsed.data;
  }

  private writeJsonAtomic(path: string, data: unknown): void {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp-${process.pid}`;
    writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    renameSync(tmp, path);
  }

  // ---------- 記事 ----------

  articleExists(id: string): boolean {
    return existsSync(join(this.articleDir(id), "meta.json"));
  }

  listArticleIds(): string[] {
    const dir = this.dataPath("articles");
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && ID_PATTERN.test(e.name))
      .map((e) => e.name)
      .filter((id) => this.articleExists(id))
      .sort();
  }

  readMeta(id: string): ArticleMeta {
    const meta = this.readJson(join(this.articleDir(id), "meta.json"), ArticleMeta, "meta.json");
    if (!meta) throw new DomainError([`記事 "${id}" が見つかりません`]);
    if (meta.id !== id) {
      throw new DomainError([`meta.json の id（${meta.id}）がディレクトリ名（${id}）と一致しません`]);
    }
    return meta;
  }

  writeMeta(meta: ArticleMeta): void {
    const valid = ArticleMeta.parse(meta);
    this.writeJsonAtomic(join(this.articleDir(valid.id), "meta.json"), valid);
  }

  /** free.md / paid.md を読む。存在しなければ null */
  readDraft(id: string, file: "free.md" | "paid.md"): string | null {
    const path = join(this.articleDir(id), file);
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  }

  readQa(id: string): QaReport | null {
    return this.readJson(join(this.articleDir(id), "qa.json"), QaReport, "qa.json");
  }

  // ---------- 承認 ----------

  readApproval(id: string): ApprovalRecord | null {
    this.assertId(id);
    return this.readJson(this.dataPath("approvals", `${id}.json`), ApprovalRecord, "承認記録");
  }

  writeApproval(record: ApprovalRecord): void {
    const valid = ApprovalRecord.parse(record);
    this.assertId(valid.article_id);
    this.writeJsonAtomic(this.dataPath("approvals", `${valid.article_id}.json`), valid);
  }

  // ---------- テーマ・市場データ ----------

  readTheme(id: string): ThemeRecord | null {
    this.assertId(id, "テーマID");
    return this.readJson(this.dataPath("themes", `${id}.json`), ThemeRecord, "テーマ記録");
  }

  /** data/market/*.json をすべて検証して返す（不正なファイルもエラー付きで返す） */
  loadMarketRecords(): MarketFileResult[] {
    const dir = this.dataPath("market");
    if (!existsSync(dir)) return [];
    const results = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((file): MarketFileResult => {
        let raw: unknown;
        try {
          raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
        } catch {
          return { file, record: null, errors: ["JSON として読めません"] };
        }
        const parsed = MarketRecord.safeParse(raw);
        if (!parsed.success) return { file, record: null, errors: formatZodError(parsed.error) };
        if (`${parsed.data.id}.json` !== file) {
          return { file, record: null, errors: [`id（${parsed.data.id}）とファイル名が一致しません`] };
        }
        return { file, record: parsed.data, errors: [] };
      });
    return results;
  }

  /** data/themes/*.json をすべて検証して返す */
  loadThemes(): { file: string; theme: ThemeRecord | null; errors: string[] }[] {
    const dir = this.dataPath("themes");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((file) => {
        try {
          const theme = this.readJson(join(dir, file), ThemeRecord, "テーマ記録");
          if (theme && `${theme.id}.json` !== file) {
            return { file, theme: null, errors: [`id（${theme.id}）とファイル名が一致しません`] };
          }
          return { file, theme, errors: [] };
        } catch (e) {
          return { file, theme: null, errors: e instanceof DomainError ? e.messages : [String(e)] };
        }
      });
  }

  /** data/approvals/ にある承認記録の記事ID一覧 */
  listApprovalIds(): string[] {
    const dir = this.dataPath("approvals");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length))
      .sort();
  }

  // ---------- 監査ログ ----------

  private auditPath(): string {
    return this.dataPath("audit.log.jsonl");
  }

  /** 監査ログに1行追記する（既存の行は変更しない） */
  appendAudit(entry: Omit<AuditEntry, "at">): AuditEntry {
    const full = AuditEntry.parse({ at: this.now(), ...entry });
    mkdirSync(dirname(this.auditPath()), { recursive: true });
    appendFileSync(this.auditPath(), `${JSON.stringify(full)}\n`, "utf8");
    return full;
  }

  readAudit(): AuditEntry[] {
    if (!existsSync(this.auditPath())) return [];
    return readFileSync(this.auditPath(), "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => AuditEntry.parse(JSON.parse(line)));
  }
}
