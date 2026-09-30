package graphql_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/createcustomer"
	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
)

// newCustomerWithExternalID creates a customer carrying the host's own tenant id.
func newCustomerWithExternalID(t *testing.T, name, externalID string) *customerschema.Customer {
	t.Helper()

	repo := createcustomer.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	customer, err := repo.CreateCustomer(
		t.Context(),
		name,
		slugutil.Generate(name),
		&externalID,
		nil,
		testDb.DefaultData.OrganizationID,
		testDb.DefaultData.UserID,
	)
	require.NoError(t, err)

	return customer
}

// An embedded client knows its own tenant id, not Kaiten's slug. Resolving by
// external id is what lets it ask for "my" customer without a lookup round-trip.
func TestGraphQL_Customer_ByExternalCustomerID(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	created := newCustomerWithExternalID(t, "External Id Co", "tenant-abc-123")

	resp := executeGraphQL(t, `
		query($externalCustomerId: String!) {
			customer(externalCustomerId: $externalCustomerId) {
				slug
				externalCustomerId
			}
		}
	`, map[string]any{"externalCustomerId": "tenant-abc-123"})

	require.Empty(t, resp.Errors)
	var data struct {
		Customer struct {
			Slug               string `json:"slug"`
			ExternalCustomerID string `json:"externalCustomerId"`
		} `json:"customer"`
	}
	require.NoError(t, json.Unmarshal(resp.Data, &data))
	assert.Equal(t, created.Slug, data.Customer.Slug)
	assert.Equal(t, "tenant-abc-123", data.Customer.ExternalCustomerID)
}

func TestGraphQL_Customer_ByExternalCustomerID_NotFound(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	resp := executeGraphQL(t, `
		query($externalCustomerId: String!) {
			customer(externalCustomerId: $externalCustomerId) { slug }
		}
	`, map[string]any{"externalCustomerId": "no-such-tenant"})

	require.Empty(t, resp.Errors)
	var data struct {
		Customer *struct {
			Slug string `json:"slug"`
		} `json:"customer"`
	}
	require.NoError(t, json.Unmarshal(resp.Data, &data))
	assert.Nil(t, data.Customer)
}

// external_customer_id carries no uniqueness constraint, so a duplicated value
// must be reported rather than resolved to an arbitrary row — silently picking
// one would hand a tenant another tenant's licensing.
func TestGraphQL_Customer_ByExternalCustomerID_Ambiguous(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	newCustomerWithExternalID(t, "Ambiguous One", "shared-tenant")
	newCustomerWithExternalID(t, "Ambiguous Two", "shared-tenant")

	resp := executeGraphQL(t, `
		query($externalCustomerId: String!) {
			customer(externalCustomerId: $externalCustomerId) { slug }
		}
	`, map[string]any{"externalCustomerId": "shared-tenant"})

	require.NotEmpty(t, resp.Errors)
	assert.Contains(t, resp.Errors[0].Message, "external customer ID")
}

// Slug still wins when both are supplied, matching the documented order.
func TestGraphQL_Customer_SlugTakesPrecedenceOverExternalID(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	bySlug := newCustomerWithExternalID(t, "Precedence Slug", "precedence-external")
	newCustomerWithExternalID(t, "Precedence Other", "other-external")

	resp := executeGraphQL(t, `
		query($slug: String!, $externalCustomerId: String!) {
			customer(slug: $slug, externalCustomerId: $externalCustomerId) { slug }
		}
	`, map[string]any{"slug": bySlug.Slug, "externalCustomerId": "other-external"})

	require.Empty(t, resp.Errors)
	var data struct {
		Customer struct {
			Slug string `json:"slug"`
		} `json:"customer"`
	}
	require.NoError(t, json.Unmarshal(resp.Data, &data))
	assert.Equal(t, bySlug.Slug, data.Customer.Slug)
}
