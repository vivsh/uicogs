import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packages = [
  "core",
  "echarts",
  "auth",
  "http",
  "vue",
  "routes",
  "react",
  "quasar",
  "openapi",
  "storage",
  "legacy",
];
const mode = process.argv[2] ?? "--check";
let failed = false;

for (const packageName of packages) {
  const distPath = resolve(root, "packages", packageName, "dist");
  const reportPath = resolve(root, "etc", "api", `${packageName}.api.md`);
  const declarationFiles = (await readdir(distPath, { recursive: true }))
    .filter((file) => file.endsWith(".d.ts"))
    .sort();
  const declaration = (
    await Promise.all(
      declarationFiles.map(async (file) => {
        const contents = normalize(await readFile(resolve(distPath, file), "utf8"));
        return `// ${relative(distPath, resolve(distPath, file))}\n${contents}`;
      }),
    )
  ).join("\n");
  const hash = createHash("sha256").update(declaration).digest("hex");
  const report = `# @uicogs/${packageName} API\n\nDeclaration SHA-256: \`${hash}\`\n\n\`\`\`ts\n${declaration}\`\`\`\n`;
  if (mode === "--write") {
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, report);
    continue;
  }
  const existing = await readFile(reportPath, "utf8").catch(() => "");
  if (existing !== report) {
    failed = true;
    console.error(`API report is stale: etc/api/${packageName}.api.md`);
  }
}

if (failed) process.exitCode = 1;

function normalize(value) {
  return `${value.replace(/\r\n/g, "\n").trim()}\n`;
}
