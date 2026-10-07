package keys_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func TestNormalizeOrigins(t *testing.T) {
	got, err := keys.NormalizeOrigins("Op", []string{
		"https://WWW.Example.com", "https://www.example.com/", "http://localhost:5173", "https://shop.example.com:8443",
	})
	require.NoError(t, err)
	require.Equal(t, []string{"https://www.example.com", "http://localhost:5173", "https://shop.example.com:8443"}, got)

	for _, bad := range []string{
		"http://www.example.com",      // plain http off localhost
		"https://www.example.com/app", // a path is not an origin
		"https://www.example.com?x=1",
		"https://user@www.example.com",
		"www.example.com",
		"*",
		"",
	} {
		_, err := keys.NormalizeOrigins("Op", []string{bad})
		require.Error(t, err, bad)
		require.Equal(t, "Op.InvalidOrigin", kaitenerrors.GetCode(err), bad)
	}

	tooMany := make([]string, keys.MaxOrigins+1)
	for i := range tooMany {
		tooMany[i] = "https://example.com"
	}
	_, err = keys.NormalizeOrigins("Op", tooMany)
	require.Equal(t, "Op.TooManyOrigins", kaitenerrors.GetCode(err))
}

func TestValidateLabel(t *testing.T) {
	label, err := keys.ValidateLabel("Op", "  Marketing site ")
	require.NoError(t, err)
	require.Equal(t, "Marketing site", label)

	for _, bad := range []string{"", "   ", strings.Repeat("x", keys.MaxLabelLength+1)} {
		_, err := keys.ValidateLabel("Op", bad)
		require.Equal(t, "Op.InvalidLabel", kaitenerrors.GetCode(err))
	}
}

func TestMint(t *testing.T) {
	plain, digest, hint, err := keys.Mint()
	require.NoError(t, err)
	require.True(t, strings.HasPrefix(plain, token.PrefixPublishableKey))
	require.Len(t, plain, len(token.PrefixPublishableKey)+43)
	require.Equal(t, token.LookupHash(plain), digest)
	require.Equal(t, plain[len(plain)-4:], hint)

	other, _, _, err := keys.Mint()
	require.NoError(t, err)
	require.NotEqual(t, plain, other)
}
