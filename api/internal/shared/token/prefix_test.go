package token_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/shared/token"
)

// TestPrefixesAreDisjoint is the whole safety argument for the two credential
// families in one assertion: neither prefix is a prefix of the other, so no
// generated body can make one look like the other. An earlier design nested them
// ("ksh_adm_"), which base64url's '_' made ambiguous roughly one token in
// 16 million -- a silent, unreproducible authentication failure.
func TestPrefixesAreDisjoint(t *testing.T) {
	require.NotEqual(t, token.PrefixOrganization, token.PrefixPlatform)
	require.False(t, strings.HasPrefix(token.PrefixPlatform, token.PrefixOrganization))
	require.False(t, strings.HasPrefix(token.PrefixOrganization, token.PrefixPlatform))
	require.Equal(t, len(token.PrefixOrganization), len(token.PrefixPlatform),
		"equal length keeps the gateway's ks[hm]_ character class honest")
}
