# Claude Code の AI社員に「承認・公開」をさせない設計図: CLAUDE.md・settings.json・PreToolUse フックの実例と6つの失敗の直し方

- 価格: 980円
- 確認日: 2026-10-23
- 動作確認した環境: 筆者のクラウド実行環境（Claude Code 2.1.309、Node.js v22.22.0）と、筆者の Windows / PowerShell（Node.js v24.19.0）（出典: docs/progress.md）
- Claude Code の機能や設定の書き方は、バージョンによって変わる可能性があります。導入するときは、お使いのバージョンの公式ドキュメントもあわせて確認してください。

## この記事の対象読者

- Claude Code や AI エージェントに作業を任せ始めたが、勝手に公開・削除・課金されないか不安な人
- `CLAUDE.md` にルールを書いたものの、「本当に守られるのか」が気になっている人
- 権限設定（settings.json）やフックを、実例を見ながら理解したい人

プログラミングの経験が少なくても読めるように書いていますが、設定ファイルやコードの引用が多めです。

## この記事で得られること

- 筆者の AI社員チームで実際に使っている `CLAUDE.md`・`.claude/settings.json`・PreToolUse フックの実例（必要な部分の引用と解説）
- 「承認コマンドを AI に実行させない」ための多層の仕組みと、それぞれの役割
- 本文が1文字でも変わったら承認が無効になる「内容ハッシュ付き承認」の考え方
- 人間の端末でしか動かないコマンドの作り方
- 実際に起きた6つの失敗の経緯と直し方、今も残している制限
- 自分の環境に取り入れるときの手順とチェックリスト

この記事は「この構成なら事故が起きない」と保証するものではありません。筆者の環境で起きたこと・試したことの記録です。

## 目次

1. CLAUDE.md の要点
2. settings.json の deny（禁止）と ask（確認）
3. PreToolUse フックで「実行直前」に止める
4. 状態管理: 承認・公開は人間専用の遷移にする
5. 内容ハッシュ付き承認
6. 人間の端末チェック
7. 整合性チェックで「後から」見つける
8. 6つの失敗と直し方（詳細）
9. 自分の環境に取り入れる手順
10. 導入チェックリスト
11. まとめと次の一歩

## 筆者紹介

【要オーナー記入: 筆者紹介（匿名で書ける範囲。Claude Code の利用歴、プログラミング経験の程度など）について】

<!-- paywall -->

## 1. CLAUDE.md の要点

`CLAUDE.md` は、このプロジェクトで Claude Code が作業前に読むルールファイルです。筆者のチームでは、最優先のルールを次の6項目にまとめています（出典: CLAUDE.md。オーナーの許可を得て引用）。

```markdown
1. **捏造禁止**: 他者の購入数・売上など非公開情報を作らない・断定しない。不明なら「不明」と書く。
2. **出典必須**: 市場データには `source_url` / `retrieved_at`（タイムゾーン付き）/ `method` / `measurement`（observed・estimated・self_reported）を記録する。推定には `estimation_basis` を書く（Skill: `source-recording`）。
3. **承認は人間だけ**: 記事を `approved` / `published` にしない。`npm run approve` と `npm run publish:record` は実行しない。`data/approvals/` を作成・編集しない（Skill: `approval-workflow`）。
4. **不可逆操作は事前確認**: 課金・外部送信（メール/SNS/フォーム/Webhook）・公開・削除・`git push --force`・履歴の書き換えは、オーナーの明示的な承認を得てから行う。
5. **秘密情報**: `.env` を読まない・表示しない・コミットしない。APIキーをコード・ドキュメント・ログに書かない。新しい環境変数は `.env.example` に変数名とダミー値のみ追加する。
6. **既存ファイルを勝手に削除・全面上書きしない**。変更は差分が分かる形で行う。
```

書くときに意識した点は3つです。

**(1) 禁止するだけでなく「代わりにどうするか」を書く。**
たとえばルール3と同じファイルに、「承認系のコマンドがブロックされたら回避策を探さず、オーナーに依頼すること」と書いています。止められた AI が別の書き方で再挑戦しないようにするためです。

**(2) 担当ごとの細かい手順は Skill に分ける。**
「出典の記録形式」「記事の構成」「公開前チェック」「状態遷移と承認」「進捗の引き継ぎ」の5つを `.claude/skills/` に Skill として置き、`CLAUDE.md` や各担当の定義ファイルからは Skill の名前で参照しています。担当（Subagent）は「誰がやるか」、Skill は「どうやるか」という分け方です（出典: docs/architecture.md §2.3）。

**(3) 作業の開始時と終了時にやることを決める。**
開始時に `docs/progress.md` を読んで「次の一手」から再開し、終了時に完了事項・残課題・次の一手を更新する、と書いています。会話が途切れても、ファイルから再開できるようにするためです（出典: CLAUDE.md、docs/architecture.md §6）。

### 担当（Subagent）ごとに道具を絞る

各担当の定義ファイル（`.claude/agents/*.md`）の先頭で、使える道具（tools）を指定しています。たとえば執筆担当はこうです。

```markdown
---
name: editor-writer
description: 選定済みテーマについて note の無料記事・有料記事を執筆・推敲する編集・執筆担当。記事の下書き作成や書き直しを頼まれたときに使う。
tools: Read, Grep, Glob, Write, Edit
---
```

4担当とも、コマンド実行（Bash）は持たせていません。Web検索・Webページ取得を持つのは市場調査担当だけです（出典: .claude/agents/ の各ファイル）。

## 2. settings.json の deny（禁止）と ask（確認）

`.claude/settings.json` の `permissions` に、禁止（deny）と、実行前に人間へ確認する（ask）ルールを書いています。

### 2-1. deny（禁止）の実例

```json
"deny": [
  "Read(./.env)",
  "Read(./.env.local)",
  "Read(./.env.*.local)",
  "Read(./.env.development)",
  "Read(./.env.production)",
  "Read(./.env.staging)",
  "Read(./.env.test)",
  "Read(./secrets/**)",
  "Edit(./.env)",
  "（Edit と Write も Read と同じ .env 系の7種類を禁止。省略）",
  "Edit(./data/approvals/**)",
  "Write(./data/approvals/**)",
  "Bash(npm run approve:*)",
  "Bash(npm run publish:record:*)",
  "Bash(npm run article:archive:*)",
  "Bash(git push --force:*)",
  "Bash(git push -f:*)",
  "Bash(npm publish:*)"
]
```

（出典: .claude/settings.json。紙面の都合で一部を省略し、省略箇所を注記しています）

禁止しているのは大きく4種類です。

| 種類 | 対象 | ねらい |
|---|---|---|
| 秘密ファイルの読み書き | `.env` 系、`secrets/` | APIキーなどを AI の会話に出さない |
| 承認記録の書き込み | `data/approvals/` | 承認記録を AI が作れないようにする |
| オーナー専用コマンド | `approve` / `publish:record` / `article:archive` | 承認・公開記録・中止を AI にさせない |
| 不可逆な操作 | `git push --force` / `-f`、`npm publish` | 履歴の上書きやパッケージ公開を防ぐ |

### 2-2. ask（確認）の実例

```json
"ask": [
  "Bash(rm:*)",
  "Bash(git reset --hard:*)",
  "Bash(git clean:*)",
  "Bash(curl:*)",
  "Bash(wget:*)",
  "Bash(npm install:*)"
]
```

（出典: .claude/settings.json）

削除系（`rm`、`git reset --hard`、`git clean`）、外部との通信（`curl`、`wget`）、パッケージの追加（`npm install`）は、禁止まではせず、実行前に人間の確認を挟む設定にしています。CLAUDE.md のルール4「不可逆操作は事前確認」を、設定の側でも支える位置づけです。

### 2-3. ここで起きた2つの失敗

この settings.json では、実際に2つの失敗が起きました。詳しくは「8. 6つの失敗と直し方」に書きますが、要点だけ先に書きます（出典: docs/progress.md「解決済みの問題」）。

- **`Bash(npm run approve:*)` が、書き方を変えたコマンドをすり抜けた。** 前方一致の判定なので、`npm run -s approve` のように途中にオプションを挟むと一致しませんでした。→ 次の「3. フック」で塞いでいます。
- **`.env.*` の禁止が広すぎた。** 見本ファイル `.env.example` まで読めなくなりました。→ 上の引用のように、具体的なファイル名の列挙に変えました。

つまり、settings.json の deny は「よくある書き方を止める1枚目の壁」で、これだけに頼らない、というのがこのチームの結論です。

## 3. PreToolUse フックで「実行直前」に止める

フックは、Claude Code が道具（コマンド実行やファイル書き込み）を使う直前に、自分で用意したプログラムを動かす仕組みです。このチームでは PreToolUse（道具を使う前）のフックとして `.claude/hooks/approval-guard.mjs` を登録しています。

### 3-1. 登録の仕方

```json
"hooks": {
  "PreToolUse": [
    {
      "matcher": "Bash|Write|Edit|MultiEdit|NotebookEdit",
      "hooks": [
        {
          "type": "command",
          "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/approval-guard.mjs\"",
          "timeout": 10
        }
      ]
    }
  ]
}
```

（出典: .claude/settings.json）

- `matcher`: どの道具のときにフックを動かすか。コマンド実行（Bash）とファイル書き込み系（Write / Edit / MultiEdit / NotebookEdit）を対象にしています。
- `command`: 動かすプログラム。`$CLAUDE_PROJECT_DIR` はプロジェクトのフォルダを指す変数として使っています。
- `timeout`: 10 秒。

### 3-2. 判定ルールの一覧

フックは、これから実行されるコマンドや書き込み先を受け取り、「許可（allow）」「禁止（deny）」「人間に確認（ask）」のどれかを返します（出典: .claude/hooks/approval-guard.mjs）。

**コマンド実行（Bash）の場合**

| 条件 | 判定 |
|---|---|
| `npm` / `pnpm` / `yarn` / `npx` / `bun` / `tsx` / `node`（または `cli/index` を含む実行）の引数に、`approve` / `publish:record` / `article:archive` がそのまま含まれる | 禁止 |
| `>` などのリダイレクトの書き込み先が `data/approvals/` または `.env` 系 | 禁止 |
| `rm` / `mv` / `cp` / `tee` / `touch` / `ln` / `install` / `rsync` / `truncate` / `dd`、または `sed -i` が `data/approvals/` を対象にしている | 禁止 |
| `sh` / `bash` / `zsh` / `dash` の `-c` や `eval` で包まれたコマンド | 中身を取り出して同じルールで判定 |
| 入れ子が深すぎて確認できない | 禁止 |
| それ以外 | 許可 |

判定の前に、次の下ごしらえをしています。

- `;` `&` `|` 改行 `(` `)` などでコマンドを区切り、1つずつ判定する（`cd x && npm run approve` のような連結も見逃さないため）
- 先頭の `sudo` / `env` / `time` / `nice` / `nohup` / `command` / `exec` / `xargs` や、`A=1` のような環境変数の指定を読み飛ばし、本当のコマンド名を見る
- ヒアドキュメント（`<<EOF` 〜 `EOF`）の本文は取り除く（コミットメッセージに「approve」という単語が入っているだけで止めてしまわないため）

**ファイル書き込み（Write / Edit など）の場合**

| 書き込み先 | 判定 |
|---|---|
| `data/approvals/` の中 | 禁止 |
| `.env` 系の秘密ファイル | 禁止 |
| `.claude/settings.json`、`.claude/hooks/` の中 | 人間に確認 |
| それ以外 | 許可 |

守りの設定そのもの（settings.json とフック）を AI が書き換えようとしたら、人間に確認ダイアログを出す、という点がポイントです。

**入力が読めなかった場合は「禁止」に倒します。** フックが受け取ったデータを解釈できないときは、許可ではなく拒否を返す作りです。また、追加のパッケージに依存しないので、`npm install` の前でも動きます。

### 3-3. コードの要点

判定に使う一覧はファイルの先頭にまとめています。

```js
export const OWNER_COMMANDS = ["approve", "publish:record", "article:archive"];
const RUNNERS = new Set(["npm", "pnpm", "yarn", "npx", "bun", "tsx", "node"]);
const WRAPPERS = new Set(["sudo", "env", "time", "nice", "nohup", "command", "exec", "xargs"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);
```

（出典: .claude/hooks/approval-guard.mjs）

結果の返し方は次のとおりです。

```js
if (result.decision === "deny") {
  process.stderr.write(`承認ガード: ${result.reason}\n`);
  process.exit(2); // exit 2 = ツール実行をブロックし、理由を Claude に伝える
}
if (result.decision === "ask") {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: result.reason,
      },
    }),
  );
}
process.exit(0);
```

（出典: .claude/hooks/approval-guard.mjs）

- 禁止のときは、理由を標準エラーに書いて終了コード 2 で終わる。このチームの環境では、これでコマンドが止まり、理由が Claude Code の画面に表示されました。
- 確認のときは、`permissionDecision: "ask"` を含む JSON を出力する。
- 許可のときは、何も出力せず終了コード 0。

禁止の理由文には「オーナー自身のターミナルで実行してもらうよう依頼してください」と書いています。止められた AI が、次に何をすべきかが分かるようにするためです。

このフックは、筆者のセッションで実際に承認コマンドがブロックされることを確認し、20通りの書き方をテストで確かめています（出典: docs/progress.md「フェーズ2」「解決済みの問題」）。

### 3-4. 分かっている制限

完全なシェルの解析ではないので、次の制限を認識したうえで使っています（出典: docs/progress.md「既知の制限」）。

- `python3 -c` 経由など、想定していない書き方は検出できない。その場合は、後ろの層（6. 人間の端末チェック、7. 整合性チェック）で止める前提。
- `npm test -- -t approve` のように、引数に単独の `approve` を含むコマンドは誤って止めてしまう（実害が小さいので許容）。
- フックが止めた記録は監査ログには残していない（画面に理由が出るだけ）。

## 4. 状態管理: 承認・公開は人間専用の遷移にする

記事は「状態」で管理しています（出典: docs/architecture.md §3）。

```
idea → researching → planning → drafting → qa → awaiting_approval → approved → published
                         needs_revision（差し戻し） / archived（中止・オーナーのみ）
```

（出典: .claude/skills/approval-workflow/SKILL.md）

状態を変えるプログラム（TypeScript で作った小さなコマンド群）では、遷移ごとに「誰が実行できるか」と「満たすべき条件」を表にしています。承認と公開の部分はこうです。

```ts
{ from: "awaiting_approval", to: "approved", actors: OWNER_ONLY, guard: requireApprovalMatch },
// 承認後に本文が変わった場合などの承認取り消し（安全側の遷移なので AI も可）
{ from: "approved", to: "awaiting_approval", actors: BOTH, guard: requireReason },
{
  from: "approved",
  to: "published",
  actors: OWNER_ONLY,
  guard: all(requireApprovalMatch, requireNoteUrl),
},
```

（出典: src/domain/state-machine.ts）

- `approved`（承認済み）、`published`（公開済み）、`archived`（中止）への遷移は、実行者がオーナーのときだけ通る。
- 逆に「承認を取り消して承認待ちに戻す」のは安全側の操作なので AI にも許している。
- 品質チェックに進むには、有料記事の中に「無料部分と有料部分の境目を示す目印」がちょうど1つ必要、などの条件もここで判定しています。

AI が普段使う状態変更コマンド（`article:transition`）は、常に「AI」として実行される設計です。オーナー専用の遷移は、`approve` と `publish:record` という別のコマンドだけが扱います（出典: docs/progress.md「実装メモ」）。

そして、状態は `meta.json` を直接書き換えず、このコマンド経由で変えるルールにしています（出典: CLAUDE.md）。直接書き換えた場合は、7. の整合性チェックで「状態と履歴の不一致」として見つかります。

## 5. 内容ハッシュ付き承認

「承認した版と、実際に公開した版が同じか」を機械的に確かめるため、承認を本文の**ハッシュ値**（内容から計算する指紋のような文字列）に結びつけています（出典: docs/tech-decisions.md ADR-007、docs/requirements.md FR-5.3）。

```ts
export function contentHash(content: ArticleContent): string {
  // 各要素の境目があいまいにならないよう、JSON にしてからハッシュする
  const canonical = JSON.stringify({
    v: 1,
    title: normalizeText(content.title),
    price_jpy: content.price_jpy,
    free: normalizeText(content.free),
    paid: normalizeText(content.paid),
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
```

（出典: src/domain/hash.ts）

ポイントは次の3つです。

- **対象はタイトル・価格・無料記事・有料記事の4つ。** どれか1文字でも変われば、ハッシュ値が変わり、承認は無効になります。
- **改行コードと BOM だけはそろえてから計算する。** Windows と Linux で改行コードが違っても、見た目が同じ本文なら同じハッシュになるようにしています。
- **公開記録のときにもう一度照合する。** 承認後に本文を直した場合は、承認待ちに戻して再承認する運用です（出典: docs/progress.md「実装メモ」）。

これで、「AI が承認後にこっそり本文を直した」「承認したつもりの版と違うものを投稿した」といった食い違いを、公開記録の時点で止められます。

## 6. 人間の端末チェック

オーナー専用のコマンド（`approve` / `publish:record` / `article:archive`）は、プログラムの中でも「人間が操作している端末か」を確認しています。

```ts
export function checkHumanTerminal(info: TerminalInfo): string[] {
  const errors: string[] = [];
  if (info.env.CLAUDECODE) {
    errors.push("Claude Code の中からは実行できません。オーナー自身のターミナルで実行してください。");
  }
  if (!info.stdinIsTTY || !info.stdoutIsTTY) {
    errors.push("対話できる端末（TTY）で実行してください（パイプや自動実行では動きません）。");
  }
  return errors;
}
```

（出典: src/cli/human-guard.ts）

- このファイルのコメントにあるとおり、筆者の環境では Claude Code のコマンド実行には環境変数 `CLAUDECODE` が設定されており、対話できる端末（TTY）でもありません。どちらかに当てはまれば実行を拒否します。
- さらに、`approve` は記事IDの再入力、`publish:record` は `yes` の入力を求めます（出典: src/cli/index.ts）。

settings.json とフックを万一すり抜けても、ここで止まる、という位置づけです。筆者は自分の Windows / PowerShell で、練習用データを使って `approve` → `publish:record` → 状態確認 → 整合性チェックまでが対話確認つきで動くことを確かめました（出典: docs/progress.md「オーナーに確認してほしいこと」）。

## 7. 整合性チェックで「後から」見つける

止める仕組みに加えて、「おかしな状態になっていないか」を後から点検するコマンド `npm run data:check` を用意しています。検出するものは次のとおりです（出典: docs/progress.md「フェーズ2」「フェーズ3 の残り」）。

- 状態と履歴の不一致（`meta.json` の状態を直接書き換えた跡）
- オーナー以外による承認系の遷移の記録
- 承認記録の欠落、承認記録のハッシュと本文の不一致、対応する記事のない承認記録
- 出典項目が欠けた市場データ、不正なテーマ記録、壊れた監査ログ
- 現在より5分以上先の取得日時・更新日時（失敗5のあとに追加）

コミット前に実行する `npm run check` は、型チェック → テスト → 秘密情報スキャン → 整合性チェックの順に動きます（出典: package.json）。秘密情報スキャンは、見つけても値は表示せず「ファイル:行: 種類」だけを出し、`.env` などはファイル名だけ報告して中身は読まない作りです（出典: docs/progress.md「フェーズ2」）。

この記事の確認日時点で、テストは230件です（出典: docs/progress.md「フェーズ3 の残り」）。GitHub Actions でも、Ubuntu と Windows でこのチェックを動かしています（出典: docs/progress.md「フェーズ2 手順10」）。

## 8. 6つの失敗と直し方（詳細）

ここからは、制作ログ（docs/progress.md）に記録した失敗を、経緯・原因・直し方・残った注意点の順に書きます。

### 失敗1: deny ルールのすり抜け

- **経緯**: settings.json に `Bash(npm run approve:*)` を書いて承認コマンドを禁止していた。
- **原因**: 前方一致の判定なので、`npm run -s approve` のように途中にオプションを挟んだ書き方は一致しなかった。
- **直し方**: 3. の PreToolUse フックを追加し、コマンドを単語に分けてから「実行プログラム＋オーナー専用コマンド名」を探す方式にした。`bash -c` で包んだ書き方や、`npx tsx src/cli/index.ts approve` のように直接プログラムを呼ぶ書き方も対象にし、20通りの書き方をテストで確認した。
- **残った注意点**: 3-4 の制限（`python3 -c` 経由などは検出できない）。後段の端末チェックと整合性チェックで補う。

（出典: docs/progress.md「解決済みの問題」「フェーズ2」「既知の制限」）

### 失敗2: .env の禁止範囲が広すぎた

- **経緯**: `Read(./.env.*)` などで `.env` で始まるファイルをまとめて禁止していた。
- **原因**: この書き方が、秘密情報を含まない見本ファイル `.env.example` にも一致した。
- **直し方**: 禁止対象を `.env`、`.env.local`、`.env.*.local`、`.env.development`、`.env.production`、`.env.staging`、`.env.test` に限定し、書き込み（Write）も同じ範囲で禁止した。`.env.example` は AI から読み書きできるようになった。この変更はオーナーの了承を得てから行った。
- **残った注意点**: リストにない名前の秘密ファイル（例: `.env.mine`）は禁止の対象外。秘密ファイルは `.env` か `.env.local` を使うと決めた（Git には `.gitignore` の `.env.*` で入らない）。

（出典: docs/progress.md「解決済みの問題」「残課題」）

### 失敗3: 調査担当が取得日時に「00:00」を仮置きした

- **経緯**: note の手数料などを調べた市場データの取得日時が `00:00` になっていた。
- **原因**: 調査担当（Subagent）はコマンド実行（Bash）を持たないため、現在時刻を調べる手段がなかった。再発防止のルールに「Bash がない Subagent など」と書いたのはこのため。
- **直し方**: 実際の作業時間帯（13:54〜13:58 JST）の上限である 13:58 に直し、データのメモ欄（notes）に経緯を書いた。再発防止として、出典記録の Skill と調査担当の定義に「仮の時刻を書かない」「進行役が依頼文に現在時刻を書く」を追加した。
- **ルールの実際の文面**:

```markdown
- 現在時刻を取得できない場合（Bash がない Subagent など）は、`T00:00:00` などの**仮の時刻を書かない**。
- 進行役は委任するときにプロンプトへ現在時刻を書く。Subagent は、作業時刻がそこから大きくずれない前提でその時刻を使い、`notes` にその旨を書く。
- 時刻がまったく分からない場合は保存せず、記録内容を報告して進行役に保存を任せる。
```

（出典: docs/progress.md「フェーズ3」、.claude/skills/source-recording/SKILL.md）

同じ調査では、調査担当の記録漏れ（支払い方法ごとの手数料の一部）を、進行役が照合して追記しています。調査担当の結果を、別の目で照合する流れが役に立った例です（出典: docs/progress.md「フェーズ3」）。

### 失敗4: 調査担当が未来の時刻を書いた

- **経緯**: テーマ候補の調査で、取得日時が実際の作業時刻より先（最大 14:55）になっていた。
- **原因**: 作業の経過時間を見積もって時刻を書いていた。
- **直し方**: 実作業の上限である 14:43 に直し、notes に経緯を記録した。

（出典: docs/progress.md「テーマ候補調査」）

失敗3を受けて「仮の時刻を書かない」と決めた直後に、今度は「見積もりの時刻」という別の形で同じ種類の問題が起きた、という点が教訓でした。

### 失敗5: 進行役自身も未来の時刻を書いた

- **経緯**: オーナーの回答を記録したとき、進行役（メインの会話）が更新日時に 15:10 と書いたが、実際は 15:06 だった。
- **直し方**: 修正したうえで、`data:check` に「5分以上先の取得日時・更新日時を検出する」チェックを追加し、テストも追加した。

（出典: docs/progress.md「フェーズ3 の残り」）

担当 AI を注意していた側も同じミスをしたので、「人（AI）に気をつけてもらう」から「機械で検出する」に切り替えました。

### 失敗6: Windows で NGT_ROOT の設定を飛ばした

- **経緯**: 筆者が自分の Windows / PowerShell で承認コマンドを試すとき、練習用データの場所を指定する `$env:NGT_ROOT` の設定を飛ばしたため、「記事が見つかりません」というエラーになった。
- **背景**: このチームでは、動作確認のときに `NGT_ROOT` で練習用フォルダを指定し、本物のデータを変更しない運用にしている（出典: CLAUDE.md）。
- **直し方**: 練習用データを作るコマンド（`npm run demo:setup`）の案内を、OS 別・番号付きにした。今は次のような形で表示されます（フォルダの場所は環境によって変わるため伏せています）。

```
次のコマンドを、上から1行ずつ実行してください（1行目を飛ばすと本物の data/ を見てしまいます）:

  1. $env:NGT_ROOT="<練習用フォルダの場所>"
  2. npm run approve -- <記事ID>        （記事IDの入力を求められたら <記事ID> と入力）
  3. npm run publish:record -- <記事ID> https://note.com/demo/n/n0000000000   （yes と入力）
  4. npm run article:status
  5. npm run data:check
```

あわせて、記事が見つからないときのエラーに「探した場所」を表示するようにしました。

（出典: docs/progress.md「オーナーに確認してほしいこと」、scripts/demo-setup.ts、src/storage/repository.ts）

【要オーナー記入: 失敗6のとき、どこで迷ったか・どう気づいたかについて】

## 9. 自分の環境に取り入れる手順

ここまでの仕組みを、自分のプロジェクトに取り入れるときの順番です。筆者のチームで作った順番をもとに、小さく始められるように並べ直しています。

### 手順1: CLAUDE.md に「最優先ルール」と「止められたときの行動」を書く

1. の6項目を参考に、自分のプロジェクトで AI にさせたくないこと（公開・課金・削除・秘密情報の読み取りなど）を書きます。
「ブロックされたら回避策を探さず、人間に依頼する」も一緒に書いておきます。

### 手順2: 担当（Subagent）の道具を絞る

`.claude/agents/<担当名>.md` の先頭の `tools:` に、その担当に必要な道具だけを書きます。コマンド実行（Bash）は、本当に必要な担当以外には持たせない、から始めるのがおすすめです。

### 手順3: settings.json に deny と ask を書く

2. の引用を参考に、次の3つを書きます。

- deny: 秘密ファイルの読み書き、人間専用のコマンド、取り返しのつかないコマンド
- ask: 削除、外部通信、パッケージの追加
- `.env.*` のようにまとめて書くと見本ファイルまで巻き込むことがあるので、対象のファイル名を確認する（失敗2）

### 手順4: PreToolUse フックを追加する

3-1 のように `hooks` を登録し、3-2 の判定ルールを参考にフックのプログラムを書きます。最低限、次の3点を入れておくと、このチームで起きたすり抜け（失敗1）を防ぎやすくなります。

- コマンドを単語に区切り、オプションの位置に関係なく「人間専用のコマンド名」を探す
- `bash -c` などで包まれたコマンドは中身も調べる
- 入力が読めないときは禁止に倒す

**フックが動くかの確認方法**（Mac / Linux の bash の例。プロジェクトのフォルダで実行します）:

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"npm run -s approve -- demo"}}' | node .claude/hooks/approval-guard.mjs
echo $?
```

このチームのフックでは、`承認ガード: 「approve」はオーナー専用コマンドです。…` という理由が表示され、終了コードは `2` になります。比較として、`npm run article:status` のような普通のコマンドに変えると、何も表示されず `0` になります。PowerShell での同じ確認方法は、筆者は未確認です。

### 手順5: 人間専用のコマンドに「端末チェック」と「再入力」を入れる

6. のように、`CLAUDECODE` という環境変数があるとき、または対話できる端末でないときは実行を拒否し、記事IDなどの再入力を求めます。

### 手順6: 承認を内容ハッシュに結びつける

5. のように、承認時に本文のハッシュ値を記録し、公開記録のときにもう一度計算して照合します。

### 手順7: 後から点検するチェックを用意する

7. のように、状態の直接書き換え・承認記録の食い違い・未来の日時などを検出するコマンドを作り、コミット前に実行します。

### 手順8: 練習用データで、人間の手で一度通してみる

本物のデータとは別の練習用フォルダを用意し、承認 → 公開記録 → 状態確認 → 点検まで、自分の端末で一度通してみます。環境変数の設定漏れ（失敗6）のような人間側のつまずきも、ここで見つかります。

## 10. 導入チェックリスト

- [ ] CLAUDE.md に、AI にさせないこと（承認・公開・課金・削除・秘密情報）を書いた
- [ ] CLAUDE.md に「止められたら回避策を探さず人間に依頼する」と書いた
- [ ] 各担当の `tools:` を必要最小限にした
- [ ] settings.json の deny に、秘密ファイル・人間専用コマンド・不可逆なコマンドを入れた
- [ ] settings.json の ask に、削除・外部通信・パッケージ追加を入れた
- [ ] `.env` 系の禁止範囲が、見本ファイルまで巻き込んでいないか確認した
- [ ] PreToolUse フックで、オプションを挟んだ書き方や `bash -c` 経由も止まることを確認した
- [ ] フックが、守りの設定（settings.json とフック自身）の変更を人間に確認するようにした
- [ ] 人間専用のコマンドが、Claude Code の中から実行すると拒否されることを確認した
- [ ] 承認後に本文を1文字変えると、公開記録がエラーになることを確認した
- [ ] 未来の日時や状態の直接書き換えを検出するチェックを用意した
- [ ] 練習用データで、承認から公開記録までを自分の端末で一度通した

## 11. まとめと次の一歩

このチームでやったことを一言でまとめると、**「AI へのお願い（CLAUDE.md）」を、「設定・フック・プログラム・点検」で何重にも裏打ちした**ということです。

そして、実際に起きた失敗は、どれも「ルールは書いてあったのに、別の形ですり抜けた」ものでした。禁止ルールは書き方の違いで、時刻のルールは見積もりという形で、人間の手順は1行の飛ばしで。だからこそ、1つの仕組みに頼らず、後から機械で見つける仕組みを足し続けています。

このチームは「note で月5万円の売上」を目標にしていますが、この記事の時点で売上はまだありません。この仕組みが売上につながるかどうかは、これからの記録で確かめていきます。

【要オーナー記入: 読者への次の一歩の提案や、今後の制作ログの予定について】

この記事の下書きは、ここで紹介した AI社員チームの執筆担当が、設計書・設定ファイル・制作ログだけを材料に作成しました。品質担当のチェックと、筆者の確認・承認を経て公開しています。

### この記事の根拠資料（筆者のリポジトリ内のファイル）

CLAUDE.md、README.md、docs/requirements.md、docs/architecture.md、docs/tech-decisions.md、docs/progress.md、.claude/settings.json、.claude/hooks/approval-guard.mjs、.claude/agents/*.md、.claude/skills/*/SKILL.md、src/domain/state-machine.ts、src/domain/hash.ts、src/cli/human-guard.ts、src/cli/index.ts、scripts/demo-setup.ts、package.json
