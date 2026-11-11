package updateaddonfamily

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestOnlyMakePrivateKeepsBillingTerms(t *testing.T) {
	private, public := false, true
	terms, changedTerms := "TRUE_UP", "NEXT_BOUNDARY"
	require.True(t, onlyMakePrivate(true, terms, Command{IsPublic: &private}))
	require.True(t, onlyMakePrivate(true, terms, Command{IsPublic: &private, IncreaseBilling: &terms}))
	require.False(t, onlyMakePrivate(true, terms, Command{IsPublic: &private, IncreaseBilling: &changedTerms}))
	require.False(t, onlyMakePrivate(true, terms, Command{IsPublic: &public}))
	require.False(t, onlyMakePrivate(true, terms, Command{}))
	require.False(t, onlyMakePrivate(false, terms, Command{IsPublic: &private}))
}
