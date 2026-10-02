# Application test support

`contracts/msw-slots.ts` owns serialized slot payloads and the shared storage key.
Models in `model/` own their state and serialization, without Playwright imports.
`model/graphql-operations.ts` describes operations reused by both transports;
`contracts/mock-http.ts` owns neutral HTTP/error mapping.

`mocks/` installs state in the page for MSW or uses explicit legacy page routes.
Browser handlers and persistence are in `src/e2e/msw/`. `scenario-registry.ts` is
the one inventory of scenario factories and explicit seeded variants executed by
`check:e2e-contracts`; fixtures/drivers remain reusable support for specs.

Follow-up test-tooling coverage uses these entry points: slot/model type alignment,
missing scenario registration, fallback order, serialization after CRUD/errors,
transport parity for supported legacy operations, and strict unhandled requests.
Keep config/gate checks browser-free. CI triggers need to cover root
`vite.config.ts`, root `scripts/**`, `packages/api-codegen/**`, API GraphQL schemas,
shared setup actions and workflow changes as well as app/theme/package manifests.
The next test phase owns those stronger checks/triggers rather than duplicating
the registry or moving the adapters again.
