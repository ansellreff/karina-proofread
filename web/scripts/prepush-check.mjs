/**
 * Safety check before anything goes to GitHub (run by push.bat; also usable on its own):
 * everything that would be pushed (commits not on GitHub yet + staged changes) must contain no student names,
 * no student documents or app data, and no keys. Exit code 1 = stop.
 *
 *   node web/scripts/prepush-check.mjs        (from the project folder)
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

// what would be pushed: compare with GitHub's copy (or everything, before the first push)
let againstRemote = "origin/main";
try {
  git("rev-parse", "--verify", "origin/main");
} catch {
  againstRemote = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"; // git's empty tree: before the first push, everything counts
}
const files = git("diff", "--cached", "--name-only", againstRemote).split("\n").filter(Boolean);
const diff = git("diff", "--cached", "-U0", againstRemote, "--", ".", ":!web/package-lock.json");

const problems = [];

// 1. files that must never leave this computer
const PRIVATE = /(^|\/)Enrollment Document_|(^|\/)\.data\/|holdout\.txt$|validation\.txt$|^training\/(extracted|output)\/|(^|\/)\.env(?!\.example$)|\.backup\.|e2e-shots\//i;
for (const f of files) if (PRIVATE.test(f)) problems.push(`private file: ${f}`);

// 2. keys and secrets
const SECRET = /sk-ant-[A-Za-z0-9_-]{10,}|postgres(ql)?:\/\/[^\s"'<]+@|npg_[A-Za-z0-9]{8,}|BEGIN [A-Z ]*PRIVATE KEY|ANTHROPIC_API_KEY=\S{10,}/;
for (const line of diff.split("\n")) if (line.startsWith("+") && SECRET.test(line)) problems.push(`looks like a key or password: ${line.slice(1, 60)}…`);

// 3. student names: from the document folders' file names and the names the app detected (local data)
const COMMON = new Set("done study plan studyplan autobio autobiography statement purpose statementofpurpose essay resume personal master program final revised copy bachelor taiwan university scholarship english doctoral docx with from review checked proofreading taipei tech nycu nthu ncku nccu nyust ntust ncue recommendation letter video script".split(" "));
const names = new Set();
const addName = (s) => {
  for (const t of String(s ?? "").split(/[_\s()\-.,'’]+/)) if (t.length >= 4 && /^\p{L}+$/u.test(t) && !COMMON.has(t.toLowerCase())) names.add(t.toLowerCase());
};
for (const dir of readdirSync(root).filter((d) => d.startsWith("Enrollment Document_"))) {
  const walk = (p) => {
    for (const e of readdirSync(p)) {
      const full = path.join(p, e);
      if (statSync(full).isDirectory()) walk(full);
      else addName(path.parse(e).name);
    }
  };
  walk(path.join(root, dir));
}
const data = path.join(root, "web", ".data");
const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};
for (const sub of ["jobs", "trash"]) {
  const d = path.join(data, sub);
  if (existsSync(d)) for (const j of readdirSync(d)) addName(readJson(path.join(d, j, "meta.json"))?.studentName);
}
const recs = path.join(data, "learning", "records");
if (existsSync(recs)) for (const r of readdirSync(recs)) for (const n of readJson(path.join(recs, r))?.names ?? []) addName(n);
if (names.size) {
  const words = new RegExp(`(?<![\\p{L}])(${[...names].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}])`, "iu");
  let file = "";
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) file = line.slice(6);
    else if (line.startsWith("+") && words.test(line)) problems.push(`a student's name in ${file}`);
  }
}

if (problems.length) {
  console.log("\nSTOPPED: this would publish something private:");
  for (const p of [...new Set(problems)].slice(0, 20)) console.log(`  - ${p}`);
  console.log("\nNothing was pushed. Ask Claude to look at it, or remove it and try again.");
  process.exit(1);
}
console.log(`Safety check passed: ${files.length} file(s), no student names, documents or keys.`);
