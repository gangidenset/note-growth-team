---
name: source-recording
description: 市場データを出典・取得日時・取得方法・実測/推定区分つきで data/market/ に記録する手順。市場調査結果やテーマの根拠データを保存するときに使う。
---

# 市場データの記録手順

## ファイル
`data/market/<YYYY-MM-DD>-<連番3桁>.json`（1件=1ファイル）

## 形式
```json
{
  "id": "2026-10-23-001",
  "topic": "テーマ候補名",
  "source_url": "https://note.com/...",
  "source_title": "ページのタイトル",
  "retrieved_at": "2026-10-23T10:15:00+09:00",
  "method": "web_fetch",
  "measurement": "observed",
  "metrics": { "price_jpy": 980, "likes": 120, "published_on": "2026-09-01" },
  "estimation_basis": null,
  "notes": "観測した事実のみ。解釈は分けて書く",
  "collected_by": "market-researcher"
}
```

## 項目ルール
| 項目 | 値 |
|---|---|
| `method` | `manual`（人が目視）/ `web_search` / `web_fetch` / `official_api` / `owner_dashboard` |
| `measurement` | `observed`（ページに表示された値）/ `estimated`（計算・推論）/ `self_reported`（自アカウントの実績） |
| `retrieved_at` | 実際に取得した日時。タイムゾーン必須。推測で埋めない |
| `estimation_basis` | `estimated` のとき必須。元データID・計算式・仮定を書く |

## 禁止
- 他者の購入数・売上を、公開表示がないのに数値として記録すること
- 取得していない値、読めなかった値を埋めること（`null` とし `notes` に理由）
- 記事本文の大量コピー
