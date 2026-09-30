package graphql

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/parser"
	"github.com/vektah/gqlparser/v2/validator"
)

// BenchmarkParserTokenLimit measures uncached parsing AND validation at the
// limit. Nested inline fragments maximize depth without increasing complexity;
// validation is quadratic, so remeasure before raising parserTokenLimit.
func BenchmarkParserTokenLimit(b *testing.B) {
	schema := newExecutableSchema(nil, Config{}).Schema()
	require.Equal(b, parserTokenLimit, queryTokenCount(b, queryAtParserTokenLimit))
	b.ReportAllocs()
	for b.Loop() {
		doc, err := parser.ParseQueryWithTokenLimit(&ast.Source{Input: queryAtParserTokenLimit}, parserTokenLimit)
		if err != nil {
			b.Fatal(err)
		}
		if errs := validator.ValidateWithRules(schema, doc, nil); len(errs) != 0 {
			b.Fatal(errs)
		}
	}
}
