---
name: approval-workflow
description: 記事パッケージの状態遷移と承認ルール。記事の状態を進める・確認するとき、公開や承認について聞かれたときに使う。
---

# 状態遷移と承認ルール

```
idea → researching → planning → drafting → qa → awaiting_approval → approved → published
                         needs_revision（差し戻し） / archived（中止・オーナーのみ）
```

## AI（Claude Code）がしてよいこと
- `awaiting_approval` までの遷移（フェーズ2以降は `npm run article:transition` 経由のみ）
- `needs_revision` への差し戻し（理由を書く）
- 状態の確認、承認待ち記事の一覧をオーナーに報告

## AI がしてはいけないこと
- `approved` / `published` / `archived` への遷移
- `npm run approve`、`npm run publish:record`、`npm run article:archive` の実行（書き方を変えた実行も含む）
- `data/approvals/` の作成・編集、`meta.json` の status 直接書き換え
- note への投稿、投稿のための外部送信

## オーナーへの依頼の仕方
承認待ちになったら、次の形で報告して作業を止める:
> 記事 `<id>` が承認待ちです。内容を確認のうえ、ご自身のターミナルで `npm run approve -- <id>` を実行してください。

承認後に本文を変えると承認は無効になる（内容ハッシュ不一致）。
