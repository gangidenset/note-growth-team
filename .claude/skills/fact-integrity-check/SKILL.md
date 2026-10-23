---
name: fact-integrity-check
description: 公開前の記事を事実・出典・捏造・誇大表現・著作権・規約の観点でチェックし qa.json に記録する手順。記事レビューや承認待ちに進める前に使う。
---

# 公開前チェックリスト

各項目を `pass` / `fail` / `not_checked` で判定し、`data/articles/<id>/qa.json` に記録する。

| ID | 観点 | fail 時の重大度 |
|---|---|---|
| F1 | すべての数値・事実主張に出典がある | critical |
| F2 | 出典の内容と記事の記述が一致する（市場データを開いて照合） | critical |
| F3 | 他者の購入数・売上を断定していない／推定は推定と明記 | critical |
| F4 | 架空の体験談・架空の実績・架空の口コミがない | critical |
| F5 | `【要オーナー記入】` が残っていない | critical |
| F6 | 誇大表現・収益保証がない | major |
| F7 | 引用が最小限で出典明記、他者文章の複製がない | critical |
| F8 | paid.md に `<!-- paywall -->` がちょうど1つ | critical |
| F9 | タイトル・価格が meta.json と一致 | major |
| F10 | 個人情報・秘密情報が含まれていない | critical |
| F11 | 誤字脱字・読みやすさ | minor |

## qa.json 形式
```json
{
  "article_id": "...",
  "checked_at": "2026-10-23T12:00:00+09:00",
  "checked_by": "quality-analyst",
  "results": [{ "id": "F1", "status": "pass", "severity": null, "note": "" }],
  "verdict": "ready_for_approval | needs_revision"
}
```
critical の fail が1つでもあれば `verdict` は `needs_revision`。
