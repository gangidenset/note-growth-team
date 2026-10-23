# アーキテクチャ設計書

- 版: v0.1（フェーズ1）
- 作成日: 2026-10-23

## 1. 全体像

```
                       ┌──────────────────────────────┐
  オーナー（人間）──────▶│ Claude Code メインセッション   │  技術責任者 / 進行役
   指示・承認・公開      │  CLAUDE.md の規則に従う       │
                       └──────┬───────────────────────┘
                              │ Subagent に委任
     ┌──────────────┬─────────┴─────┬────────────────┐
     ▼              ▼               ▼                ▼
 market-researcher  marketing-     editor-writer    quality-analyst
 市場調査           strategist     編集・執筆       品質・分析
                    マーケティング
     │              │               │                │
     └──────── 共通 Skills（.claude/skills/）─────────┘
       source-recording / note-article-structure /
       fact-integrity-check / approval-workflow / progress-handoff
                              │
                              ▼
                ┌───────────────────────────┐
                │ ngt CLI（TypeScript, Phase2）│  状態機械・検証・監査ログ
                └───────────┬───────────────┘
                            ▼
                  data/（JSON + Markdown, Git管理）
                            │
     オーナーが自分の端末で ──┘ `npm run approve` → 手動でnoteに投稿 → `npm run publish:record`
```

ポイントは「**AIが書けるのは下書きと記録まで。承認と公開は人間の手元でしか起きない**」こと。

## 2. コンポーネント

### 2.1 Claude Code メインセッション（進行役）
- `CLAUDE.md` を読み、`docs/progress.md` から作業を再開する。
- タスクを分解して各 Subagent に委任し、成果物を集約する。
- 状態遷移は自分でファイルを書き換えず、必ず `ngt` CLI 経由で行う（フェーズ2以降）。

### 2.2 Subagents（`.claude/agents/`）

| ファイル | 役割 | 主な出力先 | 許可ツール（案） |
|---|---|---|---|
| `market-researcher.md` | テーマ候補発見、競合観測、出典記録 | `data/market/` | Read, Grep, Glob, Write, Edit, WebSearch, WebFetch |
| `marketing-strategist.md` | テーマ選定、価格・導線設計、売上シナリオ | `data/themes/` | Read, Grep, Glob, Write, Edit |
| `editor-writer.md` | 無料・有料記事の執筆と推敲 | `data/articles/<id>/` | Read, Grep, Glob, Write, Edit |
| `quality-analyst.md` | 公開前チェック、捏造検知、公開後の実績分析 | `data/articles/<id>/qa.json`, `reports/` | Read, Grep, Glob, Write（Bash は未付与。検証コマンドは進行役が実行） |

- どの Subagent も **承認・公開・削除・課金・外部送信の権限を持たない**。
- Bash を与えるのは quality-analyst のみ（検証コマンド実行用）。

### 2.3 Skills（`.claude/skills/<name>/SKILL.md`）

| Skill | 内容 | 主な利用者 |
|---|---|---|
| `source-recording` | 市場データの記録形式（出典・取得日時・方法・実測/推定）と禁止事項 | market-researcher, marketing-strategist |
| `note-article-structure` | 無料記事・有料記事の構成テンプレート、境界線の置き方 | editor-writer, marketing-strategist |
| `fact-integrity-check` | 公開前チェックリスト、捏造・誇大表現の検出手順 | quality-analyst |
| `approval-workflow` | 状態機械と「AIがしてはいけない遷移」のルール | 全員 |
| `progress-handoff` | `docs/progress.md` の更新手順（中断・再開用） | 全員・メインセッション |

Subagent は「誰が担当するか」、Skill は「どうやるか（共通手順）」を定義する。手順を Skill に寄せることで、担当を増やしても品質基準が揃う。

### 2.4 ngt CLI（フェーズ2で実装）
Node.js + TypeScript の小さなコマンド群。`package.json` の `scripts` から呼ぶ。

| コマンド | 実行者 | 内容 |
|---|---|---|
| `npm run market:validate` | AI/人 | `data/market/` の全レコードをスキーマ検証 |
| `npm run article:new -- <slug>` | AI/人 | 記事パッケージを `idea` 状態で作成 |
| `npm run article:transition -- <id> <to>` | AI/人 | 許可された遷移のみ実行（`approved`/`published` は不可） |
| `npm run article:status` | AI/人 | 全記事の状態一覧 |
| `npm run approve -- <id>` | **人のみ** | 内容ハッシュを計算し承認記録を作成（TTYで対話確認） |
| `npm run publish:record -- <id> <url>` | **人のみ** | ハッシュ照合後、公開URLを記録し `published` へ |
| `npm run check` | AI/人 | 型チェック・lint・テスト・秘密情報スキャン |

### 2.5 データストア（`data/`、Git管理）

```
data/
  market/            市場データ 1件=1 JSON（例 2026-10-23-001.json）
  themes/            テーマ評価・選定記録 1テーマ=1 JSON
  articles/<id>/
    meta.json        状態、テーマID、価格、タイトル案、更新履歴
    free.md          無料記事
    paid.md          有料記事（<!-- paywall --> で境界）
    qa.json          品質チェック結果
  approvals/<id>.json 承認記録（approver, approved_at, content_sha256）
  performance/       オーナーが入力した自社実績（self_reported）
  audit.log.jsonl    追記専用の監査ログ
reports/             週次・月次の分析レポート
```

## 3. 記事の状態機械

```
idea → researching → planning → drafting → qa ──▶ awaiting_approval ──▶ approved ──▶ published
                         ▲          ▲       │              │                │
                         └──────────┴─ needs_revision ◀────┘ (差し戻し)       │(本文変更でハッシュ不一致
                                                                              →承認無効→awaiting_approval)
   どの状態からでも → archived（中止。オーナーのみ）
```

| 遷移 | 実行できる者 | ガード条件 |
|---|---|---|
| idea → researching → planning → drafting | AI/人 | 前段の成果物ファイルが存在 |
| drafting → qa | AI/人 | `free.md` と `paid.md` が存在し、paywall 境界がある |
| qa → awaiting_approval | AI/人 | `qa.json` が全項目完了、重大(critical)指摘ゼロ |
| qa / awaiting_approval → needs_revision | AI/人 | 理由の記載必須 |
| awaiting_approval → approved | **人のみ** | TTY確認、承認者名、内容ハッシュを記録 |
| approved → published | **人のみ** | 現在の内容ハッシュ＝承認時ハッシュ、公開URLが note.com ドメイン |
| * → archived | **人のみ** | 理由の記載必須 |

## 4. 承認ゲートの多層防御

単一の仕組みに頼らず、5層で「AIによる承認・公開」を防ぐ。

1. **ドメイン層（CLI）**: `approved`/`published` への遷移は `article:transition` では拒否。専用コマンドのみが扱う。
2. **対話確認**: `approve` は TTY（人が操作する端末）でのみ動作し、記事ID の再入力を求める。非対話実行（Claude Code の Bash など）では失敗する。
3. **Claude Code 設定**: `.claude/settings.json` の `permissions.deny` で `npm run approve` / `npm run publish:record` を禁止。`data/approvals/**` への書き込みも禁止。
4. **フック（フェーズ2）**: PreToolUse フックで上記コマンドや承認ファイル編集を検知してブロックし、理由を Claude Code の画面に表示する（監査ログには記録しない）。
5. **整合性検証**: `npm run check` が「承認記録のハッシュと本文が一致しない `published` 記事」や「承認記録のない `approved` 記事」を検出してテスト失敗にする。

## 5. 秘密情報の扱い

- 秘密情報は `.env`（Git対象外）に置き、`.env.example` には**変数名とダミー値だけ**を書く。
- `.claude/settings.json` で `Read(./.env)` 等を deny し、Claude Code が中身を読まないようにする。
- `npm run check` に簡易シークレットスキャン（`sk-ant-` 等のパターン検出）を含める。将来は gitleaks 等の導入を検討（docs/tech-decisions.md）。

## 6. 中断・再開の仕組み

- **状態はすべてファイル**（`meta.json` と `audit.log.jsonl`）。会話の記憶に依存しない。
- `docs/progress.md` に「現在地・完了・残課題・次の一手」を記録。CLAUDE.md で開始時に読む・終了時に更新すると規定。
- 作業の区切りごとに Git コミットし、履歴でも追えるようにする。
