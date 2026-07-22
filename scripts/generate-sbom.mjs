import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
await mkdir(resolve(root, "artifacts"), { recursive: true });
execFileSync(
  "corepack",
  [
    "pnpm",
    "sbom",
    "--sbom-format",
    "cyclonedx",
    "--sbom-spec-version",
    "1.6",
    "--prod",
    "--lockfile-only",
    "--out",
    "artifacts/sbom.cdx.json",
  ],
  { cwd: root, stdio: "inherit" },
);
