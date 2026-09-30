package graphql_test

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestGraphQL_MalformedCursorIsTypedValidationError covers every paginated
// GraphQL query but metadataFields, which types the same error and pins it
// in TestGraphQL_QueryMetadataFields/WhenCursorIsMalformed... alongside the
// rest of that query's pagination.
//
// A cursor is opaque, so a client can only ever send back one we minted --
// or garbage. Garbage must read as bad input, not as a server fault: each
// resolver types it so presentError keeps the message instead of
// withholding a client's own mistake behind a correlation id, under the
// same code the REST twin already reports, so the two surfaces describe the
// same mistake identically.
//
// The decode fails before any row is read, so no fixture is needed -- and
// none of these queries reaches the database at all.
func TestGraphQL_MalformedCursorIsTypedValidationError(t *testing.T) {
	tests := []struct {
		surface string
		field   string
		code    string
	}{
		{"components", `components(cursor: $cursor) { hasMore }`, "Components.InvalidCursor"},
		{"customers", `customers(cursor: $cursor) { hasMore }`, "Customers.InvalidCursor"},
		{"instances", `instances(cursor: $cursor) { hasMore }`, "Instances.InvalidCursor"},
		{"licenses", `licenses(cursor: $cursor) { hasMore }`, "Licenses.InvalidCursor"},
		{"entitlements", `entitlements(cursor: $cursor) { hasMore }`, "Entitlements.InvalidCursor"},
		{"deploymentZones", `deploymentZones(cursor: $cursor) { hasMore }`, "DeploymentZones.InvalidCursor"},
		{"releases", `releases(cursor: $cursor) { hasMore }`, "Releases.InvalidCursor"},
		// Both audit trail feeds share one decoder, and so one code: the
		// org-wide feed has no REST twin of its own, and walks the same
		// keyset over the same rows as the instance-scoped one.
		{"auditTrails", `auditTrails(instanceSlug: "any-instance", cursor: $cursor) { hasMore }`, "AuditTrails.InvalidCursor"},
		{"organizationAuditTrails", `organizationAuditTrails(cursor: $cursor) { hasMore }`, "AuditTrails.InvalidCursor"},
	}

	for _, tt := range tests {
		t.Run(tt.surface, func(t *testing.T) {
			query := fmt.Sprintf("query($cursor: String) {\n\t%s\n}", tt.field)

			resp := executeGraphQL(t, query, map[string]any{"cursor": "not-a-real-cursor"})

			require.Len(t, resp.Errors, 1)
			assert.Equal(t, "invalid cursor", resp.Errors[0].Message)
			assert.Equal(t, tt.code, resp.Errors[0].Extensions["code"])
		})
	}
}
