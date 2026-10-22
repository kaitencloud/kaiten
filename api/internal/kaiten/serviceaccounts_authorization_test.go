package kaiten

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

func TestCreateTokenCannotWidenAuthority(t *testing.T) {
	// Nil use case proves refusal occurs before issuing any credential.
	for _, requested := range []string{"write:*", "read:*", "write:licenses", "delete:users", "read:memberships"} {
		cl := caller.Static(uuid.New(), uuid.New(), []string{"write:tokens", "read:licenses"})
		_, err := (ServiceAccounts{}).CreateToken(t.Context(), cl, "service", "name", nil, []string{requested}, nil)
		require.Error(t, err, requested)
	}
	cl := caller.Static(uuid.New(), uuid.New(), []string{"write:*"})
	_, err := (ServiceAccounts{}).CreateToken(t.Context(), cl, "service", "name", nil, []string{"delete:users"}, nil)
	require.Error(t, err, "wildcard cannot mint platform permissions")
}
