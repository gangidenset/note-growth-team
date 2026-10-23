# data/

| ディレクトリ | 内容 | 書き込み |
|---|---|---|
| `market/` | 市場データ（出典必須、Skill `source-recording`） | market-researcher |
| `themes/` | テーマ評価・選定記録 | marketing-strategist |
| `articles/<id>/` | meta.json / free.md / paid.md / qa.json | editor-writer, quality-analyst |
| `approvals/` | 承認記録（内容ハッシュ付き） | **オーナーのみ**（Claude Code からは書き込み禁止） |
| `performance/` | 自アカウントの実績（self_reported） | オーナー |
| `audit.log.jsonl` | 状態遷移の監査ログ（追記のみ） | CLI（フェーズ2） |

秘密情報・個人情報は置かないでください。Gitに入れたくないメモは `data/private/`（Git対象外）へ。
