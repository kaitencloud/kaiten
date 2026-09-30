# The API contract

The console talks to a single backend, the Go API in `api/`. These docs do not
describe that API: the app consumes its contract, which is generated or written in
`api/`. To know what an operation accepts or returns, read the contract itself.

| Contract | File | Where it comes from |
|---|---|---|
| REST, Core API | `app/openapi.yaml` | generated from the Go handlers by `task generate:oas`; the generated file is committed |
| REST, Platform API | `app/platform-openapi.yaml` | generated and committed the same way; the console does not build a client from it |
| GraphQL | `api/internal/infrastructure/http/graphql/schema.graphqls` and `api/internal/modules/*/schema/*.graphqls` | written by hand: the Go resolvers are generated from them (`task generate:gqlgen`) |
| Database | `api/docs/database_schema.md` | generated from the migrations by `task schema-docs` |

The app's typed clients are generated from the Core API and GraphQL rows: run
`pnpm run generate` in `app/`, or `task generate` from the repository root, which
regenerates the OpenAPI documents first. [api-generation.md](api-generation.md)
explains what it produces and how to use it.
