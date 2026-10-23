# 進捗と残課題

- 最終更新: 2026-10-23（JST）
- 現在のフェーズ: **フェーズ2 進行中（手順1〜3 完了、手順4から再開）**
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
| ANTHROPIC_API_KEY | 未設定（サブスク利用のため不要。値は確認・表示していない） |

## 完了したこと
### フェーズ1
- [x] 環境・Git状態の確認（既存ファイルなし → 削除・上書きなし）
- [x] docs/requirements.md / architecture.md / business-plan.md / tech-decisions.md / implementation-plan.md
- [x] CLAUDE.md / README.md / .gitignore / .env.example / .claude/settings.json
- [x] .claude/agents/（4担当）・.claude/skills/（5 Skill）のドラフト
- [x] data/ と reports/ のディレクトリ骨格
- [x] オーナー決定事項の反映（ジャンル・匿名・サブスク推奨・予算10,000円）
- [x] `.env.example` の予算値をオーナーが GitHub 上で修正（コミット cd99a2c）

### フェーズ2
- [x] 手順1: `package.json`・`tsconfig.json`、依存インストール（typescript 7.0.2, tsx 4.23.15, vitest 5.0.5, @types/node, zod 4.6.7。脆弱性 0 件）
- [x] 手順2: `src/domain/schemas.ts` — MarketRecord / ThemeRecord / ArticleMeta / QaReport / ApprovalRecord
- [x] 手順3: `src/domain/state-machine.ts` — 遷移表・実行者制限・ガード条件（純粋関数）
- [x] テスト: `tests/schemas.test.ts`, `tests/state-machine.test.ts`（`npm run check` で 85 件すべて成功）

## 残課題
### オーナー確認が必要
- [ ] 設計（requirements / architecture / business-plan）のレビュー
- [ ] 予算内のサブスクリプションプランを公式料金ページで確認して契約（オーナー作業）
- [ ] note 手数料の公式ヘルプでの確認（business-plan.md §2）
- [x] `.claude/settings.json` の deny 範囲を修正（2026-10-23 オーナー了承）

### 解決済みの問題
- `.claude/settings.json` の `Read(./.env.*)` 等が `.env.example` にも一致していた件 → deny を `.env`, `.env.local`, `.env.*.local`, `.env.development`, `.env.production`, `.env.staging`, `.env.test` に限定し、`Write` も同じ範囲で禁止。`.env.example` は Claude Code から読み書き可能になった。
- 注意: 上記以外の名前の秘密ファイル（例 `.env.mine`）は deny 対象外。秘密ファイルは `.env` か `.env.local` を使うこと（Gitには `.gitignore` の `.env.*` で入らない）。

### AI 側（フェーズ2の残り）
- [ ] 手順4: `src/domain/hash.ts`（本文の正規化と SHA-256）
- [ ] 手順5: `src/storage/`（ファイル読み書き、監査ログ追記）
- [ ] 手順6: CLI（`article:new` / `article:transition` / `article:status` / `market:validate` / `approve` / `publish:record`）
- [ ] 手順7: `scripts/secret-scan.ts`
- [ ] 手順8: PreToolUse フックによる承認ガード
- [ ] 手順9: `npm run check` に secret-scan・データ整合性を追加
- [ ] 手順10: GitHub Actions（CI）

## 実装メモ（再開時の参考）
- 状態機械は `checkTransition(from, to, ctx)` で判定のみ行う。ファイルの存在確認・qa.json 読み込み・ハッシュ照合は CLI 側（手順5〜6）で `TransitionContext` に詰めて渡す。
- `approved` / `published` / `archived` は `actor: "owner"` のときだけ通る。CLI の `article:transition` は常に `actor: "ai"` 相当で呼び、`approve` / `publish:record` だけが `owner` を使う設計。
- 市場データの追加ルール: 推定値は `estimation_basis` 必須、自社実績は `owner_dashboard`/`manual` のみ、売上系指標（sales_count 等）を実測で記録するときは公開表示箇所を `notes` に書く。

## 未実施・保留
- Web 調査（フェーズ3）
- note 公式APIの有無・手数料の最新確認（フェーズ3開始前に実施）

## 次の一手
Claude Code に次のように依頼する:
> docs/progress.md を読んで、フェーズ2の手順4〜6（ハッシュ、ストレージと監査ログ、CLI）とそのテストを実装して
