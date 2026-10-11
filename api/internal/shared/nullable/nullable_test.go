package nullable_test

import (
	"encoding/json"
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

// union is a oneOf with no type of its own, as EntitlementValue is.
type union struct{}

func (union) Schema(huma.Registry) *huma.Schema {
	return &huma.Schema{OneOf: []*huma.Schema{{Type: huma.TypeInteger}, {Type: huma.TypeBoolean}}}
}

type withUnion struct {
	Value *union `json:"value"`
}

func (withUnion) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, withUnion{})
}

// A union takes a null branch: a nullable flag on a schema with no type
// publishes type ["", "null"], which client generators refuse.
func TestPointersOfAUnion(t *testing.T) {
	registry := huma.NewMapRegistry("#/components/schemas/", huma.DefaultSchemaNamer)
	registry.Schema(reflect.TypeFor[withUnion](), true, "")
	value := registry.Map()["WithUnion"].Properties["value"]
	require.False(t, value.Nullable)
	require.Empty(t, value.Type)
	require.Len(t, value.OneOf, 3)
	require.Equal(t, "null", value.OneOf[2].Type)
	b, err := json.Marshal(value)
	require.NoError(t, err)
	require.NotContains(t, string(b), `""`)
}
