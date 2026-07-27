# Security policy

## Supported versions

Security fixes are applied to the latest revision of the default branch.
Earlier commits and forks are not maintained.

## Report a vulnerability

Please use GitHub’s private **Security → Report a vulnerability** flow for this
repository. If private vulnerability reporting is unavailable, contact the
maintainer through their GitHub profile before sharing technical details.

Do not open a public issue for an unpatched vulnerability. Include:

- the affected path or component;
- reproduction steps or a proof of concept;
- the likely impact;
- any suggested mitigation;
- whether the issue involves a dependency or exposed credential.

You should receive an acknowledgement within seven days. Please allow time for
triage and a coordinated fix before public disclosure.

## Secrets

The application does not require runtime secrets. Mint MCP uses contributor-
local OAuth state; never commit tokens, API keys, `.env` files, or downloaded
account data.
