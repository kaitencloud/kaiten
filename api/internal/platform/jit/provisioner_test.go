package jit

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/organization/ensureorganization"
	organizationschema "github.com/kaitencloud/kaiten/api/internal/modules/organization/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/ensureuser"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

// The nil surface is the assertion, not a shortcut: reaching it would panic, so a
// passing test proves each of these principals is refused before any use case is
// called. Claim validation decides whether there is an identity to resolve at all,
// which is why it stays here rather than moving down with the writes.
func TestProvisionerRejectsInvalidPrincipal(t *testing.T) {
	provisioner := NewProvisioner(nil)

	tests := []struct {
		name      string
		principal *principal.Principal
	}{
		{name: "nil principal"},
		{
			name: "empty subject",
			principal: &principal.Principal{
				Provisioning: principal.Provisioning{
					ExternalOrganizationID: "org_tmnt_hq",
				},
			},
		},
		{
			name: "empty external organization id",
			principal: &principal.Principal{
				Provisioning: principal.Provisioning{
					Subject: "user_splinter",
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Error(t, provisioner.Check(t.Context(), tt.principal))
		})
	}
}

func TestProvisionCacheExpiresEntries(t *testing.T) {
	now := time.Date(2026, time.June, 10, 0, 0, 0, 0, time.UTC)
	cache := newProvisionCache(time.Minute, 10*time.Minute)
	cache.now = func() time.Time { return now }

	userID, organizationID := uuid.New(), uuid.New()
	cache.Put(provisionCacheKey{"identity", "organization"}, userID, organizationID)
	entry, ok := cache.Get(provisionCacheKey{"identity", "organization"})
	require.True(t, ok)
	require.Equal(t, userID, entry.userID)
	require.Equal(t, organizationID, entry.organizationID)

	now = now.Add(time.Minute)
	_, ok = cache.Get(provisionCacheKey{"identity", "organization"})
	require.False(t, ok)
	require.Empty(t, cache.entries)
}

// EnsureUser owns the atomic election. Only its successful return may populate the
// identity cache, so retries after a refused/rolled-back election cannot skip it.
type cacheProvisioning struct {
	organizationID uuid.UUID
	userID         uuid.UUID
	calls          int
	fail           bool
}

func (s *cacheProvisioning) EnsureOrganization(context.Context, *ensureorganization.Command) (*organizationschema.Organization, error) {
	return &organizationschema.Organization{ID: s.organizationID}, nil
}

func (s *cacheProvisioning) EnsureUser(context.Context, *ensureuser.Command) (uuid.UUID, error) {
	s.calls++
	if s.fail {
		return uuid.Nil, context.Canceled
	}
	return s.userID, nil
}

func TestProvisionCacheOnlyAfterSuccessfulElection(t *testing.T) {
	surface := &cacheProvisioning{organizationID: uuid.New(), userID: uuid.New(), fail: true}
	p := NewProvisioner(surface)
	identity := &principal.Principal{Provisioning: principal.Provisioning{Subject: "human", ExternalOrganizationID: "org"}}
	require.Error(t, p.Check(t.Context(), identity))
	surface.fail = false
	require.NoError(t, p.Check(t.Context(), identity))
	require.Equal(t, 2, surface.calls)
	require.Equal(t, surface.userID, identity.UserID)
	// A warm cache resolves identity only; it must not repeat the grant operation.
	identity.UserID, identity.OrganizationID = uuid.Nil, uuid.Nil
	require.NoError(t, p.Check(t.Context(), identity))
	require.Equal(t, 2, surface.calls)
	require.Equal(t, surface.organizationID, identity.OrganizationID)
}
