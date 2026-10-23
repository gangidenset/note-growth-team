# 進捗と残課題

- 最終更新: 2026-10-23（JST）
- 現在のフェーズ: **フェーズ4 進行中（ai-team-buildlog-01 下書き完了、オーナーの記入待ち）**
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
- [x] 手順4: `src/domain/hash.ts`（BOM・改行コードだけ正規化した SHA-256、paywall 数え上げ）、`src/domain/time.ts`
- [x] 手順5: `src/storage/repository.ts`（スキーマ検証付き読み込み、一時ファイル経由の書き込み、ID 検証によるパス外アクセス防止、追記専用の監査ログ）
- [x] 手順6: `src/app/articles.ts`（作成・遷移・承認・公開記録・中止・一覧・市場データ検証）、`src/cli/index.ts`、`src/cli/human-guard.ts`
  - npm scripts: `article:new` / `article:transition` / `article:status` / `market:validate` / `approve` / `publish:record` / `article:archive`
  - オーナー専用コマンドは「Claude Code の中（環境変数 CLAUDECODE）」「非TTY」なら拒否し、記事IDの再入力（公開記録は yes）で確認
- [x] テスト追加: hash / repository / articles（統合）/ cli（別プロセス実行）。`npm run check` で計 141 件すべて成功
- [x] 手順7: `src/security/secret-scan.ts` + `scripts/secret-scan.ts`（`npm run secret-scan`）。Git 追跡＋未追跡（.gitignore 対象外）のファイルを検査。値は表示せず「ファイル:行: 種類」のみ。`.env` 等はファイル名だけで報告し中身は読まない
- [x] 手順8: `.claude/hooks/approval-guard.mjs`（PreToolUse フック、依存なし）を `.claude/settings.json` に登録
  - deny: オーナー専用3コマンド（`npm run -s approve`、`bash -c`、`npx tsx src/cli/index.ts approve` 等の書き方も含む）、`data/approvals/` への書き込み（リダイレクト・cp・rm・sed -i・Write/Edit）、`.env` 等への書き込み
  - ask: `.claude/settings.json` と `.claude/hooks/` の変更（オーナーに確認ダイアログ）
  - 入力が壊れていたら安全側（拒否）。2026-10-23 にこのセッションで実際にブロックされることを確認済み
- [x] 手順9: `src/app/integrity.ts`（`npm run data:check`）。状態と履歴の不一致（status の直接書き換え）、オーナー以外による承認系遷移の記録、承認記録の欠落・ハッシュ不一致、孤立した承認記録、不正な市場データ・テーマ、壊れた監査ログを検出
  - `npm run check` = typecheck → test → secret-scan → data:check
- [x] テスト追加: secret-scan / approval-guard（別プロセス実行含む）/ integrity。計 226 件すべて成功

## 残課題
### オーナー確認が必要
- [ ] 設計（requirements / architecture / business-plan）のレビュー
- [ ] 予算内のサブスクリプションプランを公式料金ページで確認して契約（オーナー作業）
- [ ] note 手数料の公式ヘルプでの確認（business-plan.md §2）
- [x] `.claude/settings.json` の deny 範囲を修正（2026-10-23 オーナー了承）

### 解決済みの問題
- `.claude/settings.json` の `Read(./.env.*)` 等が `.env.example` にも一致していた件 → deny を `.env`, `.env.local`, `.env.*.local`, `.env.development`, `.env.production`, `.env.staging`, `.env.test` に限定し、`Write` も同じ範囲で禁止。`.env.example` は Claude Code から読み書き可能になった。
- 注意: 上記以外の名前の秘密ファイル（例 `.env.mine`）は deny 対象外。秘密ファイルは `.env` か `.env.local` を使うこと（Gitには `.gitignore` の `.env.*` で入らない）。

- `settings.json` の deny `Bash(npm run approve:*)` が前方一致で `npm run -s approve` 等をすり抜けた件 → 手順8のフックで解決（テストで20通りの書き方を確認）。

### 既知の制限（許容しているもの）
- フックは簡易的なシェル解析のため、`python3 -c` 経由など想定外の書き方は検出できない。その場合も CLI 側の CLAUDECODE/TTY チェックと `data:check` が後段で止める（多層防御）。
- `npm test -- -t approve` のように引数に単独の `approve` を含むコマンドは誤って拒否される（実害が小さいため許容）。
- フックがブロックした記録は監査ログには残していない（Claude Code の画面上に理由が表示される）。

### オーナーに確認してほしいこと
- [x] 自分のターミナルで `approve` が対話確認つきで動くこと（2026-10-23 完了）
  - 環境: オーナーの Windows / PowerShell / Node v24.19.0 / Git 2.55.0、`npm run demo:setup` の練習用データで実施
  - 結果: approve（記事ID再入力）→ publish:record（yes 入力）→ article:status で published・時刻は +09:00 → data:check 問題なし
  - 途中で `$env:NGT_ROOT` の設定を飛ばして「記事が見つかりません」になった → demo:setup の案内を OS 別・番号付きに改善、エラーに探した場所を表示
  - 参考: npm install 時の `npm warn allow-scripts ... esbuild` は新しい npm の警告。tsx は正常に動作しているため対応不要

### フェーズ2 手順10（CI）
- [x] `.github/workflows/check.yml`: push / プルリクエスト / 手動実行で `npm ci && npm run check`。Ubuntu（Node 22, 24）と Windows（Node 24）。権限は contents: read のみ
- [x] CLI テストを Windows でも動くよう修正（`.bin/tsx` ではなく `node node_modules/tsx/dist/cli.mjs` で起動）
- [x] ローカルでクリーンな clone から `npm ci` → `npm run check` を再現し 228 件成功（2026-10-23）
- [x] GitHub 上での初回実行結果の確認（2026-10-23、run 39902503047 / commit 8659ac2）: Ubuntu Node 22・Ubuntu Node 24・Windows Node 24 の3ジョブすべて成功

## 実装メモ（再開時の参考）
- 状態機械は `checkTransition(from, to, ctx)` で判定のみ行う。ファイルの存在確認・qa.json 読み込み・ハッシュ照合は CLI 側（手順5〜6）で `TransitionContext` に詰めて渡す。
- `approved` / `published` / `archived` は `actor: "owner"` のときだけ通る。CLI の `article:transition` は常に `actor: "ai"` 相当で呼び、`approve` / `publish:record` だけが `owner` を使う設計。
- 市場データの追加ルール: 推定値は `estimation_basis` 必須、自社実績は `owner_dashboard`/`manual` のみ、売上系指標（sales_count 等）を実測で記録するときは公開表示箇所を `notes` に書く。
- 監査ログの `actor: "ai"` は「通常コマンド経由の操作」、`"owner"` は「オーナー専用コマンド経由の操作」を意味する（オーナーが article:new を実行しても "ai" と記録される）。
- 内容ハッシュの対象は タイトル・価格・free.md・paid.md。承認後にどれかを変えると承認は無効 → `article:transition -- <id> awaiting_approval --reason ...` で戻して再承認。
- CLI は TZ 未指定なら Asia/Tokyo で日時を記録する。テストや動作確認では `NGT_ROOT=<一時ディレクトリ>` で本物の data/ を汚さない。

## フェーズ3（進行中）
- [x] note の手数料・公式APIの有無を公式情報で確認（2026-10-23、market-researcher に委任 → 進行役が照合）
  - 市場データ `data/market/2026-10-23-001〜009.json`（手数料・振込・価格範囲・プレミアム・メンバーシップ・note API×2・ガイドライン・規約改定）
  - 結論: 手数料は 事務手数料（購入者の決済方法で 5〜15%）+ プラットフォーム利用料 10% + 振込 270円/回。個人向け公式APIはなし（2026-10-08 に法人 note pro 限定の note API が発表）→ 手動公開の方針は変わらない
  - 反映先: business-plan.md §2・§3、tech-decisions.md ADR-006、requirements.md §6
- 発生した問題と対処:
  - この実行環境から help-note.com / note.jp を直接開けない（ネットワーク制限）。値はすべて検索結果の抜粋経由（method: web_search）
  - 調査担当が retrieved_at に 00:00 を仮置きしていた → 実行時刻（13:54〜13:58 JST）の上限 13:58 に修正し、notes に経緯を明記。再発防止として source-recording Skill と market-researcher 定義に「仮の時刻を書かない／進行役が依頼文に現在時刻を書く」を追加
  - 調査担当の記録漏れ（Amazon Pay 7%、1,000円未満は Amazon ギフトカード払い）を進行役の照合で追記

### オーナーに確認してほしいこと（フェーズ3）
- [x] ブラウザで公式ページを開き、手数料の数値が business-plan.md §2 と一致するか確認（2026-10-23 オーナー確認済み・一致）
- [ ] 任意: 環境設定の Network access で `help-note.com`, `www.help-note.com`, `terms.help-note.com`, `note.com`, `note.jp` を許可すると、今後は公式ページを直接取得して記録できる（手順: https://code.claude.com/docs/en/cloud-environments#network-access ）

### テーマ候補調査（2026-10-23）
- [x] 6ジャンルのテーマ候補調査 — market-researcher が 17件（2026-10-23-010〜026、すべて web_search の抜粋）、進行役が照合用に 3件（027〜029、web_fetch で直接取得）
  - 照合結果: 015・012・019 の価格は直接取得した値と一致。直接取得でスキ数・公開日も取得（019 は 2022 年の古い記事）
  - 調査担当が retrieved_at を経過時間の見積もりで書き、未来の時刻（最大14:55）になっていた → 実作業の上限 14:43 に修正し notes に経緯を記録
  - 進行役が記録できるよう、Collector に `orchestrator` を追加（承認者にはなれない。テスト追加）
- 環境の注意: ネットワーク許可後、`curl` では note.com を取得できるが、Subagent の WebFetch ツールは DNS エラーになる。直接取得が必要な照合は進行役が curl で行う
- 未照合: 026（任天堂IRの Switch 2 販売台数）は nintendo.co.jp が許可ドメイン外で取得不可。計画書に使う前にオーナーの目視か許可ドメイン追加で確認する
- 調査担当が挙げたテーマ候補（すべて仮説）: アプリ開発（Flutter×Windows のつまずき集、SwiftUI マガジン）、デモアプリ（Claude Code で AI 社員システムを作った制作ログ）、将棋（戦法特化の単発・問題集）、スロット（本人実戦データ付き機種まとめ）、テニス（技術1つに絞った練習法）、Switch 2（対戦ゲームの構築記事。有料のソフト攻略は未確認）

### フェーズ3 の残り
- [x] テーマ評価（2026-10-23、marketing-strategist）: data/themes/ に候補8件（すべて candidate、owner_strength は仮置き3）
  - 推奨: claude-code-ai-team-buildlog（この AI 社員システムの制作ログ、980円）。次点: flutter-windows-stumbles（500円）、shogi-opening-counter-single（300円）
  - 計画値: 980円×3本×各月約18本 ≒ 52,920円（手取り80%仮定で約4.2万円）
- [x] オーナー回答（2026-10-23）を owner_strength に反映。強いのは AI社員制作ログ・PWA自作アプリ・スロット（ジャグラー）・将棋（ウォーズ三段、右玉/筋違い角）。Flutter・SwiftUI・テニス・Switch 2 構築は実体験が乏しく 1
- [x] 回答から新候補2件を進行役が追加: pwa-personal-smartphone-apps、juggler-setting-tool（marketing-strategist の評価前。PWA は市場データ未収集）
- [x] オーナーが1本目のテーマに claude-code-ai-team-buildlog（AI社員システムの制作ログ、980円）を選定（2026-10-23）→ status: selected、decided_by: owner
- [x] 記事パッケージ `ai-team-buildlog-01` を作成し planning まで遷移（タイトル未定、価格 980円）
- [x] 進行役のミスと対処: 追加回答の記録で updated_at に未来の時刻（15:10、実際は 15:06）を書いていた → 修正。再発防止として data:check に「5分以上先の retrieved_at / updated_at を検出」を追加（テスト追加、計230件）
- [x] 確認済み（2026-10-23）: 「base」は Supabase とネットショップ BASE の両方を使用経験あり。Mac なし。スロットの実戦記録は GitHub リポジトリ（README あり）にある
- [ ] 推奨テーマの追加調査（market-researcher＋進行役の curl 照合）: Claude Code の CLAUDE.md・Subagent・フックを扱う有料記事の件数・価格・スキ数、013 の照合
- [ ] 未確認事項: 一般会員とプレミアム会員で手数料率に違いがあるか、利用規約本文の自動化に関する条項（2026-10-23-004, 008 の notes 参照）

## フェーズ4（進行中）
- [x] ai-team-buildlog-01 の下書き作成（2026-10-23、editor-writer）: free.md 約1.3万字（本文約5,500字）、paid.md 約3.5万字（本文約17,000字、paywall は1つ）
  - タイトル（meta.json に設定）: 有料第1案「Claude Code の AI社員に「承認・公開」をさせない設計図: CLAUDE.md・settings.json・PreToolUse フックの実例と6つの失敗の直し方」。無料記事の H1 は「Claude Code で「AI社員チーム」を作るときに最初に決めた5つの安全ルールと、実際に起きた6つの失敗」
  - 進行役の確認: 匿名性（アカウント名・URL・パス・ブランチ名なし）、禁止表現なし、paywall 1つ、paid.md 手順4のフック確認コマンドを実行し記事の記述どおり（exit 2 / 0）
  - 執筆担当の指摘で architecture.md の不一致（「4層」→5層、フックは監査ログに記録しない、quality-analyst に Bash なし）を修正
- [ ] **オーナー作業**: `【要オーナー記入】` 8か所を埋める（free.md: 筆者の立場・作った理由・失敗6の気持ち・使ってみた感想・有料記事リンク（公開後）／paid.md: 筆者紹介・失敗6で迷った点・次の一歩）
- [ ] **オーナー判断**: (1) 末尾の「下書きはAI社員が作成」という開示文を残すか (2) Claude Code・Node.js のバージョン、Windows/PowerShell 利用の記載を載せてよいか
- [ ] その後: drafting → qa に遷移し、quality-analyst が fact-integrity-check（F5 は記入完了が条件。有料記事リンクは公開後に入れるため扱いを決める）

## 未実施・保留
- Web 調査（フェーズ3）

## 次の一手
1. 以後、プッシュのたびに GitHub の Actions タブで CI（check）が緑か確認する（赤なら Claude Code に「CI が失敗したので直して」と依頼）
2. フェーズ3の続き（テーマ候補調査）:
> （オーナーが【要オーナー記入】を埋めた後）docs/progress.md を読んで、ai-team-buildlog-01 を qa に進めて quality-analyst で品質チェックして
