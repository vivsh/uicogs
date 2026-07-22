# Security Policy

## Supported Versions

Security fixes are provided for the current `0.x` release line and the latest stable `1.x` release. Legacy adapters are supported for migration defects but do not extend the security lifetime of an application dependency.

## Reporting

Report vulnerabilities privately through the repository's security-advisory facility. Do not open a public issue containing credentials, access tokens, private endpoints, user data, or a working exploit. Include the affected package and version, impact, minimal reproduction, and any suggested mitigation.

Maintainers will acknowledge a complete report within five business days, assess severity, coordinate a fix and disclosure, and credit reporters who request attribution. Never use production systems or data when validating a report.

## Security Boundary

UiCogs parses client-visible JWT claims but does not verify JWT signatures and never replaces server authorization. Applications control token storage, CSP, CORS, CSRF policy, endpoint authorization, upload limits, server validation, and SSE replay retention. Memory token storage is the default because persistent browser storage has a larger exposure surface.
