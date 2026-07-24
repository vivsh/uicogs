import { gzipSync } from "node:zlib";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const root = resolve(import.meta.dirname, "..");
const baselinePath = resolve(root, "etc", "budgets.json");
const packageNames = [
  "core",
  "auth",
  "http",
  "vue",
  "vue-router",
  "react",
  "quasar",
  "openapi",
  "storage",
  "legacy",
];
const mode = process.argv[2] ?? "--check";
const performanceBudgetMultiplier = 1.5;

const current = {
  version: 1,
  gzipBytes: await bundleSizes(),
  performanceMs: await performanceMeasurements(),
};

if (mode === "--write") {
  await mkdir(dirname(baselinePath), { recursive: true });
  await writeFile(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
  printMeasurements(current);
  process.exit(0);
}

const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
let failed = false;
for (const packageName of packageNames) {
  const actual = current.gzipBytes[packageName];
  const expected = baseline.gzipBytes[packageName];
  const maximum = Math.ceil(expected * 1.05);
  if (actual > maximum) {
    failed = true;
    console.error(
      `@uicogs/${packageName} gzip size is ${actual} bytes; budget is ${maximum} bytes (${expected} baseline).`,
    );
  }
}
for (const [name, actual] of Object.entries(current.performanceMs)) {
  const expected = baseline.performanceMs[name];
  const maximum = expected * performanceBudgetMultiplier;
  if (actual > maximum) {
    failed = true;
    console.error(
      `${name} took ${actual.toFixed(2)}ms; budget is ${maximum.toFixed(2)}ms (${expected.toFixed(2)}ms baseline).`,
    );
  }
}
printMeasurements(current);
if (failed) process.exitCode = 1;

async function bundleSizes() {
  const sizes = {};
  for (const packageName of packageNames) {
    const dist = resolve(root, "packages", packageName, "dist");
    const files = (await readdir(dist, { recursive: true }))
      .filter((file) => /\.(?:js|cjs)$/.test(file))
      .sort();
    const contents = [];
    for (const file of files) {
      contents.push(Buffer.from(`\n/* ${file} */\n`));
      contents.push(await readFile(resolve(dist, file)));
    }
    sizes[packageName] = gzipSync(Buffer.concat(contents), { level: 9 }).byteLength;
  }
  return sizes;
}

async function performanceMeasurements() {
  const core = await import(
    `${pathToFileURL(resolve(root, "packages/core/dist/index.js")).href}?budget=${Date.now()}`
  );
  const schema = core.schema({
    id: core.fields.ID(),
    title: core.fields.Str({ required: true }),
    count: core.fields.Int(),
    active: core.fields.Bool(),
  });
  const input = { id: 1, title: "Task", count: 3, active: true };
  const schemaParse = () => schema.parse(input);
  let entry;
  let version = 0;
  const cacheMerge = () => {
    version += 1;
    entry = core.mergeEntity(entry, 1, { id: 1, version }, { ttl: 30_000, now: version });
  };
  return {
    schemaParse20k: measure(schemaParse, 20_000),
    cacheMerge10k: measure(cacheMerge, 10_000),
  };
}

function measure(operation, iterations) {
  for (let index = 0; index < Math.min(iterations, 1_000); index += 1) operation();
  const runs = [];
  for (let run = 0; run < 7; run += 1) {
    const started = performance.now();
    for (let index = 0; index < iterations; index += 1) operation();
    runs.push(performance.now() - started);
  }
  runs.sort((left, right) => left - right);
  return Number(runs[Math.floor(runs.length / 2)].toFixed(3));
}

function printMeasurements(measurements) {
  console.log(JSON.stringify(measurements, null, 2));
}
