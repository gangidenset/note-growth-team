import { describe, expect, it } from "vitest";
import {
  approveArticle,
  archiveArticle,
  createArticle,
  listArticleStatuses,
  recordPublication,
  transitionArticle,
  validateMarket,
} from "../src/app/articles.js";
import type { Repository } from "../src/storage/repository.js";
import { DomainError } from "../src/storage/repository.js";
import {
  FREE_MD,
  PAID_MD,
  makeTempRepo,
  marketRecord,
  passedQa,
  selectedTheme,
  writeJson,
  writeText,
} from "./helpers.js";

const ID = "flutter-demo-001";
const NOTE_URL = "https://note.com/someone/n/n1234567890ab";

/** 市場データ・テーマ・本文・品質チェックをそろえ、awaiting_approval まで進めた記事を作る */
function prepareAwaitingApproval(): Repository {
  const repo = makeTempRepo();
  writeJson(repo, "data/market/2026-10-23-001.json", marketRecord);
  writeJson(repo, "data/themes/flutter-demo.json", selectedTheme);
  createArticle(repo, { id: ID, themeId: "flutter-demo", title: "デモアプリ入門", priceJpy: 980 });
  transitionArticle(repo, ID, "researching");
  transitionArticle(repo, ID, "planning");
  transitionArticle(repo, ID, "drafting");
  writeText(repo, `data/articles/${ID}/free.md`, FREE_MD);
  writeText(repo, `data/articles/${ID}/paid.md`, PAID_MD);
  transitionArticle(repo, ID, "qa");
  writeJson(repo, `data/articles/${ID}/qa.json`, passedQa(ID));
  transitionArticle(repo, ID, "awaiting_approval");
  return repo;
}

function errorOf(fn: () => unknown): DomainError {
  try {
    fn();
  } catch (e) {
    if (e instanceof DomainError) return e;
    throw e;
  }
  throw new Error("DomainError が発生しませんでした");
}

describe("記事のライフサイクル（統合）", () => {
  it("idea から公開記録まで通り、全操作が監査ログに残る", () => {
    const repo = prepareAwaitingApproval();
    const approval = approveArticle(repo, ID, "owner");
    expect(repo.readApproval(ID)).toEqual(approval);
    expect(repo.readMeta(ID).status).toBe("approved");

    const published = recordPublication(repo, ID, NOTE_URL);
    expect(published.status).toBe("published");
    expect(published.published_url).toBe(NOTE_URL);
    expect(published.history.map((h) => h.to)).toEqual([
      "researching", "planning", "drafting", "qa", "awaiting_approval", "approved", "published",
    ]);

    const actions = repo.readAudit().map((a) => a.action);
    expect(actions).toEqual([
      "article_created", "transition", "transition", "transition", "transition", "transition",
      "approved", "published",
    ]);
    const approvedLog = repo.readAudit().find((a) => a.action === "approved");
    expect(approvedLog?.actor).toBe("owner");
    expect(approvedLog?.content_sha256).toBe(approval.content_sha256);
  });
});

describe("承認ゲート", () => {
  it.each(["approved", "published", "archived"] as const)(
    "article:transition では %s にできず、オーナー用コマンドを案内する",
    (to) => {
      const repo = prepareAwaitingApproval();
      const err = errorOf(() => transitionArticle(repo, ID, to));
      expect(err.messages.join()).toContain("オーナー");
      expect(repo.readMeta(ID).status).toBe("awaiting_approval");
      expect(repo.readApproval(ID)).toBeNull();
    },
  );

  it("awaiting_approval 以外は承認できない", () => {
    const repo = makeTempRepo();
    createArticle(repo, { id: ID });
    expect(() => approveArticle(repo, ID, "owner")).toThrow(/awaiting_approval/);
  });

  it("AI社員名では承認できない", () => {
    const repo = prepareAwaitingApproval();
    expect(() => approveArticle(repo, ID, "editor-writer")).toThrow();
    expect(repo.readMeta(ID).status).toBe("awaiting_approval");
  });

  it("承認後に本文を編集すると公開記録できず、一覧で警告が出る", () => {
    const repo = prepareAwaitingApproval();
    approveArticle(repo, ID, "owner");
    writeText(repo, `data/articles/${ID}/paid.md`, PAID_MD.replace("有料部分", "有料部分（追記）"));

    expect(() => recordPublication(repo, ID, NOTE_URL)).toThrow(/再承認/);
    expect(repo.readMeta(ID).status).toBe("approved");
    const [row] = listArticleStatuses(repo);
    expect(row?.warning).toContain("承認は無効");
  });

  it("承認後に価格を変えても承認は無効になる", () => {
    const repo = prepareAwaitingApproval();
    approveArticle(repo, ID, "owner");
    repo.writeMeta({ ...repo.readMeta(ID), price_jpy: 1980 });
    expect(() => recordPublication(repo, ID, NOTE_URL)).toThrow(DomainError);
  });

  it("本文変更後は承認を取り消し、再承認すれば公開記録できる", () => {
    const repo = prepareAwaitingApproval();
    approveArticle(repo, ID, "owner");
    writeText(repo, `data/articles/${ID}/free.md`, `${FREE_MD}追記\n`);
    transitionArticle(repo, ID, "awaiting_approval", "承認後に無料記事を修正");
    approveArticle(repo, ID, "owner");
    expect(recordPublication(repo, ID, NOTE_URL).status).toBe("published");
  });

  it("note.com 以外のURLでは公開記録できない", () => {
    const repo = prepareAwaitingApproval();
    approveArticle(repo, ID, "owner");
    expect(() => recordPublication(repo, ID, "https://example.com/x")).toThrow(/note\.com/);
  });
});

describe("遷移のガード（ファイルから判定）", () => {
  it("テーマの根拠となる市場データが不正なら planning に進めない", () => {
    const repo = makeTempRepo();
    const { retrieved_at: _omit, ...broken } = marketRecord;
    writeJson(repo, "data/market/2026-10-23-001.json", broken);
    writeJson(repo, "data/themes/flutter-demo.json", selectedTheme);
    createArticle(repo, { id: ID, themeId: "flutter-demo" });
    transitionArticle(repo, ID, "researching");
    expect(() => transitionArticle(repo, ID, "planning")).toThrow(/市場データ/);
  });

  it("テーマ未設定では planning に進めない", () => {
    const repo = makeTempRepo();
    createArticle(repo, { id: ID });
    transitionArticle(repo, ID, "researching");
    expect(() => transitionArticle(repo, ID, "planning")).toThrow(DomainError);
  });

  it("paywall がない有料記事では qa に進めない", () => {
    const repo = prepareAwaitingApproval();
    transitionArticle(repo, ID, "needs_revision", "見直し");
    transitionArticle(repo, ID, "drafting");
    writeText(repo, `data/articles/${ID}/paid.md`, "# 有料記事\n境界なし\n");
    expect(() => transitionArticle(repo, ID, "qa")).toThrow(/paywall/);
  });

  it("critical 指摘のある qa.json では承認待ちに進めない", () => {
    const repo = prepareAwaitingApproval();
    transitionArticle(repo, ID, "needs_revision", "見直し");
    transitionArticle(repo, ID, "drafting");
    transitionArticle(repo, ID, "qa");
    writeJson(repo, `data/articles/${ID}/qa.json`, {
      ...passedQa(ID),
      results: [{ id: "F3", status: "fail", severity: "critical", note: "売上の断定" }],
    });
    expect(() => transitionArticle(repo, ID, "awaiting_approval")).toThrow(/F3/);
  });

  it("失敗した遷移は状態も監査ログも変えない", () => {
    const repo = makeTempRepo();
    createArticle(repo, { id: ID });
    const before = repo.readAudit().length;
    expect(() => transitionArticle(repo, ID, "qa")).toThrow(DomainError);
    expect(repo.readMeta(ID).status).toBe("idea");
    expect(repo.readAudit()).toHaveLength(before);
  });
});

describe("中止と市場データ検証", () => {
  it("オーナーは理由付きで中止できる", () => {
    const repo = prepareAwaitingApproval();
    expect(() => archiveArticle(repo, ID, "")).toThrow(/理由/);
    expect(archiveArticle(repo, ID, "テーマ変更").status).toBe("archived");
  });

  it("validateMarket は不正ファイルを列挙する", () => {
    const repo = makeTempRepo();
    writeJson(repo, "data/market/2026-10-23-001.json", marketRecord);
    writeJson(repo, "data/market/2026-10-23-002.json", {
      ...marketRecord,
      id: "2026-10-23-002",
      measurement: "estimated",
    });
    const summary = validateMarket(repo);
    expect(summary).toMatchObject({ total: 2, valid: 1 });
    expect(summary.invalid[0]?.file).toBe("2026-10-23-002.json");
  });
});
