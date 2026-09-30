package graphql

import (
	"context"
	"math"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/vektah/gqlparser/v2/ast"

	instancesGraphql "github.com/kaitencloud/kaiten/api/internal/modules/instances/graphql"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// TestEveryListFieldIsChargedForItsFanOut is the membership rule of
// complexity.go, enforced against the schema rather than against a list
// someone has to remember to update.
//
// A field that can answer with more than one row -- a list, or one of the page
// envelopes wrapping one -- must carry a complexity function. A field that
// does not gets gqlgen's flat structural point instead, which is exactly the
// hole the cost model closes: one un-charged nested list is enough to reopen
// the instance -> license -> instances cycle through it.
//
// The single exemption is a page's own `items`. Its row count was already
// charged on the parent field that took the `limit`, and charging it twice
// would price the paginated shape above the unbounded one it replaces.
func TestEveryListFieldIsChargedForItsFanOut(t *testing.T) {
	t.Parallel()

	es := newExecutableSchema(nil, Config{})
	schema := es.Schema()

	for _, def := range schema.Types {
		if def.Kind != ast.Object || strings.HasPrefix(def.Name, "__") {
			continue
		}

		for _, field := range def.Fields {
			if !answersWithManyRows(schema, def, field) {
				continue
			}

			t.Run(def.Name+"."+field.Name, func(t *testing.T) {
				t.Parallel()

				cost, charged := es.Complexity(
					context.Background(), def.Name, field.Name, 1, probeArgs(schema, field),
				)

				require.True(t, charged,
					"a field that can answer with many rows must be charged for them -- add it to newComplexityRoot")
				require.Greater(t, cost, 1,
					"a multiplier that does not multiply is the structural default under another name")
			})
		}
	}
}

// TestPageSizeChargesWhatWasAskedFor pins that the cost model reads a `limit`
// the way the resolvers clamp it -- and that it stays monotonic past the int32
// boundary, which is the reason it does not simply call pagination.ClampLimit.
func TestPageSizeChargesWhatWasAskedFor(t *testing.T) {
	t.Parallel()

	limit := func(v int) *int { return &v }

	require.Equal(t, int(pagination.DefaultLimit), pageSize(nil), "an absent limit is the default page")
	require.Equal(t, int(pagination.DefaultLimit), pageSize(limit(0)))
	require.Equal(t, int(pagination.DefaultLimit), pageSize(limit(-1)))
	require.Equal(t, 7, pageSize(limit(7)), "ask for less, pay less")
	require.Equal(t, int(pagination.MaxLimit), pageSize(limit(10_000)))

	// 2^32 + 1 truncates to 1 as an int32. Clamping before any narrowing is
	// what stops a caller from being charged for one row while asking for
	// four billion.
	require.Equal(t, int(pagination.MaxLimit), pageSize(limit(math.MaxUint32+2)))
}

// TestOrganizationAuditTrailsIsChargedForThePageItServes pins the one root
// list whose resolver pages wider than pagination's bounds. It asks the schema
// rather than organizationAuditTrailPageSize, so it pins which page function
// the field is wired to as well as what that function returns.
func TestOrganizationAuditTrailsIsChargedForThePageItServes(t *testing.T) {
	t.Parallel()

	es := newExecutableSchema(nil, Config{})
	rows := func(args map[string]any) int {
		t.Helper()

		cost, charged := es.Complexity(context.Background(), "Query", "organizationAuditTrails", 1, args)
		require.True(t, charged)

		return cost
	}

	require.Equal(t, int(instancesGraphql.OrganizationAuditTrailDefaultLimit), rows(map[string]any{}),
		"an absent limit is the feed's default page, not pagination's")
	require.Equal(t, 500, rows(map[string]any{"limit": 500}),
		"a page pagination would cap, and this feed serves whole")
	require.Equal(t, int(instancesGraphql.OrganizationAuditTrailMaxLimit), rows(map[string]any{"limit": 10_000}))
	require.Equal(t, int(instancesGraphql.OrganizationAuditTrailMaxLimit), rows(map[string]any{"limit": math.MaxUint32 + 2}))
}

// TestFanOutSaturatesInsteadOfWrapping guards a failure mode that looks like
// nothing and disables the whole file: gqlgen honours a custom complexity only
// when it comes back >= 1, so a multiplication that overflows to a negative
// number is silently replaced by the cheap structural default it was meant to
// override.
func TestFanOutSaturatesInsteadOfWrapping(t *testing.T) {
	t.Parallel()

	require.Equal(t, 500, fanOut(50, 10))

	require.Equal(t, maxComplexity, fanOut(assumedFanout, math.MaxInt/2))
	require.Equal(t, maxComplexity, fanOut(math.MaxInt, math.MaxInt))
	require.Positive(t, fanOut(math.MaxInt, math.MaxInt), "a saturated cost must still be honoured by gqlgen")

	// A list of scalars descends into nothing, so gqlgen hands us a zero
	// child cost. It still costs a point per row to produce.
	require.Equal(t, assumedFanout, fanOut(assumedFanout, 0))
}

// answersWithManyRows reports whether a field can return more than one row:
// either its type is a list, or it is one of the page envelopes wrapping one.
// A page's own `items` is excluded -- see the doc comment above.
func answersWithManyRows(schema *ast.Schema, owner *ast.Definition, field *ast.FieldDefinition) bool {
	if field.Name == "items" && isPageEnvelope(schema.Types[owner.Name]) {
		return false
	}
	if field.Type.Elem != nil {
		return true
	}

	return isPageEnvelope(schema.Types[field.Type.Name()])
}

// isPageEnvelope recognizes a page by its shape rather than by its name, so a
// future envelope that does not end in "Page" is still covered.
func isPageEnvelope(def *ast.Definition) bool {
	if def == nil || def.Kind != ast.Object {
		return false
	}
	items := def.Fields.ForName("items")

	return items != nil && items.Type.Elem != nil
}

// probeArgs supplies the arguments a field cannot be asked about without:
// gqlgen unmarshals the raw argument map before it consults the complexity
// function, and reports "not charged" if a required one is missing. Optional
// arguments are left out on purpose -- absent is the case worth measuring.
func probeArgs(schema *ast.Schema, field *ast.FieldDefinition) map[string]any {
	args := map[string]any{}
	for _, arg := range field.Arguments {
		if !arg.Type.NonNull || arg.DefaultValue != nil {
			continue
		}
		args[arg.Name] = probeValue(schema, arg.Type)
	}

	return args
}

func probeValue(schema *ast.Schema, t *ast.Type) any {
	if def := schema.Types[t.Name()]; def != nil && def.Kind == ast.Enum && len(def.EnumValues) > 0 {
		return def.EnumValues[0].Name
	}

	switch t.Name() {
	case "Int":
		return 1
	case "Boolean":
		return true
	default:
		return "probe"
	}
}
