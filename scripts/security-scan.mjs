import { readFileSync, statSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, basename } from "node:path";

const root = process.cwd();
// Scan files that can enter the repository, including tracked files and
// non-ignored untracked files. Local ignored secrets are runtime inputs,
// not source files. A tracked secret remains scanned even if .gitignore changes.
const excludedDirectories = new Set([
  "node_modules", ".git", ".workspace", "dist", ".output", "_isolated_legacy",
  ".vinxi", ".tanstack", ".nitro", "coverage", "playwright-report", "test-results",
]);
function walkSourceFiles(directory, prefix = "") {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) {
        files.push(...walkSourceFiles(resolve(directory, entry.name), relativePath));
      }
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}
function candidateFiles() {
  let inGitRepository = false;
  try {
    execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, stdio: "pipe" });
    inGitRepository = true;
  } catch {
    // Standalone regression tests run outside a repository.
  }
  if (!inGitRepository) return walkSourceFiles(root);
  // Do not silently fall back to scanning build artifacts on a Git failure.
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, maxBuffer: 32 * 1024 * 1024 },
  );
  return output.toString("utf8").split("\\0").filter(Boolean);
}
const paths = candidateFiles().filter((file) => !(
  /(^|\/)(?:node_modules|\.git|\.workspace|dist|\.output|_isolated_legacy)\//.test(file)
));
const patterns = [
  ["JWT", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ["Meta token", /(?<![A-Za-z0-9_-])EAA[A-Za-z0-9_-]{20,}/g],
  ["Supabase secret key", /sb_secret_[A-Za-z0-9._-]{8,}/gi],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
];
const sensitiveName =
  /(SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|ACCESS_KEY|PRIVATE_KEY|SERVICE_ROLE|VERIFY_TOKEN|APP_SECRET|CLIENT_SECRET)/i;
const hits = [];
for (const rel of paths) {
  const abs = resolve(root, rel);
  let text;
  try {
    if (statSync(abs).size > 8_000_000) continue;
    text = readFileSync(abs, "utf8");
  } catch {
    // A file may have disappeared since the Git inventory was generated.
    continue;
  }
  for (const [label, pattern] of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) hits.push(`${label}: ${rel}`);
  }
  const name = basename(rel);
  if (name.startsWith(".env") || name.endsWith(".env")) {
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m || !sensitiveName.test(m[1])) continue;
      const value = m[2].trim().replace(/^['"]|['"]$/g, "");
      if (value && value !== "***REDACTED***" && !/^<.*>$/.test(value))
        hits.push(`Populated sensitive env value ${m[1]}: ${rel}`);
    }
  }
}
if (hits.length) {
  console.error("AZWA security scan FAILED");
  for (const hit of [...new Set(hits)]) console.error(` - ${hit}`);
  process.exit(1);
}
console.log("AZWA security scan PASS");
