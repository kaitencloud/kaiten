package licenses_test

import (
	"context"
	"fmt"
	"strconv"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// TestCreateLicense_ConcurrentSameFamilyGetsDistinctVersions is the
// regression test for concurrent version assignment, keyed on the family.
//
// Without serialization, N transactions that overlap all compute the same next
// version; license_family_id_version_key then rejects every one but the first,
// and the caller sees a 409 it can do nothing about -- retrying sends the same
// body and races again. The creates here go through the repository, which
// locks the family row before deriving each version's slug, so this pins that
// path; TestCreateLicense_TriggerNumbersConcurrentInsertsOnItsOwn pins the
// trigger's own serialization, which holds without the repository's lock.
//
// Version numbering is the whole point of the family, so this asserts the exact
// set rather than just "no error": a lock that serialized but still produced
// gaps would be just as wrong. The derived slugs are asserted for the same
// reason -- they are built from the version number each insert computed, so a
// duplicate slug would mean two inserts agreed on a number the trigger then
// disagreed with.
func TestCreateLicense_ConcurrentSameFamilyGetsDistinctVersions(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	const concurrency = 8
	const familySlug = "concurrent-family"

	uof := uow.NewUnitOfWork(testServer.Dependencies.DB)
	repo := createlicense.NewCommandRepository(uof)

	// Version 1, which also creates the family the racing creates all target.
	first, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Concurrent Family",
		Slug:        ptr.To(familySlug),
		Description: "Version that opens the family",
		Type:        schema.Development,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	require.Equal(t, "1", first.Version)

	created := make([]*schema.License, concurrency)
	errs := make([]error, concurrency)

	// Every goroutine blocks on the same channel so the inserts genuinely
	// overlap instead of queueing behind each other's setup.
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := range concurrency {
		wg.Add(1)
		go func() {
			defer wg.Done()

			// No Slug: the repository derives {familySlug}-v{n} under the
			// family's row lock, which is the path being raced here.
			command := &createlicense.Command{
				Name:        "Concurrent Family",
				FamilySlug:  ptr.To(familySlug),
				Description: "Concurrent version race",
				Type:        schema.Development,
			}

			<-start
			errs[i] = uof.Transact(t.Context(), func(ctx context.Context) error {
				license, err := repo.CreateLicense(ctx, command, testDb.DefaultData.OrganizationID)
				created[i] = license
				return err
			})
		}()
	}
	close(start)
	wg.Wait()

	for i, err := range errs {
		require.NoErrorf(t, err, "concurrent create %d failed -- the version race is back", i)
	}

	seenVersions := make(map[string]int, concurrency)
	seenSlugs := make(map[string]int, concurrency)
	for _, license := range created {
		require.NotNil(t, license)
		seenVersions[license.Version]++
		seenSlugs[license.Slug]++
	}

	expectedVersions := make(map[string]int, concurrency)
	expectedSlugs := make(map[string]int, concurrency)
	for version := 2; version <= concurrency+1; version++ {
		expectedVersions[strconv.Itoa(version)] = 1
		expectedSlugs[fmt.Sprintf("%s-v%d", familySlug, version)] = 1
	}
	require.Equal(t, expectedVersions, seenVersions,
		"concurrent creates in one family must produce versions 2..%d exactly once each", concurrency+1)
	require.Equal(t, expectedSlugs, seenSlugs,
		"each version's slug is derived from its own version number, so they cannot repeat")
}

// TestCreateLicense_TriggerNumbersConcurrentInsertsOnItsOwn is the same race
// at trigger level: concurrent INSERTs that bypass the repository -- and so
// its family row lock -- still come out as a dense sequence, because
// update_license_version() advances the family's counter on the family row and
// that UPDATE holds the row to commit. Replace it with a read of the counter,
// or of MAX(version), and the racing inserts collide on
// license_family_id_version_key.
func TestCreateLicense_TriggerNumbersConcurrentInsertsOnItsOwn(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	const concurrency = 8

	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	first, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Raw Concurrent Family",
		Slug:        ptr.To("raw-concurrent-family"),
		Description: "Version that opens the family",
		Type:        schema.Development,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	pool := testServer.Dependencies.DB
	versions := make([]int32, concurrency)
	errs := make([]error, concurrency)

	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := range concurrency {
		wg.Go(func() {
			<-start
			tx, err := pool.Begin(t.Context())
			if err != nil {
				errs[i] = err
				return
			}
			defer func() { _ = tx.Rollback(context.Background()) }()

			row, err := db.New(tx).CreateLicense(t.Context(), db.CreateLicenseParams{
				PricingType:           db.PricingTypeCUSTOM,
				TrialPeriodDays:       nil,
				RequiresPaymentMethod: false,
				SelfServeCtaUrl:       nil,
				Name:                  "Raw Concurrent Family",
				Slug:                  fmt.Sprintf("raw-concurrent-%d", i),
				Description:           "Inserted without the repository's lock",
				Type:                  db.LicenseTypeDEVELOPMENT,
				VersionName:           nil,
				IsDefault:             false,
				Features:              nil,
				OrganizationID:        testDb.DefaultData.OrganizationID,
				FamilyID:              first.FamilyID,
				LifecycleState:        db.LicenseLifecycleStatePUBLISHED,
			})
			if err != nil {
				errs[i] = err
				return
			}
			versions[i] = row.Version
			errs[i] = tx.Commit(t.Context())
		})
	}
	close(start)
	wg.Wait()

	for i, err := range errs {
		require.NoErrorf(t, err, "raw concurrent insert %d failed -- the trigger does not serialize the family", i)
	}

	seen := make(map[int32]int, concurrency)
	for _, version := range versions {
		seen[version]++
	}
	expected := make(map[int32]int, concurrency)
	for version := int32(2); version <= concurrency+1; version++ {
		expected[version] = 1
	}
	require.Equal(t, expected, seen, "concurrent inserts must take versions 2..%d exactly once each", concurrency+1)

	var lastVersion int32
	require.NoError(t, pool.QueryRow(t.Context(),
		`SELECT "last_version" FROM "license_family" WHERE "id" = $1`, first.FamilyID).Scan(&lastVersion))
	require.Equal(t, int32(concurrency+1), lastVersion)
}

// TestCreateLicense_LosingTheDefaultRaceIsReportedAsAConflict is the create
// half of TestUpdateLicense_LosingTheDefaultRaceIsReportedAsAConflict: a
// version created as its family's default while another transaction sets a
// default it cannot see yet collides on license_family_id_is_default_key, and
// that reaches the caller as a 409 it can retry rather than as a 500.
func TestCreateLicense_LosingTheDefaultRaceIsReportedAsAConflict(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	const familySlug = "raced-default-on-create"

	first, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Raced Default On Create",
		Slug:        ptr.To(familySlug),
		Description: "Version 1, not the default yet",
		Type:        schema.Paid,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	hidden, err := testServer.Dependencies.DB.Begin(t.Context())
	require.NoError(t, err)
	defer func() { _ = hidden.Rollback(context.Background()) }()

	_, err = hidden.Exec(t.Context(),
		`UPDATE "license" SET "is_default" = TRUE WHERE "slug" = $1 AND "organization_id" = $2`,
		first.Slug, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	createErr := make(chan error, 1)
	go func() {
		_, err := repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:        "Raced Default On Create",
			FamilySlug:  ptr.To(familySlug),
			Description: "Version 2, claiming the default",
			Type:        schema.Paid,
			IsDefault:   true,
		}, testDb.DefaultData.OrganizationID)
		createErr <- err
	}()

	// The create's unset cannot see the uncommitted default, so its INSERT has
	// to be waiting on the index entry before the other side commits.
	waitUntilBlockedOnIndex(t)

	require.NoError(t, hidden.Commit(t.Context()))

	err = <-createErr
	var kerr *kaitenerrors.Error
	require.ErrorAs(t, err, &kerr)
	require.Equal(t, "CreateLicense.DefaultConflict", kerr.Code)
	require.Equal(t, kaitenerrors.KindConflict, kerr.Kind)
	require.Equal(t, 1, countDefaultsInFamily(t, first.Slug))
	require.True(t, isDefault(t, first.Slug))
}

// TestCreateLicense_DefaultVersionNameMatchesTheVersion pins the other half
// of the trigger rewrite: the default version_name is built from
// the version the same statement just assigned, not from a second, separately
// evaluated MAX(version) + 1 that a concurrent insert could have moved.
func TestCreateLicense_DefaultVersionNameMatchesTheVersion(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	const familySlug = "unnamed-family"

	for i := range 3 {
		command := &createlicense.Command{
			Name:        "Unnamed Family",
			Description: "No version name supplied",
			Type:        schema.Development,
		}
		if i == 0 {
			command.Slug = ptr.To(familySlug)
		} else {
			command.FamilySlug = ptr.To(familySlug)
		}

		license, err := repo.CreateLicense(t.Context(), command, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		require.Equal(t, strconv.Itoa(i+1), license.Version)
		require.NotNil(t, license.VersionName)
		require.Equal(t, fmt.Sprintf("Version - %s", license.Version), *license.VersionName)
	}
}

// TestCreateLicense_UnknownFamilyIsRejected covers the one way naming a family
// can fail: nothing addresses that slug. It is a 404 rather than a validation
// error because the slug is well-formed and the caller is pointing at a family
// it believes exists -- the same shape as any other missing resource.
func TestCreateLicense_UnknownFamilyIsRejected(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	_, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Orphan",
		FamilySlug:  ptr.To("no-such-family"),
		Description: "Targets a family that does not exist",
		Type:        schema.Development,
	}, testDb.DefaultData.OrganizationID)

	var kerr *kaitenerrors.Error
	require.ErrorAs(t, err, &kerr)
	require.Equal(t, "CreateLicense.FamilyNotFound", kerr.Code)
	require.Equal(t, kaitenerrors.KindNotFound, kerr.Kind)
}

// TestCreateLicense_CallerSuppliedSlugOverridesTheDerivedOne pins the BYO-slug
// override: a version joining a family normally takes {familySlug}-v{n}, but a
// caller that brings its own identifier keeps it.
func TestCreateLicense_CallerSuppliedSlugOverridesTheDerivedOne(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	const familySlug = "byo-family"
	_, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "BYO Family",
		Slug:        ptr.To(familySlug),
		Description: "Version 1",
		Type:        schema.Development,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	second, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "BYO Family",
		FamilySlug:  ptr.To(familySlug),
		Slug:        ptr.To("my-own-identifier"),
		Description: "Version 2 with its own slug",
		Type:        schema.Development,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	require.Equal(t, "my-own-identifier", second.Slug)
	require.Equal(t, "2", second.Version, "bringing your own slug does not opt out of the family sequence")
}
