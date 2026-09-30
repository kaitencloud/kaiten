package customers_test

import (
	"encoding/json"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	outboxdb "github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/getcustomer"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestUpdateCustomer(t *testing.T) {
	t.Run("WhenRequestIsValid_UpdatesCustomer", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		customers := createCustomers(t, 1)
		toUpdate := customers[0]
		payload := schema.Customer{
			Name:               "Updated customer",
			ExternalCustomerID: ptr.To("external-id-123"),
			Domain:             ptr.To("updated.example"),
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/customers/"+toUpdate.Slug, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		repo := getcustomer.NewQueryRepository(db.New(testServer.Dependencies.DB))
		updated, err := repo.GetCustomerBySlug(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, payload.Name, updated.Name)
		require.NotNil(t, updated.ExternalCustomerID)
		require.Equal(t, *payload.ExternalCustomerID, *updated.ExternalCustomerID)
		require.Equal(t, *payload.Domain, *updated.Domain)

		// Verify outbox event was created
		outboxEvents := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, outboxEvents, "Expected at least one outbox event")

		// Find the customer updated event
		var customerUpdatedEvent *outboxdb.OutboxEvent
		for _, event := range outboxEvents {
			if event.EventName == events.CustomerUpdated.Name {
				customerUpdatedEvent = &event
				break
			}
		}
		require.NotNil(t, customerUpdatedEvent, "Expected CUSTOMER_UPDATE event to be present")
		assert.Equal(t, events.CustomerUpdated.Type, customerUpdatedEvent.EventType)

		// Verify event data contains the updated customer
		var eventData schema.Customer
		err = json.Unmarshal(customerUpdatedEvent.Data, &eventData)
		require.NoError(t, err)
		assert.Equal(t, toUpdate.ID, eventData.ID)
		assert.Equal(t, payload.Name, eventData.Name)
		assert.Equal(t, *payload.ExternalCustomerID, *eventData.ExternalCustomerID)
		assert.Equal(t, *payload.Domain, *eventData.Domain)
	})

	t.Run("WhenAnotherOrganizationOwnsTheSameSlug_LeavesItByteIdentical", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		const sharedSlug = "acme"
		mine := createCustomerIn(t, testDb.DefaultData.OrganizationID, "My Acme", sharedSlug)
		neighbourOrganizationID := createNeighbourOrganization(t)
		neighbour := createCustomerIn(t, neighbourOrganizationID, "Neighbour Acme", sharedSlug)

		const snapshotQuery = `SELECT to_jsonb(c) FROM customer c WHERE id = $1`
		before := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, snapshotQuery, neighbour.ID)

		payload := schema.Customer{
			Name:               "Updated customer",
			ExternalCustomerID: ptr.To("external-id-123"),
			Domain:             ptr.To("updated.example"),
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/customers/"+sharedSlug, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		repo := getcustomer.NewQueryRepository(db.New(testServer.Dependencies.DB))
		updated, err := repo.GetCustomerBySlug(t.Context(), sharedSlug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, mine.ID, updated.ID)
		require.Equal(t, payload.Name, updated.Name)

		after := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, snapshotQuery, neighbour.ID)
		require.Equal(t, before, after, "the neighbouring organization's customer must be untouched")
	})

	t.Run("WhenCustomerDoesNotExist_Returns404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Customer{
			Name:               "Updated customer",
			ExternalCustomerID: ptr.To("external-id-123"),
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/customers/nonexistent-slug", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})
}
