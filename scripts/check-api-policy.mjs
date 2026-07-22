import { execFileSync } from "node:child_process";

const base = process.env.GITHUB_BASE_REF;
if (!base) process.exit(0);

const files = execFileSync("git", ["diff", "--name-only", `origin/${base}...HEAD`], {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(Boolean);
if (!files.some((file) => file.startsWith("etc/api/"))) process.exit(0);

if (!files.some((file) => file.startsWith(".changeset/") && file.endsWith(".md"))) {
  console.error("Public API reports changed without a Changeset.");
  process.exitCode = 1;
}
if (!files.includes("docs/migration-1.0.md")) {
  console.error("Public API reports changed without migration documentation review.");
  process.exitCode = 1;
}
