package customers_test

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestGetCustomerByID(t *testing.T) {
	t.Run("WhenCustomerExists_ReturnsCustomer", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		customers := createCustomers(t, 1)
		expected := *customers[0]

		// Act
		req := httptest.NewRequest("GET", "/api/customers/"+customers[0].Slug, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[schema.Customer](t, resp, fiber.StatusOK)
		require.Equal(t, expected, actual)
	})

	t.Run("WhenCustomerDoesNotExist_Returns404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		req := httptest.NewRequest("GET", "/api/customers/nonexistent-slug", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})
}
