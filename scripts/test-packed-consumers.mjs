import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { spawn } from "node:child_process";
import { parse } from "yaml";

const root = resolve(import.meta.dirname, "..");
const peerFixtureNames = ["vue", "react", "react-dom", "quasar"];
const lockfile = parse(await readFile(resolve(root, "pnpm-lock.yaml"), "utf8"));
const postcssKey = Object.keys(lockfile.packages).find((key) => key.startsWith("postcss@"));
if (!postcssKey) throw new Error("The workspace lockfile does not contain PostCSS");
const peerFixtureVersions = Object.fromEntries(
  await Promise.all(
    peerFixtureNames.map(async (name) => {
      const packageJson = JSON.parse(
        await readFile(resolve(root, "node_modules", name, "package.json"), "utf8"),
      );
      return [name, packageJson.version];
    }),
  ),
);
peerFixtureVersions.postcss = postcssKey.slice("postcss@".length);
const workspace = await mkdtemp(resolve(tmpdir(), "uicogs-consumer-"));
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
const tarballs = [];

try {
  for (const packageName of packageNames) {
    const output = await run(
      "corepack",
      ["pnpm", "pack", "--pack-destination", workspace, "--json"],
      resolve(root, "packages", packageName),
    );
    const parsed = JSON.parse(output);
    const filename = Array.isArray(parsed) ? parsed[0]?.filename : parsed.filename;
    if (!filename) throw new Error(`pnpm pack did not report ${packageName}`);
    tarballs.push(resolve(workspace, basename(filename)));
  }

  await writeFile(
    resolve(workspace, "package.json"),
    JSON.stringify(
      {
        name: "uicogs-packed-consumer",
        private: true,
        type: "module",
        dependencies: {
          ...localPackages(),
          ...peerFixtures(),
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    resolve(workspace, "pnpm-workspace.yaml"),
    `packages:\n  - .\noverrides:\n${Object.entries({ ...localPackages(), ...peerFixtures() })
      .map(([name, value]) => `  ${JSON.stringify(name)}: ${JSON.stringify(value)}`)
      .join("\n")}\n`,
  );
  await run("corepack", ["pnpm", "install", "--offline", "--ignore-scripts"], workspace);
  await writeFile(
    resolve(workspace, "esm.mjs"),
    'import { createUiCogs, fields, resource, schema } from "@uicogs/core";\nconst Item = schema({ id: fields.ID() });\nconst Items = resource({ name: "items", url: "items/", schema: Item, key: "id" });\nconst cogs = createUiCogs({ resources: [Items] });\nif (Item.parse({ id: 1 }).id !== 1 || cogs.resource(Items).resourceName !== "items") process.exit(1);\n',
  );
  await writeFile(
    resolve(workspace, "commonjs.cjs"),
    'const { createUiCogs, fields, resource, schema } = require("@uicogs/core");\nconst Item = schema({ id: fields.ID() });\nconst Items = resource({ name: "items", url: "items/", schema: Item, key: "id" });\nconst cogs = createUiCogs({ resources: [Items] });\nif (Item.parse({ id: 1 }).id !== 1 || cogs.resource(Items).resourceName !== "items") process.exit(1);\n',
  );
  await writeFile(
    resolve(workspace, "strict.ts"),
    'import { createUiCogs, fields, resource, schema, type Infer } from "@uicogs/core";\nimport { storage } from "@uicogs/storage";\nconst Item = schema({ id: fields.ID(), name: fields.Str({ required: true }) });\nconst Items = resource({ name: "items", url: "items/", schema: Item, key: "id" });\nconst cogs = createUiCogs({ context: { locale: "en" }, persistence: { backend: storage.local({ namespace: "consumer" }) }, baseUrl: "/api/", resources: [Items] });\nconst item: Infer<typeof Item> = Item.parse({ id: 1, name: "One" });\nconst items = cogs.resource(Items);\ncogs.context.update({ locale: "fr" });\nvoid item;\nvoid items;\n',
  );
  await writeFile(
    resolve(workspace, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        skipLibCheck: false,
      },
      include: ["strict.ts"],
    }),
  );
  await run(process.execPath, ["esm.mjs"], workspace);
  await run(process.execPath, ["commonjs.cjs"], workspace);
  await run(resolve(root, "node_modules", ".bin", "tsc"), ["-p", "tsconfig.json"], workspace);

  for (const tarball of tarballs) {
    const stat = await readFile(tarball);
    if (!stat.length) throw new Error(`Empty package artifact: ${basename(tarball)}`);
  }
} finally {
  await rm(workspace, { recursive: true, force: true });
}

function localPackages() {
  return Object.fromEntries(
    packageNames.map((name, index) => [`@uicogs/${name}`, `file:${tarballs[index]}`]),
  );
}

function peerFixtures() {
  return peerFixtureVersions;
}

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise(stdout.trim());
      else reject(new Error(`${command} ${args.join(" ")} failed (${code})\n${stdout}\n${stderr}`));
    });
  });
}
