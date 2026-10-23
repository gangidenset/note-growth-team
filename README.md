# Note Growth Team

note での記事販売（目標: 月間売上5万円）を支援する、Claude Code ベースの「AI社員システム」です。
市場調査 → テーマ選定 → 無料/有料記事の作成 → 品質チェック → **人間の承認** → 公開（手動）→ 実績分析、の流れを管理します。

> 現在はフェーズ1（設計）完了段階です。CLI などの実装はフェーズ2で行います。進捗は [docs/progress.md](docs/progress.md) を参照してください。

## 特徴
- 4人のAI社員（Subagent）: 市場調査 / マーケティング / 編集・執筆 / 品質・分析
- 市場データには出典・取得日時・取得方法・実測/推定の区分を必ず記録
- 承認はシステムの状態管理で強制（AIは承認・公開できない）
- 中断しても `docs/progress.md` とデータファイルから再開可能

## ドキュメント
| ファイル | 内容 |
|---|---|
| [docs/requirements.md](docs/requirements.md) | 要件定義 |
| [docs/architecture.md](docs/architecture.md) | アーキテクチャ・状態機械・承認ゲート |
| [docs/business-plan.md](docs/business-plan.md) | 事業計画（数値は計画値・仮定） |
| [docs/tech-decisions.md](docs/tech-decisions.md) | 技術選定の理由と代替案 |
| [docs/implementation-plan.md](docs/implementation-plan.md) | フェーズ2以降の実装計画・テスト計画 |
| [docs/progress.md](docs/progress.md) | 進捗・残課題・次の一手 |
| [CLAUDE.md](CLAUDE.md) | Claude Code が従う運用ルール |

## セットアップ（初心者向け）
必要なもの: Git、Node.js 22 以上、Claude Code

```bash
git clone https://github.com/gangidenset/note-growth-team.git
cd note-growth-team
cp .env.example .env      # .env を作成（Gitには登録されません）
# エディタで .env を開き、必要な値を自分で入力する（チャットに貼り付けないこと）
claude                    # Claude Code を起動
```

起動後は、たとえば次のように頼みます:
- 「docs/progress.md を読んで、次の作業を進めて」
- 「market-researcher でテーマ候補を5件、出典付きで調べて」

## 承認と公開の流れ（フェーズ2以降）
1. AI社員が記事を `awaiting_approval`（承認待ち）まで進める
2. オーナーが**自分のターミナルで** `npm run approve -- <記事ID>` を実行（Claude Code からは実行不可）
3. オーナーが note の画面で手動投稿
4. `npm run publish:record -- <記事ID> <公開URL>` で公開を記録

承認後に本文を変更すると承認は無効になり、再承認が必要です。

## 安全ルール
- APIキーなどの秘密情報は `.env` にのみ保存し、Git にコミットしない
- 課金・外部送信・公開・削除は必ず事前承認
- 他者の売上・購入数など非公開情報を捏造しない
