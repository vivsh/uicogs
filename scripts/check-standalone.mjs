import { readFile, readdir } from "node:fs/promises";
import { extname, relative } from "node:path";
import console from "node:console";
import process from "node:process";
import { URL } from "node:url";

const root = new URL("../", import.meta.url);
const ignored = new Set([
  ".git",
  ".playwright-cli",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);
const sourceExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
  ".vue",
  ".yaml",
  ".yml",
]);
const prohibitedProducts = [["my", "dynasty"].join(""), ["club", "dynasty"].join("")];
const prohibitedObjectType = new RegExp(["Object", "Data"].join(""));
const unsafeType = /(?:[:<,]\s*any\b|\bany\[\]|=>\s*any\b)/;
const failures = [];

for (const file of await files(root)) {
  if (!sourceExtensions.has(extname(file.pathname))) continue;
  const content = await readFile(file, "utf8");
  const name = relative(root.pathname, file.pathname);
  for (const product of prohibitedProducts) {
    if (content.toLowerCase().includes(product)) failures.push(`${name}: prohibited product name`);
  }
  if (prohibitedObjectType.test(content)) failures.push(`${name}: prohibited object type`);
  if (/\b(?:describe|it|test)\.(?:only|skip|todo)\s*\(/.test(content))
    failures.push(`${name}: focused, skipped, or placeholder test`);
  if (/export\s+[^;\n]*\bEz[A-Z]\w*/.test(content)) failures.push(`${name}: legacy Ez export`);
  if (name.startsWith("packages/") && name.includes("/src/") && unsafeType.test(content))
    failures.push(`${name}: authored source contains explicit any`);
}

for (const file of await files(new URL("../packages/", import.meta.url), false)) {
  if (!/\/dist\/.*\.d\.(?:c|m)?ts$/.test(file.pathname)) continue;
  if (/\/packages\/(?:vue|quasar)\//.test(file.pathname)) continue;
  const content = await readFile(file, "utf8");
  if (/\bany\b/.test(content))
    failures.push(`${relative(root.pathname, file.pathname)}: public declaration contains any`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Standalone and public-type audit passed.");
}

async function files(directory, honorIgnored = true) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (honorIgnored && ignored.has(entry.name)) continue;
    const target = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) output.push(...(await files(target, honorIgnored)));
    else output.push(target);
  }
  return output;
}
