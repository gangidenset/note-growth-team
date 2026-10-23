/**
 * npm run note:export -- <記事ID>
 * note のエディタに貼り付けやすい形のテキストを data/articles/<id>/export/ に書き出す。
 * 文章は変えず、見た目だけを変換する（承認の内容ハッシュは free.md / paid.md が対象なので影響しない）。
 * - 1行目の H1 はタイトル欄に入れるため本文から外す
 * - 表（| … |）は「・項目: 値」の箇条書きに変換（note は表を表示できないため）
 * - <!-- paywall --> は「有料ラインを入れる位置」の目印行に置き換える
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Repository } from "../src/storage/repository.js";

export const PAYWALL_PLACEHOLDER = "＝＝＝＝＝ ここに note の有料ラインを入れる（この行は消す） ＝＝＝＝＝";

function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

/** Markdown 本文を note 貼り付け用に変換する */
export function toNoteText(markdown: string): { title: string; body: string } {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let title = "";
  if (lines[0]?.startsWith("# ")) {
    title = lines.shift()!.slice(2).trim();
    while (lines[0]?.trim() === "") lines.shift();
  }
  const out: string[] = [];
  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("```")) inCode = !inCode;
    if (!inCode && /^\s*<!--\s*paywall\s*-->\s*$/.test(line)) {
      out.push(PAYWALL_PLACEHOLDER);
      continue;
    }
    const sep = lines[i + 1];
    if (!inCode && line.trim().startsWith("|") && sep !== undefined && /^\s*\|?\s*:?-{3,}/.test(sep)) {
      const header = splitRow(line);
      i++; // 区切り行を飛ばす
      while (lines[i + 1]?.trim().startsWith("|")) {
        const cells = splitRow(lines[++i]!);
        const [first, ...rest] = cells;
        const detail = rest.map((c, k) => `${header[k + 1] ?? ""}: ${c}`).join(" ／ ");
        out.push(`・${first}${detail ? `（${detail}）` : ""}`);
      }
      continue;
    }
    out.push(line);
  }
  return { title, body: out.join("\n") };
}

if (process.argv[1]?.endsWith("note-export.ts")) {
  const id = process.argv[2];
  if (!id) {
    console.error("使い方: npm run note:export -- <記事ID>");
    process.exit(1);
  }
  const repo = new Repository(process.env.NGT_ROOT ?? process.cwd());
  const meta = repo.readMeta(id);
  const dir = join(repo.articleDir(id), "export");
  mkdirSync(dir, { recursive: true });
  for (const file of ["free.md", "paid.md"] as const) {
    const md = repo.readDraft(id, file);
    if (md === null) continue;
    const { title, body } = toNoteText(md);
    const name = file.replace(".md", "");
    writeFileSync(join(dir, `${name}-title.txt`), `${title}\n`);
    writeFileSync(join(dir, `${name}-body.txt`), `${body}\n`);
  }
  console.log(`書き出しました: data/articles/${id}/export/`);
  console.log(`  free-title.txt / free-body.txt（無料記事）`);
  console.log(`  paid-title.txt / paid-body.txt（有料記事、価格 ${meta.price_jpy ?? "未定"}円）`);
}
