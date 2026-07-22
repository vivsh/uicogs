#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { generateOpenApi, readOpenApi } from "./index.js";

async function main(): Promise<void> {
  const [, , command, input, ...arguments_] = process.argv;
  if (command !== "generate" || !input) {
    throw new Error("Usage: uicogs-openapi generate <openapi.yaml> --output <file> [--strict]");
  }
  const outputIndex = arguments_.indexOf("--output");
  const output = outputIndex >= 0 ? arguments_[outputIndex + 1] : undefined;
  if (!output) throw new Error("--output is required");
  const result = generateOpenApi(await readOpenApi(resolve(input)), {
    strict: arguments_.includes("--strict"),
  });
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(resolve(output), result.code, "utf8");
  for (const warning of result.warnings) process.stderr.write(`warning: ${warning}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
