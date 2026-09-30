package licenses_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
)

// preFamilyMigrationVersion is the schema version immediately before
// 20260902000000_license_family.sql: the last one where the family of a
// license version was inferred from its name, nothing said whether a version
// may be served, and (name, version) was unique per organization.
const preFamilyMigrationVersion int64 = 20260901000000

// nameVersionKey is the pre-family uniqueness the migration drops and its Down
// restores.
const nameVersionKey = "license_name_version_organization_id_key"

// legacyLicenseRow is one (name, version) row as the pre-family schema stored
// it, joined to the family and the lifecycle state the migration derived for
// it.
type legacyLicenseRow struct {
	Slug           string
	Version        int32
	IsDefault      bool
	LifecycleState string
	FamilyID       uuid.UUID
	FamilySlug     string
}

// TestLicenseFamilyMigration_BackfillsFamiliesFromNameGroups covers the
// backfill: families materialized on
// a dataset holding multi-version families, a single-version license, and two
// organizations using the same license name, with version numbering continuous
// throughout -- and every one of those rows still servable afterwards.
//
// Two things about it are deliberate. It migrates down to
// preFamilyMigrationVersion, writes rows in the shape that schema accepted (no
// family_id, no lifecycle_state, versions assigned by the name-keyed trigger),
// then migrates back up and asserts on what the backfill produced -- there is
// no other way to observe it, since family_id is NOT NULL from the moment the
// migration finishes. And it runs on its own pool rather than the shared one:
// pgx caches statement plans per connection, and DDL arriving underneath a
// cached plan is how a later, unrelated test ends up failing on "cached plan
// must not change result type". The usual testDb.Reset() cleanup is enough to
// undo it, because the snapshot it restores was taken after all migrations had
// been applied.
func TestLicenseFamilyMigration_BackfillsFamiliesFromNameGroups(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	ctx := t.Context()
	orgA := testDb.DefaultData.OrganizationID
	orgB := uuid.New()

	require.NoError(t, database.DownTo(ctx, testDb.ConnectionString, preFamilyMigrationVersion))

	pool, err := database.ConnectDB(testDb.ConnectionString)
	require.NoError(t, err)
	defer pool.Close()

	seedLegacyOrganization(ctx, t, pool, orgB)

	// version is left to the (name, organization_id) trigger rather than
	// written here: the point of the assertions below is that the numbers the
	// old family key produced survive the move to the new one.
	insertLegacyLicense(ctx, t, pool, orgA, "Pro", "pro-v1-legacy", false)
	insertLegacyLicense(ctx, t, pool, orgA, "Pro", "pro-v2-legacy", false)
	insertLegacyLicense(ctx, t, pool, orgA, "Pro", "pro-v3-legacy", false)
	insertLegacyLicense(ctx, t, pool, orgA, "Solo", "solo-only-version", true)
	// Two defaults in one family, which the pre-family schema had nothing to
	// reject: unsetting the previous default was an application step, not a
	// constraint.
	insertLegacyLicense(ctx, t, pool, orgA, "Duo", "duo-first", true)
	insertLegacyLicense(ctx, t, pool, orgA, "Duo", "duo-second", true)
	insertLegacyLicense(ctx, t, pool, orgB, "Pro", "pro-other-org", false)

	require.NoError(t, database.RunMigrations(testDb.ConnectionString))

	proA := readFamilyRows(ctx, t, pool, orgA, "Pro")
	require.Len(t, proA, 3)
	require.Equal(t, []int32{1, 2, 3}, versionsOf(proA), "the backfill must not renumber versions")
	require.Equal(t, proA[0].FamilyID, proA[1].FamilyID)
	require.Equal(t, proA[0].FamilyID, proA[2].FamilyID, "every version of a name group belongs to one family")
	require.Equal(t, "pro-v1-legacy", proA[0].FamilySlug,
		"the family slug comes from the group's lowest-version row, which is the slug the catalogue has been addressing")

	solo := readFamilyRows(ctx, t, pool, orgA, "Solo")
	require.Len(t, solo, 1)
	require.Equal(t, []int32{1}, versionsOf(solo))
	require.Equal(t, "solo-only-version", solo[0].FamilySlug)
	require.NotEqual(t, proA[0].FamilyID, solo[0].FamilyID, "a single-version license gets a family of its own")
	require.True(t, solo[0].IsDefault, "a lone default is already the one default of its family")

	// Same name, different organization: the (organization_id, name) grouping
	// has to keep them apart, or one tenant's rename would renumber another's
	// versions.
	proB := readFamilyRows(ctx, t, pool, orgB, "Pro")
	require.Len(t, proB, 1)
	require.Equal(t, []int32{1}, versionsOf(proB))
	require.NotEqual(t, proA[0].FamilyID, proB[0].FamilyID,
		"two organizations using the same license name must not share a family")

	duo := readFamilyRows(ctx, t, pool, orgA, "Duo")
	require.Len(t, duo, 2)
	require.Equal(t, duo[0].FamilyID, duo[1].FamilyID)
	require.False(t, duo[0].IsDefault, "the lower version loses the default the partial unique index now forbids sharing")
	require.True(t, duo[1].IsDefault, "the highest version keeps it, since a family's default is meant to be its current version")

	// Every row that predates the migration is live, with instances possibly
	// pinned to it, so it has to come out servable. The defaults surviving above
	// depend on it too: any other backfill value would have violated
	// license_default_must_be_published_check and failed the migration outright.
	for _, rows := range [][]legacyLicenseRow{proA, solo, proB, duo} {
		for _, row := range rows {
			require.Equalf(t, "PUBLISHED", row.LifecycleState,
				"%s predates the lifecycle state and must stay servable", row.Slug)
		}
	}

	// The re-keyed trigger has to continue the sequence the old one produced,
	// not restart it: this is the continuity the backfill exists to preserve.
	next := insertLicenseInFamily(ctx, t, pool, orgA, proA[0].FamilyID, "Pro", "pro-v4-new")
	require.Equal(t, int32(4), next, "the family sequence continues across the migration")
}

// TestLicenseFamilyMigration_PartialUniqueIndexRejectsASecondDefault pins the
// database half of the one-default-per-family rule, on a family built by
// the backfill rather than by the application, so the index is confirmed to
// apply to migrated rows and not only to newly created ones.
func TestLicenseFamilyMigration_PartialUniqueIndexRejectsASecondDefault(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	ctx := t.Context()
	orgA := testDb.DefaultData.OrganizationID

	require.NoError(t, database.DownTo(ctx, testDb.ConnectionString, preFamilyMigrationVersion))

	pool, err := database.ConnectDB(testDb.ConnectionString)
	require.NoError(t, err)
	defer pool.Close()

	insertLegacyLicense(ctx, t, pool, orgA, "Indexed", "indexed-first", true)
	insertLegacyLicense(ctx, t, pool, orgA, "Indexed", "indexed-second", false)

	require.NoError(t, database.RunMigrations(testDb.ConnectionString))

	rows := readFamilyRows(ctx, t, pool, orgA, "Indexed")
	require.Len(t, rows, 2)
	require.True(t, rows[0].IsDefault)
	require.False(t, rows[1].IsDefault)

	_, err = pool.Exec(ctx,
		`UPDATE "license" SET "is_default" = TRUE WHERE "slug" = $1 AND "organization_id" = $2`,
		"indexed-second", orgA)
	require.ErrorContains(t, err, "license_family_id_is_default_key",
		"a second default in one family must be refused by the partial unique index, not merely by the application")
}

// TestLicenseFamilyMigration_CheckRefusesAnUnpublishedDefault covers the
// constraint that makes family resolution total: a family's default is always a
// version the catalogue may serve, guaranteed by the database rather than by
// whichever write path remembered to check.
func TestLicenseFamilyMigration_CheckRefusesAnUnpublishedDefault(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	ctx := t.Context()
	orgID := testDb.DefaultData.OrganizationID

	pool, err := database.ConnectDB(testDb.ConnectionString)
	require.NoError(t, err)
	defer pool.Close()

	familyID := insertFamily(ctx, t, pool, orgID, "checked-family")
	insertPublishedVersion(ctx, t, pool, orgID, familyID, "Checked", "checked-v1", true)

	for _, state := range []string{"DRAFT", "ARCHIVED"} {
		t.Run(state, func(t *testing.T) {
			_, err := pool.Exec(ctx,
				`UPDATE "license" SET "lifecycle_state" = $1 WHERE "slug" = $2 AND "organization_id" = $3`,
				state, "checked-v1", orgID)

			var pgErr *pgconn.PgError
			require.ErrorAs(t, err, &pgErr, "the database accepted a default it may not serve")
			require.Equal(t, "license_default_must_be_published_check", pgErr.ConstraintName,
				"rejected, but by %s: %s", pgErr.Code, pgErr.Message)
		})
	}

	// The other direction is allowed: withdraw a version that is not the
	// family's default and nothing objects.
	insertPublishedVersion(ctx, t, pool, orgID, familyID, "Checked", "checked-v2", false)
	_, err = pool.Exec(ctx,
		`UPDATE "license" SET "lifecycle_state" = 'ARCHIVED' WHERE "slug" = $1 AND "organization_id" = $2`,
		"checked-v2", orgID)
	require.NoError(t, err)
}

// TestLicenseFamilyMigration_LeavesTheLifecycleStateWithoutADefault pins where a
// new version's state comes from. The column default only exists for the
// backfill -- the backfill test above checks it did its job -- and is dropped
// right after, so the rule "published unless the caller asks for a draft" has
// one home, createlicense. An INSERT that forgets the column fails instead of
// publishing a version nobody chose to publish.
func TestLicenseFamilyMigration_LeavesTheLifecycleStateWithoutADefault(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	ctx := t.Context()
	orgID := testDb.DefaultData.OrganizationID

	pool, err := database.ConnectDB(testDb.ConnectionString)
	require.NoError(t, err)
	defer pool.Close()

	var columnDefault *string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT column_default FROM information_schema.columns
		 WHERE table_schema = 'public' AND table_name = 'license' AND column_name = 'lifecycle_state'`,
	).Scan(&columnDefault))
	require.Nil(t, columnDefault, "lifecycle_state must not keep a default after the backfill")

	familyID := insertFamily(ctx, t, pool, orgID, "stateless-family")
	_, err = pool.Exec(ctx,
		`INSERT INTO "license" ("name", "slug", "description", "type", "is_default", "organization_id", "family_id")
		 VALUES ('Stateless', 'stateless-v1', 'No state given', 'DEVELOPMENT', FALSE, $1, $2)`,
		orgID, familyID)

	var pgErr *pgconn.PgError
	require.ErrorAs(t, err, &pgErr, "an INSERT without a lifecycle state was accepted")
	require.Equal(t, "23502", pgErr.Code, "not_null_violation expected: %s", pgErr.Message)
	require.Equal(t, "lifecycle_state", pgErr.ColumnName)
}

// TestLicenseFamilyMigration_IsReversible pins the Down against the schema the
// Up started from: the name-keyed uniqueness back, the family and the
// lifecycle state gone, and the trigger numbering versions per name again --
// then the Up applied a second time over rows written in between.
// tests/integrations/database runs every migration down and up on an empty
// database; this one does it with rows in the way.
func TestLicenseFamilyMigration_IsReversible(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	ctx := t.Context()
	orgID := testDb.DefaultData.OrganizationID

	pool, err := database.ConnectDB(testDb.ConnectionString)
	require.NoError(t, err)
	defer pool.Close()

	require.False(t, constraintExists(ctx, t, pool, nameVersionKey), "fully migrated, the pre-family key is gone")
	require.True(t, relationExists(ctx, t, pool, "license_family"))
	require.True(t, columnExists(ctx, t, pool, "license", "lifecycle_state"))

	require.NoError(t, database.DownTo(ctx, testDb.ConnectionString, preFamilyMigrationVersion))

	require.True(t, constraintExists(ctx, t, pool, nameVersionKey),
		"the Down restores the key as the initial schema declared it")
	require.False(t, relationExists(ctx, t, pool, "license_family"))
	require.False(t, columnExists(ctx, t, pool, "license", "family_id"))
	require.False(t, columnExists(ctx, t, pool, "license", "lifecycle_state"))
	require.False(t, typeExists(ctx, t, pool, "license_lifecycle_state"))

	// The restored trigger numbers versions per name again.
	insertLegacyLicense(ctx, t, pool, orgID, "Rolled Back", "rolled-back-first", false)
	insertLegacyLicense(ctx, t, pool, orgID, "Rolled Back", "rolled-back-second", false)
	require.Equal(t, []int32{1, 2}, legacyVersions(ctx, t, pool, orgID, "Rolled Back"))

	require.NoError(t, database.RunMigrations(testDb.ConnectionString))

	require.False(t, constraintExists(ctx, t, pool, nameVersionKey))
	rows := readFamilyRows(ctx, t, pool, orgID, "Rolled Back")
	require.Len(t, rows, 2)
	require.Equal(t, rows[0].FamilyID, rows[1].FamilyID, "the second Up groups what the rolled-back schema wrote")
	require.Equal(t, "rolled-back-first", rows[0].FamilySlug)
}

// TestLicenseFamilyMigration_DownRefusesTwoFamiliesSharingAName pins what the
// Down's comment promises: rows the Up made legitimate -- two products under
// one display name -- are not silently merged back into one name group. The
// Down fails on them instead, on its first statement, and the schema stays
// exactly where it was.
func TestLicenseFamilyMigration_DownRefusesTwoFamiliesSharingAName(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	ctx := t.Context()
	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	for _, slug := range []string{"twin-a", "twin-b"} {
		_, err := repo.CreateLicense(ctx, &createlicense.Command{
			Name:        "Twin",
			Slug:        ptr.To(slug),
			Description: "One of two products called Twin",
			Type:        schema.Paid,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
	}

	err := database.DownTo(ctx, testDb.ConnectionString, preFamilyMigrationVersion)
	require.ErrorContains(t, err, nameVersionKey,
		"the Down must refuse to re-key two products on one name")

	pool, err := database.ConnectDB(testDb.ConnectionString)
	require.NoError(t, err)
	defer pool.Close()
	require.False(t, constraintExists(ctx, t, pool, nameVersionKey),
		"a refused Down leaves the schema as it was")
	require.True(t, relationExists(ctx, t, pool, "license_family"),
		"the families included: the Down rolled back as a whole")
	require.True(t, columnExists(ctx, t, pool, "license", "lifecycle_state"))
}

// ── helpers ────────────────────────────────────────────────────────────────

func seedLegacyOrganization(ctx context.Context, t *testing.T, pool *pgxpool.Pool, organizationID uuid.UUID) {
	t.Helper()
	_, err := pool.Exec(ctx,
		`INSERT INTO "organization" ("id", "external_id", "name") VALUES ($1, $2, 'Other Organization')`,
		organizationID, "organization-external-"+organizationID.String())
	require.NoError(t, err)
}

// insertLegacyLicense writes a license row the way the pre-family schema
// took one: no family_id, no lifecycle_state, and version left to
// update_license_version() as it was keyed then, on (name, organization_id).
func insertLegacyLicense(ctx context.Context, t *testing.T, pool *pgxpool.Pool, organizationID uuid.UUID, name, slug string, isDefault bool) {
	t.Helper()
	_, err := pool.Exec(ctx,
		`INSERT INTO "license" ("name", "slug", "description", "type", "is_default", "organization_id")
		 VALUES ($1, $2, 'Legacy row', 'DEVELOPMENT', $3, $4)`,
		name, slug, isDefault, organizationID)
	require.NoError(t, err)
}

// legacyVersions reads the versions the name-keyed trigger assigned, for a
// schema that has no family to join.
func legacyVersions(ctx context.Context, t *testing.T, pool *pgxpool.Pool, organizationID uuid.UUID, name string) []int32 {
	t.Helper()
	rows, err := pool.Query(ctx,
		`SELECT "version" FROM "license" WHERE "organization_id" = $1 AND "name" = $2 ORDER BY "version"`,
		organizationID, name)
	require.NoError(t, err)
	defer rows.Close()

	var versions []int32
	for rows.Next() {
		var version int32
		require.NoError(t, rows.Scan(&version))
		versions = append(versions, version)
	}
	require.NoError(t, rows.Err())
	return versions
}

// insertLicenseInFamily writes a row through the migrated schema and returns
// the version the re-keyed trigger assigned it.
func insertLicenseInFamily(ctx context.Context, t *testing.T, pool *pgxpool.Pool, organizationID, familyID uuid.UUID, name, slug string) int32 {
	t.Helper()
	var version int32
	err := pool.QueryRow(ctx,
		`INSERT INTO "license" ("name", "slug", "description", "type", "is_default", "lifecycle_state", "organization_id", "family_id")
		 VALUES ($1, $2, 'Post-migration row', 'DEVELOPMENT', FALSE, 'PUBLISHED', $3, $4)
		 RETURNING "version"`,
		name, slug, organizationID, familyID).Scan(&version)
	require.NoError(t, err)
	return version
}

func insertFamily(ctx context.Context, t *testing.T, pool *pgxpool.Pool, organizationID uuid.UUID, slug string) uuid.UUID {
	t.Helper()
	familyID := uuid.New()
	_, err := pool.Exec(ctx,
		`INSERT INTO "license_family" ("id", "organization_id", "slug") VALUES ($1, $2, $3)`,
		familyID, organizationID, slug)
	require.NoError(t, err)
	return familyID
}

func insertPublishedVersion(
	ctx context.Context, t *testing.T, pool *pgxpool.Pool,
	organizationID, familyID uuid.UUID, name, slug string, isDefault bool,
) {
	t.Helper()
	_, err := pool.Exec(ctx,
		`INSERT INTO "license" ("name", "slug", "description", "type", "is_default", "lifecycle_state", "organization_id", "family_id")
		 VALUES ($1, $2, 'Published row', 'DEVELOPMENT', $3, 'PUBLISHED', $4, $5)`,
		name, slug, isDefault, organizationID, familyID)
	require.NoError(t, err)
}

func readFamilyRows(ctx context.Context, t *testing.T, pool *pgxpool.Pool, organizationID uuid.UUID, name string) []legacyLicenseRow {
	t.Helper()
	rows, err := pool.Query(ctx,
		`SELECT l."slug", l."version", l."is_default", l."lifecycle_state"::text, f."id", f."slug"
		 FROM "license" l
		        JOIN "license_family" f ON f."id" = l."family_id"
		 WHERE l."organization_id" = $1 AND l."name" = $2
		 ORDER BY l."version"`,
		organizationID, name)
	require.NoError(t, err)
	defer rows.Close()

	var out []legacyLicenseRow
	for rows.Next() {
		var row legacyLicenseRow
		require.NoError(t, rows.Scan(&row.Slug, &row.Version, &row.IsDefault, &row.LifecycleState, &row.FamilyID, &row.FamilySlug))
		out = append(out, row)
	}
	require.NoError(t, rows.Err())
	return out
}

func versionsOf(rows []legacyLicenseRow) []int32 {
	versions := make([]int32, 0, len(rows))
	for _, row := range rows {
		versions = append(versions, row.Version)
	}
	return versions
}

func constraintExists(ctx context.Context, t *testing.T, pool *pgxpool.Pool, name string) bool {
	t.Helper()
	var exists bool
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = $1)`, name).Scan(&exists))
	return exists
}

func relationExists(ctx context.Context, t *testing.T, pool *pgxpool.Pool, name string) bool {
	t.Helper()
	var exists bool
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT to_regclass('public.' || quote_ident($1)) IS NOT NULL`, name).Scan(&exists))
	return exists
}

func columnExists(ctx context.Context, t *testing.T, pool *pgxpool.Pool, table, column string) bool {
	t.Helper()
	var exists bool
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM information_schema.columns
		                WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2)`,
		table, column).Scan(&exists))
	return exists
}

func typeExists(ctx context.Context, t *testing.T, pool *pgxpool.Pool, name string) bool {
	t.Helper()
	var exists bool
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
		                WHERE n.nspname = 'public' AND t.typname = $1)`, name).Scan(&exists))
	return exists
}
