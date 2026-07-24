# Contributing

UiCogs accepts focused fixes that preserve its resource-first architecture, immutable declarations, normalized shared data, local controller state, and framework-neutral core.

1. Install with `pnpm install --frozen-lockfile`.
2. Add runtime and type regressions before changing behavior.
3. Run `pnpm release:check` before review.
4. Add a Changeset for every public behavior or declaration change.
5. Regenerate reviewed declarations with `pnpm api:report` when public types change.
6. Update `docs/migration-1.0.md` for a breaking change.

Do not add application-specific names, URLs, permissions, defaults, fixtures, UI side effects, framework types in core, public `any`, token logging, or a second official transport. Tests must be deterministic; fixed property-test seeds that expose a defect become permanent regression cases.
