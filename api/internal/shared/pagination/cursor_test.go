package pagination_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

func TestEncode_Decode_RoundTrips(t *testing.T) {
	fixedTime := time.Date(2026, time.January, 15, 10, 30, 0, 0, time.UTC)
	fixedID := uuid.MustParse("11111111-1111-1111-1111-111111111111")

	t.Run("CreatedAtCursor", func(t *testing.T) {
		want := pagination.CreatedAtCursor{CreatedAt: fixedTime, ID: fixedID}

		token, err := pagination.Encode(want)
		require.NoError(t, err)
		require.NotEmpty(t, token)

		got, err := pagination.Decode[pagination.CreatedAtCursor](token)
		require.NoError(t, err)
		require.True(t, want.CreatedAt.Equal(got.CreatedAt))
		require.Equal(t, want.ID, got.ID)
	})

	t.Run("IDCursor", func(t *testing.T) {
		want := pagination.IDCursor{ID: fixedID}

		token, err := pagination.Encode(want)
		require.NoError(t, err)

		got, err := pagination.Decode[pagination.IDCursor](token)
		require.NoError(t, err)
		require.Equal(t, want, got)
	})

	t.Run("endpoint-local struct", func(t *testing.T) {
		type metadataFieldCursor struct {
			DisplayOrder int32     `json:"displayOrder"`
			CreatedAt    time.Time `json:"createdAt"`
			ID           uuid.UUID `json:"id"`
		}
		want := metadataFieldCursor{DisplayOrder: 3, CreatedAt: fixedTime, ID: fixedID}

		token, err := pagination.Encode(want)
		require.NoError(t, err)

		got, err := pagination.Decode[metadataFieldCursor](token)
		require.NoError(t, err)
		require.Equal(t, want.DisplayOrder, got.DisplayOrder)
		require.True(t, want.CreatedAt.Equal(got.CreatedAt))
		require.Equal(t, want.ID, got.ID)
	})
}

func TestEncode_ProducesURLSafeUnpaddedToken(t *testing.T) {
	token, err := pagination.Encode(pagination.IDCursor{ID: uuid.New()})
	require.NoError(t, err)

	require.NotContains(t, token, "+")
	require.NotContains(t, token, "/")
	require.NotContains(t, token, "=")
}

func TestEncode_UnmarshalableKey_ReturnsError(t *testing.T) {
	type unmarshalable struct {
		C chan int
	}

	_, err := pagination.Encode(unmarshalable{C: make(chan int)})

	require.Error(t, err)
}

func TestDecode_InvalidBase64_ReturnsErrInvalidCursor(t *testing.T) {
	_, err := pagination.Decode[pagination.IDCursor]("not valid base64!!!")

	require.ErrorIs(t, err, pagination.ErrInvalidCursor)
}

func TestDecode_InvalidJSON_ReturnsErrInvalidCursor(t *testing.T) {
	// Valid base64 (unpadded, URL-safe), but the decoded bytes aren't JSON.
	_, err := pagination.Decode[pagination.IDCursor]("bm90LWpzb24")

	require.ErrorIs(t, err, pagination.ErrInvalidCursor)
}

func TestDecode_WrongShape_ReturnsErrInvalidCursor(t *testing.T) {
	// A validly-encoded cursor for one type isn't necessarily unmarshalable
	// into an incompatible type -- encode a bare string, which cannot
	// unmarshal into a struct target at all.
	token, err := pagination.Encode("just-a-string")
	require.NoError(t, err)

	_, err = pagination.Decode[pagination.IDCursor](token)

	require.ErrorIs(t, err, pagination.ErrInvalidCursor)
}

func TestDecode_EmptyToken_ReturnsErrInvalidCursor(t *testing.T) {
	_, err := pagination.Decode[pagination.IDCursor]("")

	require.ErrorIs(t, err, pagination.ErrInvalidCursor)
}
