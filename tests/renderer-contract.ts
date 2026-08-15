import { describe, expect, it } from "vitest";

export interface RendererContractRegistry {
  editor(descriptor: { readonly kind: string }): unknown;
  formatter(descriptor: { readonly kind: string }): unknown;
}

export function rendererContract(
  name: string,
  registry: RendererContractRegistry,
  expected: {
    readonly editors: readonly string[];
    readonly formatters: readonly string[];
  },
): void {
  describe(`${name} renderer contract`, () => {
    it("resolves every required editor kind", () => {
      for (const kind of expected.editors) expect(registry.editor({ kind })).toBeDefined();
    });

    it("resolves every required formatter kind", () => {
      for (const kind of expected.formatters)
        expect(registry.formatter({ kind })).toBeTypeOf("function");
    });

    it("does not silently resolve unknown renderer kinds", () => {
      expect(registry.editor({ kind: "renderer-contract-missing" })).toBeUndefined();
      expect(registry.formatter({ kind: "renderer-contract-missing" })).toBeUndefined();
    });
  });
}

export const workflowEditorKinds = [
  "text",
  "textarea",
  "rich-text",
  "markdown",
  "email",
  "password",
  "number",
  "checkbox",
  "switch",
  "select",
  "autocomplete",
  "date",
  "time",
  "datetime",
  "date-range",
  "markdown",
  "reference",
  "reference-list",
  "file",
  "image",
  "color",
  "string-list",
  "hidden",
] as const;

export const workflowFormatterKinds = [
  "text",
  "boolean",
  "number",
  "choice",
  "choices",
  "date",
  "time",
  "datetime",
  "date-range",
  "reference",
  "reference-list",
  "image",
  "file",
  "link",
] as const;
