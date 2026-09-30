-- +goose Up
-- +goose StatementBegin
-- `instance.platform` and `instance.metadata` were the same thing twice: two
-- free-form JSONB blobs on the same row, both org-defined, both surfaced to
-- feature-flag targeting, with nothing in the schema or the API to say which
-- key belonged in which. Callers picked one by habit -- the seeder writes
-- `cloudProvider` and `location` into platform, the SaaS reports its own keys
-- into metadata -- and the console ended up rendering both, side by side,
-- as two cards nobody could tell apart.
--
-- metadata is the one that survives, because it is the one that grew a schema:
-- MetadataField declares a typed, ordered, org-scoped set of keys per
-- resource, and the console renders columns, filters and forms from it.
-- platform never had that and was never going to get a second one.
--
-- Dropped outright rather than migrated into metadata. A merge would need a
-- key-collision policy and would import undeclared keys into a resource whose
-- whole point is that its keys are declared; the product is not in production,
-- so there is no data worth carrying across.
ALTER TABLE "instance" DROP COLUMN "platform";
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Restores the column, not its contents. Nothing recorded what was in it.
ALTER TABLE "instance" ADD COLUMN "platform" JSONB;
-- +goose StatementEnd
