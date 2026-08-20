# Package Stability

UiCogs is at `0.1.0`.

The API may change before the first stable 1.0 release. This version is intended for integration testing and early adopters.

## Supported Packages

The primary support policy covers:

- `@uicogs/core`
- `@uicogs/auth`
- `@uicogs/http`
- `@uicogs/vue`
- `@uicogs/routes`
- `@uicogs/react`
- `@uicogs/quasar`
- `@uicogs/openapi`
- `@uicogs/storage`

`@uicogs/legacy` exists only for migration. It has a lower test coverage target.

## Public Contract

Package exports and generated TypeScript declarations define the public contract.

API reports record the exported declarations. Continuous integration rejects an unreviewed report change.

A public change requires:

- an intentional API report update
- a Changeset
- migration instructions when the change is breaking

## Versioning

Patch releases fix defects without intentionally changing documented behavior.

Minor releases may add optional APIs and descriptor kinds.

Major releases may remove or change public APIs. Breaking changes require migration instructions. UiCogs does not retain duplicate permanent APIs only to preserve an older spelling or construction pattern.

`UcTable` and `UcForm` accept optional immutable views. A table view declares generated
columns; a form view declares only generated controls and must be a subset of its form
definition. Views do not change loading, validation, or payload-writing behavior.

## Internal Details

These details are not stable contracts:

- unexported modules
- private controller state
- generated code formatting
- test helpers
- diagnostic wording without a documented error code

All first-party packages use lockstep versions.
