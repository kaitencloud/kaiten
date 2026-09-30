package customers_test

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	outboxdb "github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/getcustomer"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestDeleteCustomer(t *testing.T) {
	t.Run("WhenCustomerExists_DeletesCustomer", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		customers := createCustomers(t, 1)
		toDelete := customers[0]

		// Act
		req := httptest.NewRequest("DELETE", "/api/customers/"+toDelete.Slug, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		repo := getcustomer.NewQueryRepository(db.New(testServer.Dependencies.DB))
		_, err = repo.GetCustomerBySlug(t.Context(), toDelete.Slug, testDb.DefaultData.OrganizationID)
		require.Error(t, err)

		// Verify outbox event was created
		outboxEvents := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, outboxEvents, "Expected at least one outbox event")

		// Find the customer deleted event
		var customerDeletedEvent *outboxdb.OutboxEvent
		for _, event := range outboxEvents {
			if event.EventName == events.CustomerDeleted.Name {
				customerDeletedEvent = &event
				break
			}
		}
		require.NotNil(t, customerDeletedEvent, "Expected CUSTOMER_DELETION event to be present")
		assert.Equal(t, events.CustomerDeleted.Type, customerDeletedEvent.EventType)

		// Verify event data contains the deleted customer information
		var eventData schema.Customer
		err = json.Unmarshal(customerDeletedEvent.Data, &eventData)
		require.NoError(t, err)
		assert.Equal(t, toDelete.ID, eventData.ID)
	})

	t.Run("WhenCustomerDoesNotExist_Returns404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		req := httptest.NewRequest("DELETE", "/api/customers/nonexistent-slug", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})
}
