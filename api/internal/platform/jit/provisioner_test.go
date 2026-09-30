package jit

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

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
	cache.Put("identity", userID, organizationID)
	entry, ok := cache.Get("identity")
	require.True(t, ok)
	require.Equal(t, userID, entry.userID)
	require.Equal(t, organizationID, entry.organizationID)

	now = now.Add(time.Minute)
	_, ok = cache.Get("identity")
	require.False(t, ok)
	require.Empty(t, cache.entries)
}
