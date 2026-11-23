-- +goose Up
-- +goose StatementBegin
-- The release notes of a release, as markdown. Written once, by the INSERT
-- that creates the release, like every other column of this write-once table.
-- Nullable: a release created without notes, and every release before this
-- migration, has none. Read by the single-release queries only; the list query
-- leaves it out, so a page of releases stays small.
--
-- The bound is the API's maxLength on releaseNote, in characters: length() on
-- text counts characters, as JSON Schema's maxLength does. Every existing row
-- is NULL, so adding the CHECK cannot fail.
ALTER TABLE "release"
  ADD COLUMN "release_note" TEXT;
ALTER TABLE "release"
  ADD CONSTRAINT "release_release_note_length_check"
    CHECK ("release_note" IS NULL OR length("release_note") <= 62000);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE "release" DROP CONSTRAINT IF EXISTS "release_release_note_length_check";
ALTER TABLE "release" DROP COLUMN IF EXISTS "release_note";
-- +goose StatementEnd
