---
name: generate-api-errors
description: Make every Huma endpoint declare all the HTTP error statuses it can return, and ensure every API error code has en/fr translations. Fixes the gaps reported by api/cmd/checkapierrors and app's check:api-error-i18n.
disable-model-invocation: true
---

# Complete API error declarations & translations

Bring the API's declared error responses (and their translations) in line with
the errors the code actually produces, so the generated OpenAPI contract — and
the downstream SDKs — document every error response.

## Background

- Each endpoint declares `Errors: []int{http.Status...}` on its `huma.Operation`
  (`api/internal/modules/<module>/<usecase>/endpoint.go`). That list is what
  populates the error responses in `app/openapi.yaml`, and therefore in the
  generated SDKs.
- `api/pkg/apierrors` maps each constructor to a status:
  `NotFound`/`NotFoundf`→404, `Conflict`→409, `Validation`/`ValidationWithDetails`/`FromValidationError`→400,
  `Unauthorized`→401, `Forbidden`→403, `UnprocessableEntity`/`UnprocessableEntityf`→422, `Internal`→500,
  `Unavailable`→503.
  An operation registered through `RegisterScoped`, or through one of the other
  two registrars that take a scope (see `hasScopeGate` in
  `api/cmd/checkapierrors/main.go`), can return 401 and 403.
- The pre-commit hook `api-error-declarations` (tool `api/cmd/checkapierrors`)
  flags endpoints that can return a status they do not declare.

## Part A — backend: complete the `Errors:` lists

1. **List the gaps** — `cd api && go run ./cmd/checkapierrors`
   - Prints each endpoint, what it declares, what it can return, and the missing
     statuses. Exits 1 when there are gaps. (Pass `.go` file paths to scope it to
     specific packages.)

2. **For each flagged endpoint**, open its `endpoint.go` and add the missing
   `http.Status*` constants to the `Errors: []int{...}` slice (keep them in
   ascending numeric order). If the operation has no `Errors:` field, add one.
   ```go
   Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusConflict, http.StatusInternalServerError},
   ```
   - Do NOT remove already-declared statuses — over-declaration is harmless; the
     checker only flags under-declaration.
   - The checker only sees errors returned *within* the usecase package. If the
     handler also calls another module's service that can return e.g. NotFound,
     read the handler chain and add that status too.

3. **Verify** — `task fmt:api && (cd api && go build ./... && go run ./cmd/checkapierrors)`
   (must print `OK`).

4. **Regenerate the contract** — `task generate:oas`
   - Adding statuses changes `app/openapi.yaml`. ⚠️ This changes the **public
     contract**: `sdk-js` and `sdk-go` consume it. Once the change is merged,
     `release-openapi` publishes `@kaitencloud/openapi` and pings `sdk-js`, whose
     `contract-sync` workflow opens the pull request that resyncs its snapshot and
     regenerates both REST clients, with a changeset. `sdk-go` has no drift gate:
     regenerate it with `task generate:sdk-go`.

## Part B — frontend: complete the error translations

1. **Check** — `cd app && pnpm run check:api-error-i18n`
2. **For each missing code**, add an `Errors.api.<CODE>` entry to BOTH
   `app/src/lib/i18n/locales/en.ts` and `.../fr.ts` (en/fr parity is enforced by
   `check:i18n-parity`). The codes are `API_ERROR_CODES` in
   `app/src/lib/errors/types.ts`.
3. **Verify** — `cd app && pnpm run check:api-error-i18n && pnpm run check:i18n-parity`

## Output

Report which endpoints were completed (and the statuses added), whether
`app/openapi.yaml` changed (plus the SDK-resync reminder), and any i18n keys added.
