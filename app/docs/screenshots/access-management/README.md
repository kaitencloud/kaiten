# Users and roles console evidence

Captured on 2026-10-22 at 1440×1000 (desktop) and 390×844 (mobile), using synthetic
Kaiten users in a disposable PostgreSQL database. The real Core HTTP server/JIT/
stored authorization ran behind a loopback gateway validating locally signed JWTs.
The console used its normal generated REST client; no MSW/product data mocks.
No production, identity-provider or customer data appears in these captures.

- `users-console.png`: directory, assigned roles/status, self marker and current
  server-verified local Administrator badge.
- `roles-console.png`: protected built-in templates and editable custom scope group.
- `role-editor.png`: editable named role and resource-scope matrix.
- `user-access-editor.png`: global profile and organization role assignment drawer.
- `users-console-mobile.png`: mobile layout.

Browser interaction verified user disable/re-enable, role edit/save/reload and
read-only built-in Administrator. Core integration tests separately cover upgrade
backfill/idempotency, concurrent bootstrap, privilege boundaries and last-admin
protection. This local gateway is not the deployment's Envoy image; these captures
do not claim production/provider/SaaS or event-pipeline verification.
