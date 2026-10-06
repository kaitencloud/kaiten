package customers_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func customerCall(t *testing.T, method, path string, payload map[string]any) *http.Response {
	t.Helper()
	req := commonfixture.NewJSONRequest(t, method, path, payload)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
	return resp
}

func readCustomer(t *testing.T, slug string) schema.Customer {
	t.Helper()
	return commonfixture.AssertJSONResponse[schema.Customer](t, customerCall(t, "GET", "/api/customers/"+slug, nil), fiber.StatusOK)
}

func TestCustomerBillingEmail(t *testing.T) {
	t.Run("WhenGiven_ItIsStoredAndRead_ButNeverInAnEvent", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		created := commonfixture.AssertJSONResponse[schema.Customer](t, customerCall(t, "POST", "/api/customers",
			map[string]any{"name": "Acme", "billingEmail": "billing@acme.test"}), fiber.StatusCreated)

		require.Equal(t, "billing@acme.test", *created.BillingEmail)
		require.Equal(t, "billing@acme.test", *readCustomer(t, created.Slug).BillingEmail)

		require.Equal(t, fiber.StatusNoContent, customerCall(t, "PUT", "/api/customers/"+created.Slug,
			map[string]any{"name": "Acme renamed"}).StatusCode)
		require.Equal(t, fiber.StatusNoContent, customerCall(t, "DELETE", "/api/customers/"+created.Slug, nil).StatusCode)

		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, events)
		for _, event := range events {
			require.NotContains(t, string(event.Data), "billing@acme.test", "%s carries the billing email", event.EventName)
			require.NotContains(t, string(event.Data), "billingEmail", "%s carries the billing email key", event.EventName)
		}
	})

	t.Run("WhenOmittedOnUpdate_ItIsKept_AndAnEmptyStringRemovesIt", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		created := commonfixture.AssertJSONResponse[schema.Customer](t, customerCall(t, "POST", "/api/customers",
			map[string]any{"name": "Acme", "billingEmail": "billing@acme.test"}), fiber.StatusCreated)
		path := "/api/customers/" + created.Slug

		require.Equal(t, fiber.StatusNoContent, customerCall(t, "PUT", path, map[string]any{"name": "Acme"}).StatusCode)
		require.Equal(t, "billing@acme.test", *readCustomer(t, created.Slug).BillingEmail)

		require.Equal(t, fiber.StatusNoContent, customerCall(t, "PUT", path,
			map[string]any{"name": "Acme", "billingEmail": "ap@acme.test"}).StatusCode)
		require.Equal(t, "ap@acme.test", *readCustomer(t, created.Slug).BillingEmail)

		require.Equal(t, fiber.StatusNoContent, customerCall(t, "PUT", path,
			map[string]any{"name": "Acme", "billingEmail": ""}).StatusCode)
		require.Nil(t, readCustomer(t, created.Slug).BillingEmail)
	})

	t.Run("WhenInvalid_ItIsRefused", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		for _, email := range []string{"not-an-email", "two@@at.test", "a b@c.test", strings.Repeat("a", 250) + "@b.test"} {
			problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, customerCall(t, "POST", "/api/customers",
				map[string]any{"name": "Acme", "billingEmail": email}), fiber.StatusUnprocessableEntity)
			require.Equal(t, "CreateCustomer.InvalidBillingEmail", problem.Code, email)
		}

		created := commonfixture.AssertJSONResponse[schema.Customer](t, customerCall(t, "POST", "/api/customers",
			map[string]any{"name": "Acme"}), fiber.StatusCreated)
		problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, customerCall(t, "PUT", "/api/customers/"+created.Slug,
			map[string]any{"name": "Acme", "billingEmail": "nope"}), fiber.StatusUnprocessableEntity)
		require.Equal(t, "UpdateCustomer.InvalidBillingEmail", problem.Code)
	})
}
