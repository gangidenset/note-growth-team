/**
 * npm run secret-scan
 * Git が追跡しているファイルと、まだ追加していない（.gitignore 対象外の）ファイルを検査する。
 * .gitignore で除外された .env などは読まない。
 */
import { execFileSync } from "node:child_process";
import { formatFinding, scanFiles } from "../src/security/secret-scan.js";

const root = process.cwd();
const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\0")
  .filter((f) => f !== "");

const findings = scanFiles(root, [...new Set(files)]);
if (findings.length === 0) {
  console.log(`秘密情報スキャン: ${files.length} ファイルを検査し、問題は見つかりませんでした`);
} else {
  console.error(`秘密情報スキャン: ${findings.length} 件の疑いがあります（値は表示しません）`);
  for (const f of findings) console.error(`  ✗ ${formatFinding(f)}`);
  console.error("該当箇所を確認し、本物の秘密情報なら削除して .env に移し、キーを再発行してください。");
  process.exitCode = 1;
}
