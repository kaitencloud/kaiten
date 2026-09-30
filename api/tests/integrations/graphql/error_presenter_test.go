package graphql_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// GraphQL had no error presenter at all, so gqlgen's default put
// err.Error() straight into the response — and since GraphQL answers 200,
// nothing downstream flagged it. The JS SDK concatenates those messages
// into an Error, so a driver or parser string ended up in the browser and
// in the customer's telemetry.

// The untyped half of that guarantee used to be exercised here by feeding
// customers(cursor:) a malformed cursor. Every paginated resolver now types
// that error (see TestGraphQL_MalformedCursorIsTypedValidationError), which
// leaves no untyped error a client can provoke through a query -- so the
// withholding branch is pinned on the presenter itself, in
// infrastructure/http/graphql/error_test.go.

// TestGraphQL_TypedResolverErrorKeepsItsMessage is the other half: an error
// the API deliberately reports must survive the presenter, with its code
// attached so a client can act on it.
func TestGraphQL_TypedResolverErrorKeepsItsMessage(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	newCustomerWithExternalID(t, "Presenter One", "presenter-shared")
	newCustomerWithExternalID(t, "Presenter Two", "presenter-shared")

	resp := executeGraphQL(t, `
		query($externalCustomerId: String!) {
			customer(externalCustomerId: $externalCustomerId) { slug }
		}
	`, map[string]any{"externalCustomerId": "presenter-shared"})

	require.NotEmpty(t, resp.Errors)
	assert.Equal(t, "several customers share this external customer ID", resp.Errors[0].Message)
	assert.Equal(t, "Customer.AmbiguousExternalCustomerID", resp.Errors[0].Extensions["code"])
}
