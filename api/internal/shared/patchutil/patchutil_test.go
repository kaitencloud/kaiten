package patchutil

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResolveOptional_NilPatchKeepsCurrent(t *testing.T) {
	t.Run("string", func(t *testing.T) {
		assert.Equal(t, "current", ResolveOptional("current", (*string)(nil)))
	})

	t.Run("zero value current", func(t *testing.T) {
		// A zero-value current (e.g. an unset uuid.UUID or an empty string) must
		// still be returned as-is when no patch was supplied -- ResolveOptional
		// must not treat the *current* value's zeroness as meaningful, only the
		// patch pointer's nilness.
		assert.Equal(t, uuid.Nil, ResolveOptional(uuid.Nil, (*uuid.UUID)(nil)))
		assert.Equal(t, "", ResolveOptional("", (*string)(nil)))
	})

	t.Run("time.Time", func(t *testing.T) {
		current := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
		assert.True(t, current.Equal(ResolveOptional(current, (*time.Time)(nil))))
	})
}

func TestResolveOptional_NonNilPatchOverrides(t *testing.T) {
	t.Run("string", func(t *testing.T) {
		patch := "patched"
		assert.Equal(t, "patched", ResolveOptional("current", &patch))
	})

	t.Run("overrides with zero value", func(t *testing.T) {
		// A patch explicitly carrying the zero value (e.g. licenseID ==
		// uuid.Nil, or an empty string) must still win over current -- the
		// provided/not-provided signal is the pointer's nilness, never the
		// pointee's zeroness. Callers relying on "empty means clear" (e.g.
		// upsertintegration's normalizeOptionalField) normalize *before*
		// calling ResolveOptional and gate on the original pointer.
		zero := uuid.UUID{}
		nonZeroCurrent := uuid.New()
		assert.Equal(t, zero, ResolveOptional(nonZeroCurrent, &zero))

		emptyStr := ""
		assert.Equal(t, "", ResolveOptional("current", &emptyStr))
	})

	t.Run("uuid.UUID", func(t *testing.T) {
		current := uuid.New()
		patch := uuid.New()
		require.NotEqual(t, current, patch)
		assert.Equal(t, patch, ResolveOptional(current, &patch))
	})

	t.Run("time.Time", func(t *testing.T) {
		current := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
		patch := time.Date(2025, 6, 15, 12, 0, 0, 0, time.UTC)
		got := ResolveOptional(current, &patch)
		assert.True(t, patch.Equal(got))
	})

	t.Run("int", func(t *testing.T) {
		assert.Equal(t, 42, ResolveOptional(7, ptrTo(42)))
	})
}

func TestResolveOptionalPointer(t *testing.T) {
	t.Run("nil current and nil patch stay nil", func(t *testing.T) {
		var current, patch *uuid.UUID
		assert.Nil(t, ResolveOptionalPointer(current, patch))
	})

	t.Run("nil patch keeps current pointer, including its identity", func(t *testing.T) {
		id := uuid.New()
		current := &id
		var patch *uuid.UUID

		got := ResolveOptionalPointer(current, patch)
		require.NotNil(t, got)
		assert.Same(t, current, got, "not-provided must return the exact current pointer, not a copy")
	})

	t.Run("non-nil patch wins over nil current", func(t *testing.T) {
		var current *uuid.UUID
		id := uuid.New()
		patch := &id

		got := ResolveOptionalPointer(current, patch)
		assert.Same(t, patch, got)
	})

	t.Run("non-nil patch wins over non-nil current, even to a different value", func(t *testing.T) {
		currentID := uuid.New()
		current := &currentID
		patchID := uuid.New()
		patch := &patchID

		got := ResolveOptionalPointer(current, patch)
		assert.Same(t, patch, got)
		assert.Equal(t, patchID, *got)
	})

	t.Run("string", func(t *testing.T) {
		currentDomain := "current.example.com"
		patchDomain := "patched.example.com"
		got := ResolveOptionalPointer(&currentDomain, &patchDomain)
		require.NotNil(t, got)
		assert.Equal(t, patchDomain, *got)
	})
}

func TestPointersEqual(t *testing.T) {
	t.Run("both nil", func(t *testing.T) {
		var a, b *string
		assert.True(t, PointersEqual(a, b))
	})

	t.Run("one nil, other non-nil", func(t *testing.T) {
		var a *string
		v := "x"
		b := &v
		assert.False(t, PointersEqual(a, b))
		assert.False(t, PointersEqual(b, a), "must be symmetric regardless of argument order")
	})

	t.Run("non-nil, equal values, distinct pointers", func(t *testing.T) {
		av := "same"
		bv := "same"
		a, b := &av, &bv
		require.NotSame(t, a, b, "test setup must use distinct pointers")
		assert.True(t, PointersEqual(a, b), "value equality, not pointer identity")
	})

	t.Run("non-nil, different values", func(t *testing.T) {
		av := "one"
		bv := "two"
		assert.False(t, PointersEqual(&av, &bv))
	})

	t.Run("uuid.UUID", func(t *testing.T) {
		id := uuid.New()
		a := id
		b := id
		assert.True(t, PointersEqual(&a, &b))

		other := uuid.New()
		assert.False(t, PointersEqual(&a, &other))
	})

	t.Run("same pointer", func(t *testing.T) {
		v := "x"
		p := &v
		assert.True(t, PointersEqual(p, p))
	})
}

func TestChanged(t *testing.T) {
	t.Run("equal strings not changed", func(t *testing.T) {
		assert.False(t, Changed("same", "same"))
	})

	t.Run("different strings changed", func(t *testing.T) {
		assert.True(t, Changed("before", "after"))
	})

	t.Run("equal zero values not changed", func(t *testing.T) {
		assert.False(t, Changed("", ""))
		assert.False(t, Changed(uuid.Nil, uuid.Nil))
		assert.False(t, Changed(0, 0))
	})

	t.Run("uuid.UUID", func(t *testing.T) {
		id := uuid.New()
		assert.False(t, Changed(id, id))
		assert.True(t, Changed(id, uuid.New()))
	})

	t.Run("bool", func(t *testing.T) {
		assert.True(t, Changed(true, false))
		assert.False(t, Changed(true, true))
	})
}

func ptrTo[T any](v T) *T { return &v }
