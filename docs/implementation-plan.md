# 実装計画とテスト計画（フェーズ2以降）

- 作成日: 2026-10-23
- 方針: 小さく作って毎回テストし、各フェーズ末にオーナーのレビューを受けてから次へ進む。

## フェーズ一覧

| フェーズ | 目的 | 主な成果物 | 完了条件 |
|---|---|---|---|
| 1（完了） | 環境確認・設計 | docs/*, CLAUDE.md, .claude/ 構成案 | オーナーが設計をレビュー |
| 2 | 土台: 状態管理CLIと承認ゲート | package.json, src/, tests/, settings/hook | 承認ゲートのテストがすべて通る |
| 3 | AI社員の実働化（調査→企画） | Subagent/Skill 本稿、市場データ10件 | 出典欠落ゼロでテーマ候補10件 |
| 4 | 執筆→品質チェック→承認待ち | 記事パッケージ1件 | 1テーマを awaiting_approval まで通す |
| 5 | 公開・実績記録・分析 | publish:record, performance 入力, 週次レポート | 初回公開と1週間分のレポート |
| 6 | 改善サイクル | テーマ/価格の見直しループ | 月次で目標差分を自動集計 |

## フェーズ2: 土台（詳細）

1. `package.json` 作成、依存追加: `typescript`, `tsx`, `zod`, `vitest`（`npm install` はネットワークを使うため実行前に確認）
2. `src/domain/schemas.ts` — MarketRecord / ThemeRecord / ArticleMeta / ApprovalRecord の zod スキーマ
3. `src/domain/state-machine.ts` — 状態と遷移表、ガード関数（純粋関数としてテストしやすく）
4. `src/domain/hash.ts` — `free.md`+`paid.md`+価格・タイトルを正規化して SHA-256
5. `src/storage/` — ファイル読み書き、監査ログ追記（追記のみ・上書き禁止）
6. `src/cli/` — `article:new`, `article:transition`, `article:status`, `market:validate`, `approve`, `publish:record`
7. `scripts/secret-scan.ts` — 秘密情報パターン検出（`sk-ant-`, `ghp_`, `AKIA` 等）
8. `.claude/hooks/guard.sh`（PreToolUse）— 承認・公開コマンドと `data/approvals/` 編集をブロック
9. `npm run check` に typecheck / test / secret-scan / data整合性チェックを集約
10. GitHub Actions で `npm run check` を実行（push 時）

## フェーズ3〜5の要点
- フェーズ3: Subagent 定義を実運用でチューニング。市場データ記録を `market:validate` で常時検証。
- フェーズ4: `note-article-structure` Skill を実記事で改善。qa.json 形式を確定。
- フェーズ5: オーナーが note ダッシュボードの数値を `data/performance/` に入力（`measurement: self_reported`）。quality-analyst が週次レポート作成。

## テスト計画

### 単体テスト（Vitest）
| 対象 | テストケース例 |
|---|---|
| 市場データスキーマ | `source_url`/`retrieved_at`/`method`/`measurement` 欠落でエラー、`estimated` で `estimation_basis` 欠落ならエラー、タイムゾーンなし日時はエラー |
| 状態機械 | 許可遷移は成功、未定義遷移は失敗、`approved`/`published` へは `article:transition` から不可 |
| ガード | paywall 境界なしで `qa` に進めない、critical 指摘ありで `awaiting_approval` に進めない |
| ハッシュ | 同一内容は同一ハッシュ、1文字変更でハッシュ変化、改行コード差（CRLF/LF）は正規化 |
| 承認 | 非TTYで `approve` が失敗、ID再入力不一致で失敗 |
| 公開記録 | ハッシュ不一致で失敗、note.com 以外のURLで失敗、承認記録なしで失敗 |
| 監査ログ | 全遷移でログが1行追記される、既存行は変更されない |

### 統合テスト
- 一時ディレクトリに data/ を作り、`idea → … → awaiting_approval` を CLI 経由で通す。
- 承認後に `paid.md` を編集 → `publish:record` が失敗することを確認。

### セキュリティ・設定テスト
- `git check-ignore .env` が成功する（`.env` がGit対象外）。
- リポジトリ内に秘密情報パターンが存在しない（secret-scan）。
- `.claude/settings.json` に承認・公開コマンドの deny が含まれる。
- フック: 承認コマンドを模擬入力したとき exit code 2（ブロック）を返す。

### 受け入れテスト（オーナー実施）
- 1テーマを最後まで通し、各成果物の出典・表現を目視確認。
- Claude Code に「承認して」と依頼しても承認できないことを確認。

## フェーズ2開始時に実行するコマンド（予定）
```bash
git pull origin claude/upbeat-cerf-5k2jv2
cat docs/progress.md
npm init -y
npm install -D typescript tsx vitest @types/node
npm install zod
```
