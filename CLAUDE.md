# CLAUDE.md — Note Growth Team 運用ルール

このリポジトリは、note で月5万円の売上を目指す「AI社員システム」です。Claude Code はこのファイルの規則に必ず従ってください。

## 作業の開始と終了
- **開始時**: `docs/progress.md` を読み、「次の一手」から再開する。
- **終了時・中断前**: `docs/progress.md` の完了事項・残課題・次の一手を更新し、コミットする（Skill: `progress-handoff`）。

## チーム構成（.claude/agents/）
| Subagent | 担当 |
|---|---|
| `market-researcher` | 市場調査・出典付きデータ記録 |
| `marketing-strategist` | テーマ選定・価格・導線・売上シナリオ |
| `editor-writer` | 無料記事・有料記事の執筆 |
| `quality-analyst` | 公開前チェック・捏造検知・実績分析 |

メインセッションは進行役として、タスクを適切な Subagent に委任し、結果を統合する。

## 絶対に守るルール
1. **捏造禁止**: 他者の購入数・売上など非公開情報を作らない・断定しない。不明なら「不明」と書く。
2. **出典必須**: 市場データには `source_url` / `retrieved_at`（タイムゾーン付き）/ `method` / `measurement`（observed・estimated・self_reported）を記録する。推定には `estimation_basis` を書く（Skill: `source-recording`）。
3. **承認は人間だけ**: 記事を `approved` / `published` にしない。`npm run approve` と `npm run publish:record` は実行しない。`data/approvals/` を作成・編集しない（Skill: `approval-workflow`）。
4. **不可逆操作は事前確認**: 課金・外部送信（メール/SNS/フォーム/Webhook）・公開・削除・`git push --force`・履歴の書き換えは、オーナーの明示的な承認を得てから行う。
5. **秘密情報**: `.env` を読まない・表示しない・コミットしない。APIキーをコード・ドキュメント・ログに書かない。新しい環境変数は `.env.example` に変数名とダミー値のみ追加する。
6. **既存ファイルを勝手に削除・全面上書きしない**。変更は差分が分かる形で行う。

## ディレクトリ
- `docs/` 設計書・計画・進捗（requirements / architecture / business-plan / tech-decisions / implementation-plan / progress）
- `data/` 市場データ・テーマ・記事・承認・実績（Git管理、秘密情報は入れない）
- `reports/` 分析レポート
- `src/`, `tests/` フェーズ2で作成する CLI とテスト

## コマンド
- `npm run check` — 型チェック・テスト（秘密情報スキャン・データ整合性はフェーズ2後半で追加）
- `npm test` — テストのみ
- `npm run market:validate` — 市場データの出典項目検証
- `npm run article:status` — 記事の状態一覧
- `npm run article:new -- <記事ID> [--theme <テーマID>] [--title <タイトル>] [--price <円>]`
- `npm run article:transition -- <記事ID> <遷移先> [--reason <理由>]` — 状態は必ずこのコマンドで変える（meta.json の status を直接編集しない）

オーナー専用（Claude Code は実行しない）: `npm run approve` / `npm run publish:record` / `npm run article:archive`

動作確認やテストでは `NGT_ROOT=<一時ディレクトリ>` を指定し、本物の `data/` を変更しない。

## 文章スタイル
- ドキュメント・記事は日本語。オーナーは Claude Code 初心者なので、手順は具体的なコマンド付きで説明する。
- 推定値・仮定には必ず「推定」「仮定」と明記する。
