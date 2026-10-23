# 進捗と残課題

- 最終更新: 2026-10-23（JST）
- 現在のフェーズ: **フェーズ1 完了（オーナーレビュー待ち）**
- 作業ブランチ: `claude/upbeat-cerf-5k2jv2`

## 環境確認結果（2026-10-23、クラウド実行環境）
| 項目 | 結果 |
|---|---|
| OS | Ubuntu 24.04.5 LTS（Linux x86_64） |
| 作業ディレクトリ | `/home/user/note-growth-team`（オーナーのPCでは clone した場所） |
| Git | 2.43.0、初期状態はコミット・ファイルなし |
| Node.js / npm | v22.22.0 / 10.9.4（pnpm もあり） |
| Python | 3.13 |
| その他ツール | Claude Code 2.1.309, jq, ripgrep, gh, Chromium(Playwright) |
| ANTHROPIC_API_KEY | 未設定（フェーズ1では不要。値は確認・表示していない） |

## 完了したこと（フェーズ1）
- [x] 環境・Git状態の確認（既存ファイルなし → 削除・上書きなし）
- [x] docs/requirements.md / architecture.md / business-plan.md
- [x] docs/tech-decisions.md（技術選定の理由と代替案）
- [x] docs/implementation-plan.md（フェーズ2以降の実装計画・テスト計画）
- [x] CLAUDE.md / README.md / .gitignore / .env.example
- [x] .claude/settings.json（.env 読み取り禁止、承認・公開コマンド禁止、危険操作は確認）
- [x] .claude/agents/ 4担当の定義（ドラフト）
- [x] .claude/skills/ 5 Skill の定義（ドラフト）
- [x] data/ と reports/ のディレクトリ骨格

## 残課題
### オーナー確認が必要
- [ ] 設計（requirements / architecture / business-plan）のレビュー
- [x] 記事ジャンル・得意分野・実名/匿名方針の決定（2026-10-23、requirements.md §8）
- [x] Claude Code の利用形態（サブスク推奨）と月額予算上限 10,000円（business-plan.md §7）
- [ ] 予算内のサブスクリプションプランを公式料金ページで確認して契約（オーナー作業）
- [ ] note 手数料の公式ヘルプでの確認（business-plan.md §2）
- [ ] `.claude/settings.json` の deny 範囲の修正可否（下記「既知の問題」）

### 既知の問題
- `.claude/settings.json` の `Read(./.env.*)` / `Edit(./.env.*)` が `.env.example` にも一致し、Claude Code が `.env.example` を読み書きできない。そのため `.env.example` の `NGT_MONTHLY_BUDGET_JPY` は 3000 のまま（正しくは 10000）。修正案: deny を `.env`, `.env.local`, `.env.*.local`, `.env.production` など実ファイル名に限定する。

### AI 側（フェーズ2）
- [ ] package.json 作成と依存インストール（ネットワーク使用のため実行時に確認）
- [ ] zod スキーマ・状態機械・ハッシュ・CLI の実装
- [ ] PreToolUse フックによる承認ガード
- [ ] Vitest テスト、secret-scan、`npm run check`
- [ ] GitHub Actions（CI）

## 未実施・保留
- コードの実装・npm install（フェーズ1の範囲外）
- Web 調査（テーマ選定前にジャンルの確認が必要なため）
- note 公式APIの有無・手数料の最新確認（フェーズ2冒頭で実施）

## 次の一手
オーナーが設計を確認後、Claude Code に次のように依頼する:
> docs/progress.md と docs/implementation-plan.md を読んで、フェーズ2の手順1〜3（package.json、スキーマ、状態機械）とそのテストを実装して
