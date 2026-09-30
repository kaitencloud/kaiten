package customers_test

import (
	"encoding/json"
	"io"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	outboxdb "github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/getcustomer"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	organizationdb "github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestCreateCustomer(t *testing.T) {
	resetDB := func() {
		require.NoError(t, testDb.Reset())
	}

	t.Run("WhenRequestIsValidWithoutExternalID_CreatesCustomer", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)
		payload := schema.Customer{
			Name: "Awesome customer",
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/customers", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		created := commonfixture.AssertJSONResponse[schema.Customer](t, resp, fiber.StatusCreated)
		require.Equal(t, payload.Name, created.Name)
		repo := getcustomer.NewQueryRepository(db.New(testServer.Dependencies.DB))
		stored, err := repo.GetCustomerBySlug(t.Context(), created.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, created.Name, stored.Name)
	})

	t.Run("WhenRequestIsValidWithExternalID_CreatesCustomer", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)
		payload := schema.Customer{
			Name:               "Awesome customer",
			ExternalCustomerID: ptr.To("external-customer-id-123"),
			Domain:             ptr.To("awesome.example"),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/customers", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		created := commonfixture.AssertJSONResponse[schema.Customer](t, resp, fiber.StatusCreated)
		require.Equal(t, payload.Name, created.Name)
		require.Equal(t, *payload.ExternalCustomerID, *created.ExternalCustomerID)
		require.Equal(t, *payload.Domain, *created.Domain)

		// Verify outbox event was created
		outboxEvents := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, outboxEvents, "Expected at least one outbox event")

		// Find the customer created event
		var customerCreatedEvent *outboxdb.OutboxEvent
		for _, event := range outboxEvents {
			if event.EventName == events.CustomerCreated.Name {
				customerCreatedEvent = &event
				break
			}
		}
		require.NotNil(t, customerCreatedEvent, "Expected CUSTOMER_CREATION event to be present")
		assert.Equal(t, events.CustomerCreated.Type, customerCreatedEvent.EventType)

		// Verify event data contains the created customer with external ID
		var eventData schema.Customer
		err = json.Unmarshal(customerCreatedEvent.Data, &eventData)
		require.NoError(t, err)
		assert.Equal(t, created.ID, eventData.ID)
		assert.Equal(t, created.Name, eventData.Name)
		assert.Equal(t, *created.ExternalCustomerID, *eventData.ExternalCustomerID)
		assert.Equal(t, *created.Domain, *eventData.Domain)
	})

	t.Run("WhenCurrentUserDoesNotBelongToOrganization_Returns403", func(t *testing.T) {
		t.Cleanup(resetDB)

		_, err := organizationdb.New(testServer.Dependencies.DB).DeleteUserOnOrganization(t.Context(), organizationdb.DeleteUserOnOrganizationParams{
			UserID:         testDb.DefaultData.UserID,
			OrganizationID: testDb.DefaultData.OrganizationID,
		})
		require.NoError(t, err)

		req := commonfixture.NewJSONRequest(t, "POST", "/api/customers", schema.Customer{
			Name: "Forbidden customer",
		})

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		bodyBytes, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		bodyString := string(bodyBytes)

		require.Equal(t, fiber.StatusForbidden, resp.StatusCode)
		require.Contains(t, bodyString, "CurrentUser.NotInOrganization")
		require.Contains(t, bodyString, testDb.DefaultData.UserID.String())
		require.Contains(t, bodyString, testDb.DefaultData.OrganizationID.String())
		require.NotContains(t, bodyString, "no rows in result set")
	})
}
