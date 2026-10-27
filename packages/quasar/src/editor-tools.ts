import type { Descriptor, EditorResize } from "@uicogs/core";
import type { QEditor } from "quasar";

/** The supported presentation modes for generated HTML rich-text fields. */
export type QuasarRichTextMode = "edit" | "source" | "preview";

/** One application-owned command rendered while a Quasar rich-text editor is editable. */
export interface QuasarRichTextTool {
  readonly label: string;
  readonly tip?: string;
  readonly icon?: string;
  readonly run: (editor: QEditor) => void;
}

/** Quasar-specific rich-text options, including named toolbar tools and view modes. */
export interface QuasarRichTextEditorOptions {
  /** Quasar command groups shown in WYSIWYG edit mode. */
  readonly toolbar?: readonly (readonly string[])[];
  /** Additional named QEditor commands. Tools run only in WYSIWYG edit mode. */
  readonly tools?: Readonly<Record<string, QuasarRichTextTool>>;
  /** Enabled views. Defaults to `edit` and `preview`. */
  readonly modes?: readonly QuasarRichTextMode[];
  /** Initially visible view. Defaults to `edit`. */
  readonly defaultMode?: QuasarRichTextMode;
  /** Approximate minimum number of editable text rows. */
  readonly rows?: number;
  /** Native drag direction for the editable content area. */
  readonly resize?: EditorResize;
}

/** Builds Quasar-aware editor descriptors without coupling UiCogs core to Quasar. */
export const quasarEditor = Object.freeze({
  RichText: (
    options: QuasarRichTextEditorOptions = {},
  ): Descriptor<"rich-text", QuasarRichTextEditorOptions> =>
    freezeDescriptor("rich-text", freezeRichTextOptions(options)),
});

function freezeDescriptor<TKind extends "rich-text", TOptions>(
  kind: TKind,
  options: TOptions,
): Descriptor<TKind, TOptions> {
  return Object.freeze({ kind, options });
}

function freezeRichTextOptions(options: QuasarRichTextEditorOptions): QuasarRichTextEditorOptions {
  const modes = freezeModes(options.modes, ["edit", "preview"], isRichTextMode, "rich-text");
  return Object.freeze({
    ...options,
    modes,
    defaultMode: freezeDefaultMode(options.defaultMode, modes, "edit", "rich-text"),
    ...(options.toolbar === undefined ? {} : { toolbar: freezeToolbar(options.toolbar) }),
    ...(options.tools === undefined ? {} : { tools: freezeRichTextTools(options.tools) }),
  });
}

function freezeModes<TMode extends string>(
  modes: readonly TMode[] | undefined,
  defaults: readonly TMode[],
  isMode: (value: string) => value is TMode,
  label: string,
): readonly TMode[] {
  const values = modes ?? defaults;
  if (!values.length || !values.every((mode) => isMode(mode)))
    throw new Error(`Quasar ${label} editor modes must contain supported modes`);
  if (new Set(values).size !== values.length)
    throw new Error(`Quasar ${label} editor modes cannot contain duplicates`);
  return Object.freeze([...values]);
}

function freezeDefaultMode<TMode extends string>(
  mode: TMode | undefined,
  modes: readonly TMode[],
  fallback: TMode,
  label: string,
): TMode {
  const value = mode ?? (modes.includes(fallback) ? fallback : modes[0]);
  if (value === undefined) throw new Error(`Quasar ${label} editor modes cannot be empty`);
  if (!modes.includes(value))
    throw new Error(`Quasar ${label} editor defaultMode must be one of its enabled modes`);
  return value;
}

function freezeToolbar(value: readonly (readonly string[])[]): readonly (readonly string[])[] {
  if (!value.every((group) => group.length && group.every((name) => name.length > 0)))
    throw new Error("Quasar editor toolbar groups must contain non-empty tool names");
  return Object.freeze(value.map((group) => Object.freeze([...group])));
}

function freezeRichTextTools(
  tools: Readonly<Record<string, QuasarRichTextTool>>,
): Readonly<Record<string, QuasarRichTextTool>> {
  const copy: Record<string, QuasarRichTextTool> = {};
  for (const [name, tool] of Object.entries(tools)) {
    if (!isToolName(name) || name === "edit" || name === "source" || name === "preview")
      throw new Error(`Quasar rich-text editor tool ${name} is reserved or invalid`);
    if (!isTool(tool))
      throw new Error(`Quasar rich-text editor tool ${name} must define label and run`);
    copy[name] = Object.freeze({ ...tool });
  }
  return Object.freeze(copy);
}

function isRichTextMode(value: string): value is QuasarRichTextMode {
  return value === "edit" || value === "source" || value === "preview";
}

function isToolName(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(value);
}

function isTool(value: unknown): value is QuasarRichTextTool {
  return (
    typeof value === "object" &&
    value !== null &&
    "label" in value &&
    typeof value.label === "string" &&
    "run" in value &&
    typeof value.run === "function"
  );
}
