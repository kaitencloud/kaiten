// Package nullable publishes a response shape's absent members as JSON null
// (§13.15: `member|null`): present in every body, and nullable in the
// contract, which Huma does by itself only for pointers to primitives.
package nullable

import (
	"reflect"
	"strings"

	"github.com/danielgtaylor/huma/v2"
)

// Pointers marks, in the schema s of the struct value shape, every pointer
// member without omitempty as nullable: a $ref becomes oneOf [$ref, null], an
// enum lists null, and a type that Huma left non-nullable (uuid.UUID) takes
// null too. Call it from the shape's TransformSchema.
func Pointers(s *huma.Schema, shape any) *huma.Schema {
	t := reflect.TypeOf(shape)
	for i := range t.NumField() {
		field := t.Field(i)
		if field.Type.Kind() != reflect.Pointer || !field.IsExported() {
			continue
		}
		name, options, _ := strings.Cut(field.Tag.Get("json"), ",")
		if name == "-" || strings.Contains(options, "omitempty") {
			continue
		}
		if name == "" {
			name = field.Name
		}
		if property := s.Properties[name]; property != nil {
			s.Properties[name] = member(property)
		}
	}
	return s
}

func member(p *huma.Schema) *huma.Schema {
	// The null branch is {enum: [null]}, which JSON Schema reads as
	// {type: null} does, and which Huma's own validator checks: it knows no
	// null type, and would let such a branch match any value.
	if p.Ref != "" {
		return &huma.Schema{OneOf: []*huma.Schema{{Ref: p.Ref}, onlyNull()}, Description: p.Description}
	}
	p.Nullable = true
	if len(p.Enum) > 0 {
		for _, value := range p.Enum {
			if value == nil {
				return p
			}
		}
		p.Enum = append(p.Enum, nil)
	}
	return p
}

func onlyNull() *huma.Schema { return &huma.Schema{Enum: []any{nil}} }
