import { describe, expect, it } from "vitest";
import type { QaReport } from "../src/domain/schemas.js";
import { ARTICLE_STATES } from "../src/domain/schemas.js";
import {
  OWNER_ONLY_TARGETS,
  checkTransition,
  nextStates,
  type TransitionContext,
} from "../src/domain/state-machine.js";

const passedQa: QaReport = {
  article_id: "a",
  checked_at: "2026-10-23T12:00:00+09:00",
  checked_by: "quality-analyst",
  results: [
    { id: "F1", status: "pass", severity: null, note: "" },
    { id: "F11", status: "fail", severity: "minor", note: "誤字1件" },
  ],
  verdict: "ready_for_approval",
};

/** すべてのガード条件を満たす文脈 */
const fullCtx = (actor: TransitionContext["actor"]): TransitionContext => ({
  actor,
  reason: "テスト",
  marketEvidenceCount: 3,
  hasSelectedTheme: true,
  hasFreeDraft: true,
  hasPaidDraft: true,
  paywallCount: 1,
  qa: passedQa,
  approvalMatchesContent: true,
  publishedUrl: "https://note.com/someone/n/n1234567890ab",
});

describe("通常の流れ", () => {
  it("AI は idea から awaiting_approval まで進められる", () => {
    const path = ["idea", "researching", "planning", "drafting", "qa", "awaiting_approval"] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(checkTransition(path[i]!, path[i + 1]!, fullCtx("ai"))).toEqual({ ok: true });
    }
  });

  it("オーナーは承認・公開まで進められる", () => {
    expect(checkTransition("awaiting_approval", "approved", fullCtx("owner"))).toEqual({ ok: true });
    expect(checkTransition("approved", "published", fullCtx("owner"))).toEqual({ ok: true });
  });
});

describe("承認ゲート: AI は承認・公開・中止できない", () => {
  for (const from of ARTICLE_STATES) {
    for (const to of OWNER_ONLY_TARGETS) {
      it(`AI: ${from} → ${to} は拒否`, () => {
        expect(checkTransition(from, to, fullCtx("ai")).ok).toBe(false);
      });
    }
  }

  it("AI が遷移できる行き先に approved / published / archived は含まれない", () => {
    for (const from of ARTICLE_STATES) {
      const targets = nextStates(from, "ai");
      for (const t of OWNER_ONLY_TARGETS) expect(targets).not.toContain(t);
    }
  });

  it("拒否理由にオーナー限定であることが示される", () => {
    const r = checkTransition("awaiting_approval", "approved", fullCtx("ai"));
    expect(r).toEqual({ ok: false, errors: ["approved への遷移はオーナー（人間）だけが実行できます"] });
  });
});

describe("承認とハッシュ", () => {
  it("承認記録が本文と一致しないとオーナーでも承認できない", () => {
    const r = checkTransition("awaiting_approval", "approved", {
      ...fullCtx("owner"),
      approvalMatchesContent: false,
    });
    expect(r.ok).toBe(false);
  });

  it("承認後に本文が変わったらオーナーでも公開記録できない", () => {
    const r = checkTransition("approved", "published", {
      ...fullCtx("owner"),
      approvalMatchesContent: false,
    });
    expect(r.ok).toBe(false);
  });

  it("承認の取り消し（approved → awaiting_approval）は AI も行える", () => {
    expect(checkTransition("approved", "awaiting_approval", fullCtx("ai")).ok).toBe(true);
  });
});

describe("公開URLの検証", () => {
  it.each([
    ["note.com 以外", "https://example.com/n/abc"],
    ["http", "http://note.com/someone/n/abc"],
    ["紛らわしいドメイン", "https://note.com.evil.example/n/abc"],
    ["URLでない", "公開しました"],
  ])("%s は拒否", (_label, url) => {
    const r = checkTransition("approved", "published", { ...fullCtx("owner"), publishedUrl: url });
    expect(r.ok).toBe(false);
  });

  it("URLがないと拒否", () => {
    const { publishedUrl: _omit, ...ctx } = fullCtx("owner");
    expect(checkTransition("approved", "published", ctx).ok).toBe(false);
  });
});

describe("ガード条件", () => {
  it("市場データなしでは planning に進めない", () => {
    const r = checkTransition("researching", "planning", { ...fullCtx("ai"), marketEvidenceCount: 0 });
    expect(r.ok).toBe(false);
  });

  it("selected テーマなしでは drafting に進めない", () => {
    const r = checkTransition("planning", "drafting", { ...fullCtx("ai"), hasSelectedTheme: false });
    expect(r.ok).toBe(false);
  });

  it.each([0, 2])("paywall が %i 個だと qa に進めない", (n) => {
    const r = checkTransition("drafting", "qa", { ...fullCtx("ai"), paywallCount: n });
    expect(r.ok).toBe(false);
  });

  it("無料記事がないと qa に進めない（理由をすべて返す）", () => {
    const r = checkTransition("drafting", "qa", {
      ...fullCtx("ai"),
      hasFreeDraft: false,
      hasPaidDraft: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toHaveLength(2);
  });

  it("qa.json がないと承認待ちに進めない", () => {
    const r = checkTransition("qa", "awaiting_approval", { ...fullCtx("ai"), qa: null });
    expect(r.ok).toBe(false);
  });

  it("critical 指摘が残っていると承認待ちに進めない", () => {
    const qa: QaReport = {
      ...passedQa,
      results: [{ id: "F3", status: "fail", severity: "critical", note: "他者の売上を断定" }],
    };
    const r = checkTransition("qa", "awaiting_approval", { ...fullCtx("ai"), qa });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain("F3");
  });

  it("未チェック項目があると承認待ちに進めない", () => {
    const qa: QaReport = {
      ...passedQa,
      results: [{ id: "F2", status: "not_checked", severity: null, note: "" }],
    };
    expect(checkTransition("qa", "awaiting_approval", { ...fullCtx("ai"), qa }).ok).toBe(false);
  });

  it("判定が needs_revision なら承認待ちに進めない", () => {
    const qa: QaReport = { ...passedQa, verdict: "needs_revision" };
    expect(checkTransition("qa", "awaiting_approval", { ...fullCtx("ai"), qa }).ok).toBe(false);
  });

  it("差し戻しには理由が必要", () => {
    const r = checkTransition("qa", "needs_revision", { ...fullCtx("ai"), reason: "  " });
    expect(r.ok).toBe(false);
  });

  it("中止（archived）にはオーナーでも理由が必要", () => {
    const { reason: _omit, ...ctx } = fullCtx("owner");
    expect(checkTransition("drafting", "archived", ctx).ok).toBe(false);
  });
});

describe("未定義の遷移", () => {
  it.each([
    ["idea", "published"],
    ["drafting", "approved"],
    ["published", "drafting"],
    ["archived", "idea"],
  ] as const)("%s → %s は拒否（オーナーでも）", (from, to) => {
    expect(checkTransition(from, to, fullCtx("owner")).ok).toBe(false);
  });
});
