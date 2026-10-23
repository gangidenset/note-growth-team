import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALLOW_MARKER, formatFinding, isForbiddenFile, scanFiles, scanText } from "../src/security/secret-scan.js";

// 偽のキーは実行時に組み立てる（このテストファイル自体がスキャンに引っかからないように）
const fake = {
  anthropic: ["sk", "ant", "api03", "A".repeat(40)].join("-"),
  github: "ghp" + "_" + "a1B2".repeat(10),
  aws: "AKIA" + "ABCDEFGHIJ234567",
  google: "AIza" + "x".repeat(35),
  privateKey: "-----BEGIN " + "RSA PRIVATE KEY-----",
  assigned: "MY_SERVICE_TOKEN=" + "q9W8e7R6t5Y4u3I2o1P0",
};

describe("scanText", () => {
  it.each(Object.entries(fake))("%s を検出する", (_name, secret) => {
    const findings = scanText("x.ts", `const a = 1;\nconst k = "${secret}";\n`);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.line).toBe(2);
  });

  it("結果や表示に秘密の値そのものを含めない", () => {
    const [finding] = scanText("x.ts", `key=${fake.anthropic}`);
    expect(finding).toBeDefined();
    expect(JSON.stringify(finding)).not.toContain(fake.anthropic.slice(8));
    expect(formatFinding(finding!)).not.toContain(fake.anthropic.slice(8));
  });

  it.each([
    "ANTHROPIC_API_KEY=your-api-key-here",
    "API_KEY=example-key-0000000000000000",
    "TOKEN=${GITHUB_TOKEN_FROM_ENVIRONMENT}",
    "NGT_MONTHLY_BUDGET_JPY=10000",
    'const status = "awaiting_approval";',
  ])("ダミー値・普通のコードは検出しない: %s", (line) => {
    expect(scanText(".env.example", line)).toEqual([]);
  });

  it(`${ALLOW_MARKER} の行は検査しない`, () => {
    expect(scanText("x.ts", `"${fake.aws}" // ${ALLOW_MARKER}`)).toEqual([]);
  });
});

describe("scanFiles", () => {
  it.each([".env", "config/.env.local", ".env.production", "server.pem", "id_rsa"])(
    "%s は中身を読まずに Git に入れてはいけないファイルとして報告する",
    (file) => {
      expect(isForbiddenFile(file)).toBe(true);
      // 存在しないファイルでも名前だけで報告する（＝中身を読まない）
      expect(scanFiles(mkdtempSync(join(tmpdir(), "scan-")), [file])).toEqual([
        { file, line: 0, rule: "Git に入れてはいけないファイル名" },
      ]);
    },
  );

  it(".env.example は対象外ファイル名ではない", () => {
    expect(isForbiddenFile(".env.example")).toBe(false);
  });

  it("ファイルの中身を検査し、バイナリは飛ばす", () => {
    const root = mkdtempSync(join(tmpdir(), "scan-"));
    writeFileSync(join(root, "ok.md"), "問題なし\n");
    writeFileSync(join(root, "bad.ts"), `export const k = "${fake.github}";\n`);
    writeFileSync(join(root, "bin.dat"), Buffer.from([0, 1, 2, ...Buffer.from(fake.github)]));
    const findings = scanFiles(root, ["ok.md", "bad.ts", "bin.dat", "deleted.md"]);
    expect(findings).toEqual([{ file: "bad.ts", line: 1, rule: "GitHub トークン" }]);
  });
});
