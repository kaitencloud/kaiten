package licenses_test

import (
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/updatelicense"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// One default per family is a database guarantee, not a convention: the write
// path unsets the previous default just before setting the new one, and two
// transactions interleaving those steps would leave two defaults behind with
// nothing to object. license_family_id_is_default_key makes the second writer
// lose instead.
//
// The two writers are genuinely concurrent rather than sequential: the second
// UPDATE is issued while the first transaction is still open, so it blocks on
// the index entry the first one took and only fails once that one commits.
// Sequentially it would fail immediately, which proves less -- an application
// check could produce that too.
func TestUpdateLicense_ConcurrentDefaultsAreRejectedByThePartialUniqueIndex(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	const familySlug = "contended-default"

	first, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Contended Default",
		Slug:        ptr.To(familySlug),
		Description: "Version 1, not the default",
		Type:        schema.Paid,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	second, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Contended Default",
		FamilySlug:  ptr.To(familySlug),
		Description: "Version 2, not the default either",
		Type:        schema.Paid,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	pool := testServer.Dependencies.DB

	winner, err := pool.Begin(t.Context())
	require.NoError(t, err)
	defer func() { _ = winner.Rollback(t.Context()) }()

	_, err = winner.Exec(t.Context(),
		`UPDATE "license" SET "is_default" = TRUE WHERE "slug" = $1 AND "organization_id" = $2`,
		first.Slug, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	loser, err := pool.Begin(t.Context())
	require.NoError(t, err)
	defer func() { _ = loser.Rollback(t.Context()) }()

	// Issued while winner is still open, so it waits on the index rather than
	// seeing the uncommitted TRUE.
	loserErr := make(chan error, 1)
	go func() {
		_, err := loser.Exec(t.Context(),
			`UPDATE "license" SET "is_default" = TRUE WHERE "slug" = $1 AND "organization_id" = $2`,
			second.Slug, testDb.DefaultData.OrganizationID)
		loserErr <- err
	}()

	// Committing before the loser waits would test the sequential case the
	// comment above rules out.
	waitUntilBlockedOnIndex(t)

	require.NoError(t, winner.Commit(t.Context()))

	err = <-loserErr
	var pgErr *pgconn.PgError
	require.ErrorAs(t, err, &pgErr, "the database accepted a second default in one family")
	require.Equal(t, "license_family_id_is_default_key", pgErr.ConstraintName,
		"rejected, but by %s: %s", pgErr.Code, pgErr.Message)

	require.Equal(t, 1, countDefaultsInFamily(t, first.Slug))
	require.True(t, isDefault(t, first.Slug))
	require.False(t, isDefault(t, second.Slug))
}

// TestUpdateLicense_LosingTheDefaultRaceIsReportedAsAConflict is the
// application half of the criterion above: the index violation has to reach the
// caller as a 409 it can retry, not as the generic name/version conflict every
// unique violation used to be reported as, and not as a 500.
//
// The race is forced the only way it happens in practice. Under READ COMMITTED
// the repository's unset cannot see a default another transaction has set but
// not committed, so it clears nothing, and its own write then blocks on the
// index and fails when that transaction commits.
func TestUpdateLicense_LosingTheDefaultRaceIsReportedAsAConflict(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	createRepo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	updateRepo := updatelicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	const familySlug = "raced-default"

	first, err := createRepo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Raced Default",
		Slug:        ptr.To(familySlug),
		Description: "Version 1",
		Type:        schema.Paid,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	second, err := createRepo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Raced Default",
		FamilySlug:  ptr.To(familySlug),
		Description: "Version 2",
		Type:        schema.Paid,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	hidden, err := testServer.Dependencies.DB.Begin(t.Context())
	require.NoError(t, err)
	defer func() { _ = hidden.Rollback(t.Context()) }()

	_, err = hidden.Exec(t.Context(),
		`UPDATE "license" SET "is_default" = TRUE WHERE "slug" = $1 AND "organization_id" = $2`,
		first.Slug, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	updateErr := make(chan error, 1)
	go func() {
		_, err := updateRepo.UpdateLicense(t.Context(), &updatelicense.Command{
			Name:        second.Name,
			Description: second.Description,
			Type:        second.Type,
			Version:     second.Version,
			VersionName: second.VersionName,
			IsDefault:   true,
		}, second.Slug, testDb.DefaultData.UserID, testDb.DefaultData.OrganizationID)
		updateErr <- err
	}()

	// Committing before the repository's write is actually waiting on the index
	// would test the opposite thing: it would see the committed default, unset
	// it, and succeed. Waiting for the block is what pins the interleaving this
	// test is about, instead of leaving it to the scheduler.
	waitUntilBlockedOnIndex(t)

	require.NoError(t, hidden.Commit(t.Context()))

	err = <-updateErr
	var kerr *kaitenerrors.Error
	require.ErrorAs(t, err, &kerr)
	require.Equal(t, "UpdateLicense.DefaultConflict", kerr.Code,
		"a lost default race is its own conflict, not the name/version one")
	require.Equal(t, kaitenerrors.KindConflict, kerr.Kind)
}

// waitUntilBlockedOnIndex blocks until some backend on this database is waiting
// on a lock, which for the tests above means a writer queued behind an
// uncommitted unique-index entry.
//
// Polling pg_stat_activity is what makes an interleaving test deterministic:
// the alternative is committing after a sleep and hoping the other statement
// got there first, which passes or fails on scheduling rather than on
// behaviour.
func waitUntilBlockedOnIndex(t *testing.T) {
	t.Helper()

	const attempts = 100
	for range attempts {
		var blocked bool
		err := testServer.Dependencies.DB.QueryRow(t.Context(),
			`SELECT EXISTS (SELECT 1
			                FROM pg_stat_activity
			                WHERE datname = current_database()
			                  AND wait_event_type = 'Lock'
			                  AND state = 'active')`).Scan(&blocked)
		require.NoError(t, err)
		if blocked {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("no backend ever blocked on a lock: the concurrent write this test depends on never contended")
}
