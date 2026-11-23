# What facts.sh looks at in this repository. facts.sh and body.sh are the same files in every
# repository that drafts release notes this way; this file is what differs.
#
# Paths are relative to the repository root. A glob's `*` also matches `/`.

REPOSITORY=kaitencloud/kaiten
NAME=kaiten

# The API contract: oasdiff compares each document between the two releases.
OPENAPI_DOCS=(app/openapi.yaml app/platform-openapi.yaml)

# The GraphQL schema, as release-graphql-schema.yml assembles it: the files concatenated in
# path order.
GRAPHQL_SCHEMA_GLOBS=(
  'api/internal/infrastructure/http/graphql/schema.graphqls'
  'api/internal/modules/*/schema/*.graphqls'
)

MIGRATION_DIRS=(api/internal/infrastructure/database/migrations)

CHART_VALUES=(charts/kaiten/values.yaml charts/kaiten-infra/values.yaml)

# What each published artifact is built from, name=paths. An artifact whose paths have no new
# commit since the previous release was rebuilt, not changed. The images' paths are the
# `source-paths` their release workflow passes to .github/actions/docker-meta, which stamps the
# same answer on the image as sh.kaiten.component.revision; test-release-notes-facts.sh checks
# that the two lists agree.
COMPONENTS=(
  'api=api'
  'seeder=api'
  'admin-tools=api'
  'app=app packages/theme packages/api-codegen package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc'
  'chart-kaiten=charts/kaiten'
  'chart-kaiten-infra=charts/kaiten-infra'
)
