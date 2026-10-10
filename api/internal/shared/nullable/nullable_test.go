package nullable_test

import (
	"reflect"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/shared/nullable"
)

type inner struct {
	A int `json:"a"`
}

type shape struct {
	Reason *string `json:"reason" enum:"X,Y"`
	In     *inner  `json:"in"`
	Kept   *string `json:"kept,omitempty"`
}

func (shape) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, shape{})
}

func TestPointers(t *testing.T) {
	registry := huma.NewMapRegistry("#/components/schemas/", huma.DefaultSchemaNamer)
	registry.Schema(reflect.TypeFor[shape](), true, "")
	s := registry.Map()["Shape"]
	validate := func(v map[string]any) []error {
		result := &huma.ValidateResult{}
		huma.Validate(registry, s, huma.NewPathBuffer([]byte{}, 0), huma.ModeReadFromServer, v, result)
		return result.Errors
	}

	require.Empty(t, validate(map[string]any{"reason": nil, "in": nil}), "null members")
	require.Empty(t, validate(map[string]any{"reason": "X", "in": map[string]any{"a": 1}}), "present members")
	require.NotEmpty(t, validate(map[string]any{"reason": "Z", "in": nil}), "an enum still refuses another value")
	require.NotEmpty(t, validate(map[string]any{"reason": nil, "in": map[string]any{"a": "x"}}), "the object is still checked")
	require.NotEmpty(t, validate(map[string]any{"in": nil}), "a member is present, if null")
	require.Contains(t, s.Properties["reason"].Enum, nil)
	require.True(t, s.Properties["reason"].Nullable)
	require.Len(t, s.Properties["in"].OneOf, 2)
	require.False(t, s.Properties["kept"].Nullable, "omitempty members are left alone")
}

// Base is exported, as the embedded shapes are: Huma flattens only those.
type Base struct {
	Reason *string `json:"reason" enum:"X,Y"`
	In     *inner  `json:"in"`
}

type outer struct {
	Base
	Extra *inner `json:"extra"`
}

func (outer) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, outer{})
}

// A shape embedding another marks the embedded members too: Huma flattens
// them into its schema.
func TestPointersOfAnEmbeddingShape(t *testing.T) {
	registry := huma.NewMapRegistry("#/components/schemas/", huma.DefaultSchemaNamer)
	registry.Schema(reflect.TypeFor[outer](), true, "")
	s := registry.Map()["Outer"]
	require.Contains(t, s.Properties["reason"].Enum, nil, "an embedded member")
	require.Len(t, s.Properties["in"].OneOf, 2, "an embedded member")
	require.Len(t, s.Properties["extra"].OneOf, 2, "its own member")
}
