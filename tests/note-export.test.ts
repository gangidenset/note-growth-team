import { describe, expect, it } from "vitest";
import { PAYWALL_PLACEHOLDER, toNoteText } from "../scripts/note-export.js";

describe("toNoteText（note 貼り付け用の変換）", () => {
  it("H1 をタイトルとして取り出し、本文から外す", () => {
    const r = toNoteText("# タイトル\n\n本文\n");
    expect(r.title).toBe("タイトル");
    expect(r.body).toBe("本文\n");
  });

  it("paywall を目印行に置き換える", () => {
    expect(toNoteText("無料\n<!-- paywall -->\n有料").body).toBe(`無料\n${PAYWALL_PLACEHOLDER}\n有料`);
  });

  it("表を箇条書きに変換する", () => {
    const md = "| 担当 | 仕事 |\n|---|---|\n| 調査 | 記録 |\n| 執筆 | 記事 |\n後";
    expect(toNoteText(md).body).toBe("・調査（仕事: 記録）\n・執筆（仕事: 記事）\n後");
  });

  it("コードブロックの中は変えない", () => {
    const md = "```\n| a | b |\n|---|---|\n<!-- paywall -->\n```";
    expect(toNoteText(md).body).toBe(md);
  });

  it("表と paywall 以外の文章は一字も変えない", () => {
    const md = "## 見出し\n\n2章の引用を参考に、`CLAUDE.md` を書く。\n- [ ] チェック";
    expect(toNoteText(md).body).toBe(md);
  });
});
