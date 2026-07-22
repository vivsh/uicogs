export type IssuePath = readonly (string | number)[];

export interface ValidationIssue {
  readonly path: IssuePath;
  readonly message: string;
  readonly code: string;
  readonly source: "parse" | "client" | "server";
  readonly severity: "error" | "warning";
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

export class ParseError extends Error {
  constructor(readonly issues: readonly ValidationIssue[]) {
    super(issues[0]?.message ?? "Input could not be parsed");
    this.name = "ParseError";
  }
}

export type FailureKind =
  | "validation"
  | "authentication"
  | "permission"
  | "not-found"
  | "conflict"
  | "rate-limit"
  | "network"
  | "server"
  | "unknown";

export interface NormalizedFailure {
  readonly kind: FailureKind;
  readonly status?: number;
  readonly message?: string;
  readonly issues: readonly ValidationIssue[];
  readonly retryable: boolean;
}

export class RequestError extends Error {
  constructor(readonly failure: NormalizedFailure) {
    super(failure.message ?? "Request failed");
    this.name = "RequestError";
  }
}

export function parseIssue(
  path: IssuePath,
  message: string,
  code = "invalid_type",
): ValidationIssue {
  return { path, message, code, source: "parse", severity: "error" };
}

export function clientIssue(
  path: IssuePath,
  message: string,
  code = "invalid",
  severity: ValidationIssue["severity"] = "error",
): ValidationIssue {
  return { path, message, code, source: "client", severity };
}

export function normalizeFailure(error: unknown): NormalizedFailure {
  if (error instanceof RequestError) return error.failure;
  if (error instanceof ParseError) {
    return { kind: "validation", message: error.message, issues: error.issues, retryable: false };
  }
  if (error instanceof TransportExecutionError) {
    return {
      kind:
        error.code === "network" || error.code === "timeout"
          ? "network"
          : error.status !== undefined
            ? "server"
            : "unknown",
      ...(error.status !== undefined ? { status: error.status } : {}),
      message: error.message,
      issues: [],
      retryable: error.retryable,
    };
  }
  if (error instanceof Error) {
    const aborted = error.name === "AbortError";
    return {
      kind: aborted ? "network" : "unknown",
      message: error.message,
      issues: [],
      retryable: !aborted,
    };
  }
  return { kind: "unknown", issues: [], retryable: false };
}
import { TransportExecutionError } from "./transport.js";
