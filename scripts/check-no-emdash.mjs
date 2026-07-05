// Fails if an em dash (U+2014) appears in any tracked text file.
// The Fort project bans em dashes in code, comments, UI copy, and docs.
// Run as part of `npm run check`.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const EM_DASH = "—";

// Text extensions we care about. Binary and generated output are skipped.
const TEXT_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".html",
  ".css",
  ".txt",
  ".yml",
  ".yaml",
  ".webmanifest",
]);

// This script itself references the character to detect it, so exclude it.
const SELF = "scripts/check-no-emdash.mjs";

function trackedFiles() {
  const out = execSync("git ls-files", { encoding: "utf8" });
  return out.split("\n").filter(Boolean);
}

function extOf(path) {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot);
}

function main() {
  const files = trackedFiles().filter((f) => f !== SELF && TEXT_EXT.has(extOf(f)));
  const offenders = [];

  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    lines.forEach((line, i) => {
      const col = line.indexOf(EM_DASH);
      if (col !== -1) {
        offenders.push(`${file}:${i + 1}:${col + 1}`);
      }
    });
  }

  if (offenders.length > 0) {
    console.error("Em dash (U+2014) found. Use a plain hyphen or reword:");
    for (const o of offenders) {
      console.error("  " + o);
    }
    process.exit(1);
  }

  console.log(`check:no-emdash passed (${files.length} files scanned).`);
}

main();
