package pagination_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

func TestClampLimit(t *testing.T) {
	tests := []struct {
		name  string
		limit int32
		want  int32
	}{
		{name: "zero becomes default", limit: 0, want: pagination.DefaultLimit},
		{name: "negative becomes default", limit: -5, want: pagination.DefaultLimit},
		{name: "within range is unchanged", limit: 10, want: 10},
		{name: "exactly max is unchanged", limit: pagination.MaxLimit, want: pagination.MaxLimit},
		{name: "above max is capped", limit: pagination.MaxLimit + 1, want: pagination.MaxLimit},
		{name: "far above max is capped", limit: 100_000, want: pagination.MaxLimit},
		{name: "exactly one is unchanged", limit: 1, want: 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, pagination.ClampLimit(tt.limit))
		})
	}
}

func TestTrim(t *testing.T) {
	t.Run("fewer rows than limit", func(t *testing.T) {
		items, hasMore := pagination.Trim([]int{1, 2, 3}, 5)

		require.Equal(t, []int{1, 2, 3}, items)
		require.False(t, hasMore)
	})

	t.Run("exactly limit rows", func(t *testing.T) {
		items, hasMore := pagination.Trim([]int{1, 2, 3}, 3)

		require.Equal(t, []int{1, 2, 3}, items)
		require.False(t, hasMore)
	})

	t.Run("limit-plus-one rows trims to limit and reports more", func(t *testing.T) {
		items, hasMore := pagination.Trim([]int{1, 2, 3}, 2)

		require.Equal(t, []int{1, 2}, items)
		require.True(t, hasMore)
	})

	t.Run("nil rows returns non-nil empty items", func(t *testing.T) {
		items, hasMore := pagination.Trim[int](nil, 5)

		require.NotNil(t, items)
		require.Empty(t, items)
		require.False(t, hasMore)
	})

	t.Run("zero limit with rows present reports more", func(t *testing.T) {
		items, hasMore := pagination.Trim([]int{1}, 0)

		require.Empty(t, items)
		require.True(t, hasMore)
	})

	t.Run("negative limit is treated as zero", func(t *testing.T) {
		items, hasMore := pagination.Trim([]int{1}, -1)

		require.Empty(t, items)
		require.True(t, hasMore)
	})
}

type fakeRow struct {
	ID uuid.UUID
}

func TestBuildPage(t *testing.T) {
	id1 := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	id2 := uuid.MustParse("22222222-2222-2222-2222-222222222222")
	id3 := uuid.MustParse("33333333-3333-3333-3333-333333333333")
	keyOf := func(r fakeRow) pagination.IDCursor { return pagination.IDCursor{ID: r.ID} }

	t.Run("no further page", func(t *testing.T) {
		rows := []fakeRow{{ID: id1}, {ID: id2}}

		page, err := pagination.BuildPage(rows, 2, keyOf)

		require.NoError(t, err)
		require.Equal(t, rows, page.Items)
		require.False(t, page.HasMore)
		require.Nil(t, page.NextCursor)
	})

	t.Run("further page exists", func(t *testing.T) {
		rows := []fakeRow{{ID: id1}, {ID: id2}, {ID: id3}} // limit+1 fetched

		page, err := pagination.BuildPage(rows, 2, keyOf)

		require.NoError(t, err)
		require.Equal(t, []fakeRow{{ID: id1}, {ID: id2}}, page.Items)
		require.True(t, page.HasMore)
		require.NotNil(t, page.NextCursor)

		gotKey, err := pagination.Decode[pagination.IDCursor](*page.NextCursor)
		require.NoError(t, err)
		require.Equal(t, id2, gotKey.ID, "cursor should be derived from the last kept row, not the trimmed lookahead row")
	})

	t.Run("empty result", func(t *testing.T) {
		page, err := pagination.BuildPage([]fakeRow{}, 50, keyOf)

		require.NoError(t, err)
		require.NotNil(t, page.Items)
		require.Empty(t, page.Items)
		require.False(t, page.HasMore)
		require.Nil(t, page.NextCursor)
	})

	t.Run("cursor encoding failure propagates", func(t *testing.T) {
		type unmarshalable struct {
			C chan int
		}
		failingKeyOf := func(fakeRow) unmarshalable { return unmarshalable{C: make(chan int)} }
		rows := []fakeRow{{ID: id1}, {ID: id2}}

		_, err := pagination.BuildPage(rows, 1, failingKeyOf)

		require.Error(t, err)
	})
}
