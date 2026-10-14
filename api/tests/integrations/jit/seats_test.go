package jit_test

import (
	"context"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/platform/jit"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
	"github.com/kaitencloud/kaiten/api/tests"
)

// seatReporter records the seat reports provisioning makes, per organization.
type seatReporter struct {
	services.NoopUsageReporter

	mu    sync.Mutex
	seats map[uuid.UUID]int
}

func (r *seatReporter) TrackAsync(organizationID uuid.UUID, entitlementSlug string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if entitlementSlug == dogfooding.SeatEntitlementSlug {
		r.seats[organizationID]++
	}
}

func (r *seatReporter) count(organizationID uuid.UUID) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.seats[organizationID]
}

var _ services.UsageReporter = (*seatReporter)(nil)

// A seat is a membership, not a login: the sign-in that provisions a member into an
// organization counts one, and every sign-in after counts nothing -- which is the
// path every authenticated request takes, so counting there would meter traffic.
func TestProvisioningCountsOneSeatPerMembership(t *testing.T) {
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)

	reporter := &seatReporter{seats: map[uuid.UUID]int{}}
	app, err := kaiten.New(kaiten.Options{DB: testDB.DbPool, UsageReporter: reporter})
	require.NoError(t, err)
	surface := app.InProcess()

	identity := newIdentity()
	require.NoError(t, jit.NewProvisioner(surface).Check(t.Context(), identity))
	assert.Equal(t, 1, reporter.count(identity.OrganizationID), "the first sign-in provisions a member")

	// A fresh provisioner, so the check reaches the database rather than the cache.
	again := newIdentityFromProvisioning(identity.Provisioning)
	require.NoError(t, jit.NewProvisioner(surface).Check(t.Context(), again))
	assert.Equal(t, 1, reporter.count(identity.OrganizationID), "a returning member is not a new seat")

	// The same person signing in to a second organization is a member of two.
	elsewhere := identity.Provisioning
	elsewhere.ExternalOrganizationID = uuid.NewString()
	second := newIdentityFromProvisioning(elsewhere)
	require.NoError(t, jit.NewProvisioner(surface).Check(context.Background(), second))
	assert.Equal(t, second.UserID, identity.UserID)
	assert.Equal(t, 1, reporter.count(second.OrganizationID))
	assert.Equal(t, 1, reporter.count(identity.OrganizationID))
}

// A refused sign-in provisions nothing, so it occupies no seat.
func TestARefusedSignInCountsNoSeat(t *testing.T) {
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)

	reporter := &seatReporter{seats: map[uuid.UUID]int{}}
	app, err := kaiten.New(kaiten.Options{DB: testDB.DbPool, UsageReporter: reporter})
	require.NoError(t, err)
	surface := app.InProcess()

	identity := newIdentity()
	require.NoError(t, jit.NewProvisioner(surface).Check(t.Context(), identity))
	_, err = testDB.DbPool.Exec(t.Context(),
		`UPDATE user_on_organization SET deleted_at = now() WHERE user_id = $1`, identity.UserID)
	require.NoError(t, err)

	removed := newIdentityFromProvisioning(identity.Provisioning)
	require.Error(t, jit.NewProvisioner(surface).Check(t.Context(), removed))
	assert.Equal(t, 1, reporter.count(identity.OrganizationID), "only the original membership was ever a seat")
}
