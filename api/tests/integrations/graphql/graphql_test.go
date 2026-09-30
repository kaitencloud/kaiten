package graphql_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	customersdb "github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	instancesdb "github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
)

// GraphQL request/response types
type graphQLRequest struct {
	Query     string                 `json:"query"`
	Variables map[string]interface{} `json:"variables,omitempty"`
}

type graphQLResponse struct {
	Data   json.RawMessage `json:"data"`
	Errors []graphQLError  `json:"errors,omitempty"`
}

type graphQLError struct {
	Message    string         `json:"message"`
	Path       []any          `json:"path,omitempty"`
	Extensions map[string]any `json:"extensions,omitempty"`
}

func executeGraphQL(t *testing.T, query string, variables map[string]interface{}) *graphQLResponse {
	t.Helper()

	reqBody := graphQLRequest{
		Query:     query,
		Variables: variables,
	}

	bodyBytes, err := json.Marshal(reqBody)
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/api/graphql", strings.NewReader(string(bodyBytes)))
	req.Header.Set("Content-Type", "application/json")

	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusOK, resp.StatusCode)

	var gqlResp graphQLResponse
	err = json.NewDecoder(resp.Body).Decode(&gqlResp)
	require.NoError(t, err)

	return &gqlResp
}

func TestGraphQL_Health(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	query := `{ _health }`

	resp := executeGraphQL(t, query, nil)

	require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

	var data struct {
		Health string `json:"_health"`
	}
	err := json.Unmarshal(resp.Data, &data)
	require.NoError(t, err)
	assert.Equal(t, "ok", data.Health)
}

func TestGraphQL_QueryCustomers(t *testing.T) {
	t.Run("WhenOneCustomerExists_ReturnsThatCustomer", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Arrange
		customer := newCustomer(t, "Test Customer")

		query := `{
			customers {
				items {
					id
					name
				}
			}
		}`

		// Act
		resp := executeGraphQL(t, query, nil)

		// Assert
		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		var data struct {
			Customers struct {
				Items []struct {
					ID   string `json:"id"`
					Name string `json:"name"`
				} `json:"items"`
			} `json:"customers"`
		}
		err := json.Unmarshal(resp.Data, &data)
		require.NoError(t, err)

		require.Len(t, data.Customers.Items, 1)
		assert.Equal(t, customer.ID.String(), data.Customers.Items[0].ID)
		assert.Equal(t, customer.Name, data.Customers.Items[0].Name)
	})
}

func TestGraphQL_QueryLicenses(t *testing.T) {
	t.Run("WhenOneLicenseExists_ReturnsThatLicense", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Arrange
		license := newLicense(t, "Test License")

		query := `{
			licenses {
				items {
					id
					name
					type
				}
			}
		}`

		// Act
		resp := executeGraphQL(t, query, nil)

		// Assert
		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		var data struct {
			Licenses struct {
				Items []struct {
					ID   string `json:"id"`
					Name string `json:"name"`
					Type string `json:"type"`
				} `json:"items"`
			} `json:"licenses"`
		}
		err := json.Unmarshal(resp.Data, &data)
		require.NoError(t, err)

		require.Len(t, data.Licenses.Items, 1)
		assert.Equal(t, license.ID.String(), data.Licenses.Items[0].ID)
		assert.Equal(t, license.Name, data.Licenses.Items[0].Name)
		assert.Equal(t, "DEVELOPMENT", data.Licenses.Items[0].Type)
	})
}

func TestGraphQL_QueryInstances(t *testing.T) {
	t.Run("WhenOneInstanceExists_ReturnsThatInstance", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Arrange
		customer := newCustomer(t, "Test Customer")
		license := newLicense(t, "Test License")
		instance := newInstance(t, "Test Instance", customer, license)

		query := `{
			instances {
				items {
					id
					name
					description
					status
					metadata
				}
			}
		}`

		// Act
		resp := executeGraphQL(t, query, nil)

		// Assert
		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		var data struct {
			Instances struct {
				Items []struct {
					ID          string `json:"id"`
					Name        string `json:"name"`
					Description string `json:"description"`
					Status      string `json:"status"`
					Metadata    struct {
						Owner string `json:"owner"`
						Tier  string `json:"tier"`
					} `json:"metadata"`
				} `json:"items"`
			} `json:"instances"`
		}
		err := json.Unmarshal(resp.Data, &data)
		require.NoError(t, err)

		require.Len(t, data.Instances.Items, 1)
		assert.Equal(t, instance.ID.String(), data.Instances.Items[0].ID)
		assert.Equal(t, instance.Name, data.Instances.Items[0].Name)
		assert.Equal(t, instance.Description, data.Instances.Items[0].Description)
		assert.Equal(t, "HEALTHY", data.Instances.Items[0].Status)
		assert.Equal(t, "team-platform", data.Instances.Items[0].Metadata.Owner)
		assert.Equal(t, "gold", data.Instances.Items[0].Metadata.Tier)
	})

	t.Run("WhenInstanceHasDeploymentZone_ReturnsDeploymentZoneSlugAndRelation", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		customer := newCustomer(t, "Deployment Zone Customer")
		license := newLicense(t, "Deployment Zone License")
		deploymentZone := newDeploymentZone(t, "Production EU", "production")
		instance := newInstanceInDeploymentZone(t, "Deployment Zone Instance", customer, license, deploymentZone)

		query := `{
			instances {
				items {
					id
					deploymentZoneId
					deploymentZoneSlug
					deploymentZone {
						id
						name
						slug
						metadata
					}
				}
			}
		}`

		resp := executeGraphQL(t, query, nil)

		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		var data struct {
			Instances struct {
				Items []struct {
					ID                 string `json:"id"`
					DeploymentZoneID   string `json:"deploymentZoneId"`
					DeploymentZoneSlug string `json:"deploymentZoneSlug"`
					DeploymentZone     struct {
						ID       string `json:"id"`
						Name     string `json:"name"`
						Slug     string `json:"slug"`
						Metadata struct {
							Region string `json:"region"`
						} `json:"metadata"`
					} `json:"deploymentZone"`
				} `json:"items"`
			} `json:"instances"`
		}
		err := json.Unmarshal(resp.Data, &data)
		require.NoError(t, err)

		require.Len(t, data.Instances.Items, 1)
		assert.Equal(t, instance.ID.String(), data.Instances.Items[0].ID)
		assert.Equal(t, deploymentZone.ID.String(), data.Instances.Items[0].DeploymentZoneID)
		assert.Equal(t, deploymentZone.Slug, data.Instances.Items[0].DeploymentZoneSlug)
		assert.Equal(t, deploymentZone.ID.String(), data.Instances.Items[0].DeploymentZone.ID)
		assert.Equal(t, deploymentZone.Name, data.Instances.Items[0].DeploymentZone.Name)
		assert.Equal(t, deploymentZone.Slug, data.Instances.Items[0].DeploymentZone.Slug)
		assert.Equal(t, "eu-west-1", data.Instances.Items[0].DeploymentZone.Metadata.Region)
	})
}

func TestGraphQL_QueryEntitiesWithIntegration(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	syncedCustomer := newCustomer(t, "Synced Customer")
	_ = newCustomer(t, "Unsynced Customer")
	license := newLicense(t, "Integration Filter License")
	syncedInstance := newInstance(t, "Synced Instance", syncedCustomer, license)
	_ = newInstance(t, "Unsynced Instance", syncedCustomer, license)

	const adapter = "kaiten.integration.crm.attio"
	customerWebURL := "https://app.attio.com/w/acme/company/attio-customer-1"
	customerLastError := "customer sync failed"
	customerSyncedAt := time.Date(2026, time.June, 5, 10, 0, 0, 0, time.UTC)
	_, err := customersdb.New(testServer.Dependencies.DB).UpsertCustomerIntegration(
		t.Context(),
		customersdb.UpsertCustomerIntegrationParams{
			Adapter:        adapter,
			ExternalID:     "attio-customer-1",
			Metadata:       []byte(`{"source":"customer"}`),
			WebUrl:         &customerWebURL,
			SyncedAt:       pgtype.Timestamptz{Time: customerSyncedAt, Valid: true},
			LastError:      &customerLastError,
			OrganizationID: testDb.DefaultData.OrganizationID,
			CustomerID:     syncedCustomer.ID,
		},
	)
	require.NoError(t, err)
	instanceWebURL := "https://app.attio.com/w/acme/workspace/attio-instance-1"
	instanceLastError := "instance sync failed"
	instanceSyncedAt := time.Date(2026, time.June, 5, 10, 5, 0, 0, time.UTC)
	_, err = instancesdb.New(testServer.Dependencies.DB).UpsertInstanceIntegration(
		t.Context(),
		instancesdb.UpsertInstanceIntegrationParams{
			Adapter:        adapter,
			ExternalID:     "attio-instance-1",
			Metadata:       []byte(`{"source":"instance"}`),
			WebUrl:         &instanceWebURL,
			SyncedAt:       pgtype.Timestamptz{Time: instanceSyncedAt, Valid: true},
			LastError:      &instanceLastError,
			OrganizationID: testDb.DefaultData.OrganizationID,
			InstanceID:     syncedInstance.ID,
		},
	)
	require.NoError(t, err)

	query := `query($adapter: String!) {
		customers(hasIntegration: $adapter) {
			items {
				id
				integrations
			}
		}
		instances(hasIntegration: $adapter) {
			items {
				id
				integrations
			}
		}
	}`
	resp := executeGraphQL(t, query, map[string]interface{}{"adapter": adapter})
	require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

	var data struct {
		Customers struct {
			Items []struct {
				ID           string         `json:"id"`
				Integrations map[string]any `json:"integrations"`
			} `json:"items"`
		} `json:"customers"`
		Instances struct {
			Items []struct {
				ID           string         `json:"id"`
				Integrations map[string]any `json:"integrations"`
			} `json:"items"`
		} `json:"instances"`
	}
	require.NoError(t, json.Unmarshal(resp.Data, &data))
	require.Len(t, data.Customers.Items, 1)
	require.Len(t, data.Instances.Items, 1)
	assert.Equal(t, syncedCustomer.ID.String(), data.Customers.Items[0].ID)
	assert.Equal(t, syncedInstance.ID.String(), data.Instances.Items[0].ID)

	customerIntegration, ok := data.Customers.Items[0].Integrations[adapter].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "attio-customer-1", customerIntegration["external_id"])
	assert.Equal(t, map[string]any{"source": "customer"}, customerIntegration["metadata"])
	assert.Equal(t, customerWebURL, customerIntegration["web_url"])
	assert.Equal(t, customerSyncedAt.Format(time.RFC3339), customerIntegration["synced_at"])
	assert.Equal(t, customerLastError, customerIntegration["last_error"])

	instanceIntegration, ok := data.Instances.Items[0].Integrations[adapter].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "attio-instance-1", instanceIntegration["external_id"])
	assert.Equal(t, map[string]any{"source": "instance"}, instanceIntegration["metadata"])
	assert.Equal(t, instanceWebURL, instanceIntegration["web_url"])
	assert.Equal(t, instanceSyncedAt.Format(time.RFC3339), instanceIntegration["synced_at"])
	assert.Equal(t, instanceLastError, instanceIntegration["last_error"])
}

func TestGraphQL_QueryInstancesWithIntegrationPaginates(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	// Arrange: three instances synced with the adapter and one that is
	// not, so the filter has both something to keep and something to drop.
	customer := newCustomer(t, "Paginated Integration Customer")
	license := newLicense(t, "Paginated Integration License")
	const adapter = "kaiten.integration.crm.attio"

	syncedIDs := make(map[string]struct{}, 3)
	for _, name := range []string{"Synced One", "Synced Two", "Synced Three"} {
		instance := newInstance(t, name, customer, license)
		syncedIDs[instance.ID.String()] = struct{}{}
		newInstanceIntegration(t, instance, adapter)
	}
	unsyncedInstance := newInstance(t, "Unsynced Instance", customer, license)

	query := `query($adapter: String!, $cursor: String) {
		instances(hasIntegration: $adapter, limit: 1, cursor: $cursor) {
			items { id }
			nextCursor
			hasMore
		}
	}`

	// Act: page through the filtered set one instance at a time.
	seen := make(map[string]struct{}, len(syncedIDs))
	var cursor *string
	for page := 1; page <= len(syncedIDs); page++ {
		resp := executeGraphQL(t, query, map[string]interface{}{"adapter": adapter, "cursor": cursor})
		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		var data struct {
			Instances struct {
				Items []struct {
					ID string `json:"id"`
				} `json:"items"`
				NextCursor *string `json:"nextCursor"`
				HasMore    bool    `json:"hasMore"`
			} `json:"instances"`
		}
		require.NoError(t, json.Unmarshal(resp.Data, &data))

		// Assert: the limit is honoured, and hasMore/nextCursor describe
		// the pages that actually remain -- true for the first two, false
		// once the third instance has been returned.
		require.Len(t, data.Instances.Items, 1, "page %d should hold exactly the requested limit", page)
		assert.Equal(t, page < len(syncedIDs), data.Instances.HasMore, "page %d hasMore", page)
		assert.Equal(t, page < len(syncedIDs), data.Instances.NextCursor != nil, "page %d nextCursor", page)

		id := data.Instances.Items[0].ID
		assert.Contains(t, syncedIDs, id, "only synced instances should match the filter")
		assert.NotContains(t, seen, id, "page %d should not repeat an instance", page)
		seen[id] = struct{}{}

		cursor = data.Instances.NextCursor
	}

	assert.Len(t, seen, len(syncedIDs), "paging should walk the whole filtered set")
	assert.NotContains(t, seen, unsyncedInstance.ID.String())
}

func TestGraphQL_QueryCustomersWithIntegrationPaginates(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	// Arrange: three customers synced with the adapter and one that is
	// not, so the filter has both something to keep and something to drop.
	const adapter = "kaiten.integration.crm.attio"

	syncedIDs := make(map[string]struct{}, 3)
	for _, name := range []string{"Synced Customer One", "Synced Customer Two", "Synced Customer Three"} {
		customer := newCustomer(t, name)
		syncedIDs[customer.ID.String()] = struct{}{}
		newCustomerIntegration(t, customer, adapter)
	}
	unsyncedCustomer := newCustomer(t, "Unsynced Customer")

	query := `query($adapter: String!, $cursor: String) {
		customers(hasIntegration: $adapter, limit: 1, cursor: $cursor) {
			items { id }
			nextCursor
			hasMore
		}
	}`

	// Act: page through the filtered set one customer at a time.
	seen := make(map[string]struct{}, len(syncedIDs))
	var cursor *string
	for page := 1; page <= len(syncedIDs); page++ {
		resp := executeGraphQL(t, query, map[string]interface{}{"adapter": adapter, "cursor": cursor})
		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		var data struct {
			Customers struct {
				Items []struct {
					ID string `json:"id"`
				} `json:"items"`
				NextCursor *string `json:"nextCursor"`
				HasMore    bool    `json:"hasMore"`
			} `json:"customers"`
		}
		require.NoError(t, json.Unmarshal(resp.Data, &data))

		// Assert: the limit is honoured, and hasMore/nextCursor describe
		// the pages that actually remain -- true for the first two, false
		// once the third customer has been returned.
		require.Len(t, data.Customers.Items, 1, "page %d should hold exactly the requested limit", page)
		assert.Equal(t, page < len(syncedIDs), data.Customers.HasMore, "page %d hasMore", page)
		assert.Equal(t, page < len(syncedIDs), data.Customers.NextCursor != nil, "page %d nextCursor", page)

		id := data.Customers.Items[0].ID
		assert.Contains(t, syncedIDs, id, "only synced customers should match the filter")
		assert.NotContains(t, seen, id, "page %d should not repeat a customer", page)
		seen[id] = struct{}{}

		cursor = data.Customers.NextCursor
	}

	assert.Len(t, seen, len(syncedIDs), "paging should walk the whole filtered set")
	assert.NotContains(t, seen, unsyncedCustomer.ID.String())
}

func TestGraphQL_QueryInstanceWithRelations(t *testing.T) {
	t.Run("WhenInstanceExists_ReturnsInstanceWithCustomerAndLicense", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Arrange
		customer := newCustomer(t, "Test Customer")
		license := newLicense(t, "Test License")
		instance := newInstance(t, "Test Instance", customer, license)

		query := `{
			instances {
				items {
					id
					name
					status
					customer {
						id
						name
					}
					license {
						id
						name
						type
					}
				}
			}
		}`

		// Act
		resp := executeGraphQL(t, query, nil)

		// Assert
		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		var data struct {
			Instances struct {
				Items []struct {
					ID       string `json:"id"`
					Name     string `json:"name"`
					Status   string `json:"status"`
					Customer struct {
						ID   string `json:"id"`
						Name string `json:"name"`
					} `json:"customer"`
					License struct {
						ID   string `json:"id"`
						Name string `json:"name"`
						Type string `json:"type"`
					} `json:"license"`
				} `json:"items"`
			} `json:"instances"`
		}
		err := json.Unmarshal(resp.Data, &data)
		require.NoError(t, err)

		require.Len(t, data.Instances.Items, 1)

		// Verify instance
		assert.Equal(t, instance.ID.String(), data.Instances.Items[0].ID)
		assert.Equal(t, instance.Name, data.Instances.Items[0].Name)
		assert.Equal(t, "HEALTHY", data.Instances.Items[0].Status)

		// Verify customer relation
		assert.Equal(t, customer.ID.String(), data.Instances.Items[0].Customer.ID)
		assert.Equal(t, customer.Name, data.Instances.Items[0].Customer.Name)

		// Verify license relation
		assert.Equal(t, license.ID.String(), data.Instances.Items[0].License.ID)
		assert.Equal(t, license.Name, data.Instances.Items[0].License.Name)
		assert.Equal(t, "DEVELOPMENT", data.Instances.Items[0].License.Type)
	})
}

func TestGraphQL_QueryCustomerWithInstances(t *testing.T) {
	t.Run("WhenCustomerHasInstances_ReturnsCustomerWithInstances", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Arrange
		customer := newCustomer(t, "Test Customer")
		license := newLicense(t, "Test License")
		instance := newInstance(t, "Test Instance", customer, license)

		query := `{
			customers {
				items {
					id
					name
					instances {
						id
						name
					}
				}
			}
		}`

		// Act
		resp := executeGraphQL(t, query, nil)

		// Assert
		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		var data struct {
			Customers struct {
				Items []struct {
					ID        string `json:"id"`
					Name      string `json:"name"`
					Instances []struct {
						ID   string `json:"id"`
						Name string `json:"name"`
					} `json:"instances"`
				} `json:"items"`
			} `json:"customers"`
		}
		err := json.Unmarshal(resp.Data, &data)
		require.NoError(t, err)

		require.Len(t, data.Customers.Items, 1)
		assert.Equal(t, customer.ID.String(), data.Customers.Items[0].ID)
		assert.Equal(t, customer.Name, data.Customers.Items[0].Name)

		require.Len(t, data.Customers.Items[0].Instances, 1)
		assert.Equal(t, instance.ID.String(), data.Customers.Items[0].Instances[0].ID)
		assert.Equal(t, instance.Name, data.Customers.Items[0].Instances[0].Name)
	})
}

func TestGraphQL_QueryLicenseWithInstances(t *testing.T) {
	t.Run("WhenLicenseHasInstances_ReturnsLicenseWithInstances", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Arrange
		customer := newCustomer(t, "Test Customer")
		license := newLicense(t, "Test License")
		instance := newInstance(t, "Test Instance", customer, license)

		query := `{
			licenses {
				items {
					id
					name
					instances {
						id
						name
					}
				}
			}
		}`

		// Act
		resp := executeGraphQL(t, query, nil)

		// Assert
		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		var data struct {
			Licenses struct {
				Items []struct {
					ID        string `json:"id"`
					Name      string `json:"name"`
					Instances []struct {
						ID   string `json:"id"`
						Name string `json:"name"`
					} `json:"instances"`
				} `json:"items"`
			} `json:"licenses"`
		}
		err := json.Unmarshal(resp.Data, &data)
		require.NoError(t, err)

		require.Len(t, data.Licenses.Items, 1)
		assert.Equal(t, license.ID.String(), data.Licenses.Items[0].ID)
		assert.Equal(t, license.Name, data.Licenses.Items[0].Name)

		require.Len(t, data.Licenses.Items[0].Instances, 1)
		assert.Equal(t, instance.ID.String(), data.Licenses.Items[0].Instances[0].ID)
		assert.Equal(t, instance.Name, data.Licenses.Items[0].Instances[0].Name)
	})
}

func TestGraphQL_QuerySingleCustomer(t *testing.T) {
	t.Run("WhenCustomerExists_ReturnsThatCustomer", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Arrange
		customer := newCustomer(t, "Test Customer")

		query := `query GetCustomer($id: UUID!) {
			customer(id: $id) {
				id
				name
			}
		}`

		// Act
		resp := executeGraphQL(t, query, map[string]interface{}{
			"id": customer.ID.String(),
		})

		// Assert
		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		var data struct {
			Customer struct {
				ID   string `json:"id"`
				Name string `json:"name"`
			} `json:"customer"`
		}
		err := json.Unmarshal(resp.Data, &data)
		require.NoError(t, err)

		assert.Equal(t, customer.ID.String(), data.Customer.ID)
		assert.Equal(t, customer.Name, data.Customer.Name)
	})
}

func TestGraphQL_QuerySingleInstance(t *testing.T) {
	t.Run("WhenInstanceExists_ReturnsThatInstanceWithRelations", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Arrange
		customer := newCustomer(t, "Test Customer")
		license := newLicense(t, "Test License")
		instance := newInstance(t, "Test Instance", customer, license)

		query := `query GetInstance($id: UUID!) {
			instance(id: $id) {
				id
				name
				status
				metadata
				customer {
					id
					name
				}
				license {
					id
					name
				}
			}
		}`

		// Act
		resp := executeGraphQL(t, query, map[string]interface{}{
			"id": instance.ID.String(),
		})

		// Assert
		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		var data struct {
			Instance struct {
				ID       string `json:"id"`
				Name     string `json:"name"`
				Status   string `json:"status"`
				Metadata struct {
					Owner string `json:"owner"`
					Tier  string `json:"tier"`
				} `json:"metadata"`
				Customer struct {
					ID   string `json:"id"`
					Name string `json:"name"`
				} `json:"customer"`
				License struct {
					ID   string `json:"id"`
					Name string `json:"name"`
				} `json:"license"`
			} `json:"instance"`
		}
		err := json.Unmarshal(resp.Data, &data)
		require.NoError(t, err)

		assert.Equal(t, instance.ID.String(), data.Instance.ID)
		assert.Equal(t, instance.Name, data.Instance.Name)
		assert.Equal(t, "HEALTHY", data.Instance.Status)
		assert.Equal(t, "team-platform", data.Instance.Metadata.Owner)
		assert.Equal(t, "gold", data.Instance.Metadata.Tier)
		assert.Equal(t, customer.ID.String(), data.Instance.Customer.ID)
		assert.Equal(t, customer.Name, data.Instance.Customer.Name)
		assert.Equal(t, license.ID.String(), data.Instance.License.ID)
		assert.Equal(t, license.Name, data.Instance.License.Name)
	})

	t.Run("WhenInstanceHasDeploymentZone_ReturnsDeploymentZoneSlugAndRelation", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		customer := newCustomer(t, "Single Deployment Zone Customer")
		license := newLicense(t, "Single Deployment Zone License")
		deploymentZone := newDeploymentZone(t, "Single Production EU", "production")
		instance := newInstanceInDeploymentZone(t, "Single Deployment Zone Instance", customer, license, deploymentZone)

		query := `query GetInstance($id: UUID!) {
			instance(id: $id) {
				id
				deploymentZoneId
				deploymentZoneSlug
				deploymentZone {
					id
					name
					slug
					metadata
				}
			}
		}`

		resp := executeGraphQL(t, query, map[string]interface{}{
			"id": instance.ID.String(),
		})

		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		var data struct {
			Instance struct {
				ID                 string `json:"id"`
				DeploymentZoneID   string `json:"deploymentZoneId"`
				DeploymentZoneSlug string `json:"deploymentZoneSlug"`
				DeploymentZone     struct {
					ID       string `json:"id"`
					Name     string `json:"name"`
					Slug     string `json:"slug"`
					Metadata struct {
						Region string `json:"region"`
					} `json:"metadata"`
				} `json:"deploymentZone"`
			} `json:"instance"`
		}
		err := json.Unmarshal(resp.Data, &data)
		require.NoError(t, err)

		assert.Equal(t, instance.ID.String(), data.Instance.ID)
		assert.Equal(t, deploymentZone.ID.String(), data.Instance.DeploymentZoneID)
		assert.Equal(t, deploymentZone.Slug, data.Instance.DeploymentZoneSlug)
		assert.Equal(t, deploymentZone.ID.String(), data.Instance.DeploymentZone.ID)
		assert.Equal(t, deploymentZone.Name, data.Instance.DeploymentZone.Name)
		assert.Equal(t, deploymentZone.Slug, data.Instance.DeploymentZone.Slug)
		assert.Equal(t, "eu-west-1", data.Instance.DeploymentZone.Metadata.Region)
	})
}

func TestGraphQL_QuerySingleLicense(t *testing.T) {
	t.Run("WhenLicenseExists_ReturnsThatLicense", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Arrange
		license := newLicense(t, "Test License")

		query := `query GetLicense($id: UUID!) {
			license(id: $id) {
				id
				name
				type
			}
		}`

		// Act
		resp := executeGraphQL(t, query, map[string]interface{}{
			"id": license.ID.String(),
		})

		// Assert
		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		var data struct {
			License struct {
				ID   string `json:"id"`
				Name string `json:"name"`
				Type string `json:"type"`
			} `json:"license"`
		}
		err := json.Unmarshal(resp.Data, &data)
		require.NoError(t, err)

		assert.Equal(t, license.ID.String(), data.License.ID)
		assert.Equal(t, license.Name, data.License.Name)
		assert.Equal(t, "DEVELOPMENT", data.License.Type)
	})
}

func TestGraphQL_QueryReleases(t *testing.T) {
	t.Run("WhenOneReleaseExists_ReturnsThatRelease", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Arrange
		release := newRelease(t, "v1.0.0")

		query := `{
			releases {
				items {
					id
					version
					slug
				}
			}
		}`

		// Act
		resp := executeGraphQL(t, query, nil)

		// Assert
		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		var data struct {
			Releases struct {
				Items []struct {
					ID      string `json:"id"`
					Version string `json:"version"`
					Slug    string `json:"slug"`
				} `json:"items"`
			} `json:"releases"`
		}
		err := json.Unmarshal(resp.Data, &data)
		require.NoError(t, err)

		require.Len(t, data.Releases.Items, 1)
		assert.Equal(t, release.ID.String(), data.Releases.Items[0].ID)
		assert.Equal(t, release.Version, data.Releases.Items[0].Version)
		assert.Equal(t, release.Slug, data.Releases.Items[0].Slug)
	})
}

func TestGraphQL_QueryReleaseWithComponents(t *testing.T) {
	t.Run("WhenReleaseHasComponents_ReturnsReleaseWithComponents", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Arrange
		release := newReleaseWithComponents(t, "v1.0.0", []string{"api-gateway", "auth-service"})

		query := `{
			releases {
				items {
					id
					version
					components {
						id
						name
						version
					}
				}
			}
		}`

		// Act
		resp := executeGraphQL(t, query, nil)

		// Assert
		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		var data struct {
			Releases struct {
				Items []struct {
					ID         string `json:"id"`
					Version    string `json:"version"`
					Components []struct {
						ID      string `json:"id"`
						Name    string `json:"name"`
						Version string `json:"version"`
					} `json:"components"`
				} `json:"items"`
			} `json:"releases"`
		}
		err := json.Unmarshal(resp.Data, &data)
		require.NoError(t, err)

		require.Len(t, data.Releases.Items, 1)
		assert.Equal(t, release.ID.String(), data.Releases.Items[0].ID)
		assert.Equal(t, release.Version, data.Releases.Items[0].Version)

		require.Len(t, data.Releases.Items[0].Components, 2)

		componentNames := make(map[string]bool)
		for _, c := range data.Releases.Items[0].Components {
			componentNames[c.Name] = true
		}
		assert.True(t, componentNames["api-gateway"], "Expected api-gateway component")
		assert.True(t, componentNames["auth-service"], "Expected auth-service component")
	})
}

func TestGraphQL_QueryReleaseWithHistoricalRelations(t *testing.T) {
	t.Run("WhenReleaseWasPreviouslyDeployed_ItStillReturnsHistoricalZonesInstancesAndDeployments", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		customer := newCustomer(t, "Historical Customer")
		license := newLicense(t, "Historical License")
		firstRelease := newRelease(t, "v1.0.0")
		secondRelease := newRelease(t, "v2.0.0")
		deploymentZone := newDeploymentZone(t, "Production EU", "production")
		instance := newInstanceInDeploymentZone(
			t,
			"Historical Instance",
			customer,
			license,
			deploymentZone,
		)

		firstDeployment := newDeployment(t, deploymentZone, firstRelease)
		secondDeployment := newDeployment(t, deploymentZone, secondRelease)

		query := `{
			releases {
				items {
					id
					version
					deploymentZones {
						id
						name
						type
						releaseId
					}
					instances {
						id
						name
						deploymentZoneId
					}
					deployments {
						deploymentZoneId
						releaseId
					}
				}
			}
		}`

		resp := executeGraphQL(t, query, nil)

		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		type releaseGraphQLData struct {
			ID              string `json:"id"`
			Version         string `json:"version"`
			DeploymentZones []struct {
				ID        string `json:"id"`
				Name      string `json:"name"`
				Type      string `json:"type"`
				ReleaseID string `json:"releaseId"`
			} `json:"deploymentZones"`
			Instances []struct {
				ID               string `json:"id"`
				Name             string `json:"name"`
				DeploymentZoneID string `json:"deploymentZoneId"`
			} `json:"instances"`
			Deployments []struct {
				DeploymentZoneID string `json:"deploymentZoneId"`
				ReleaseID        string `json:"releaseId"`
			} `json:"deployments"`
		}

		var data struct {
			Releases struct {
				Items []releaseGraphQLData `json:"items"`
			} `json:"releases"`
		}
		err := json.Unmarshal(resp.Data, &data)
		require.NoError(t, err)

		var firstReleaseData *releaseGraphQLData
		var secondReleaseData *releaseGraphQLData

		for i := range data.Releases.Items {
			release := &data.Releases.Items[i]
			switch release.ID {
			case firstRelease.ID.String():
				firstReleaseData = release
			case secondRelease.ID.String():
				secondReleaseData = release
			}
		}

		require.NotNil(t, firstReleaseData)
		require.NotNil(t, secondReleaseData)

		require.Len(t, firstReleaseData.DeploymentZones, 1)
		assert.Equal(t, deploymentZone.ID.String(), firstReleaseData.DeploymentZones[0].ID)
		assert.Equal(t, "Production EU", firstReleaseData.DeploymentZones[0].Name)
		assert.Equal(t, "production", firstReleaseData.DeploymentZones[0].Type)
		assert.Equal(t, secondRelease.ID.String(), firstReleaseData.DeploymentZones[0].ReleaseID)

		require.Len(t, secondReleaseData.DeploymentZones, 1)
		assert.Equal(t, deploymentZone.ID.String(), secondReleaseData.DeploymentZones[0].ID)
		assert.Equal(t, secondRelease.ID.String(), secondReleaseData.DeploymentZones[0].ReleaseID)

		require.Len(t, firstReleaseData.Instances, 1)
		assert.Equal(t, instance.ID.String(), firstReleaseData.Instances[0].ID)
		assert.Equal(t, instance.Name, firstReleaseData.Instances[0].Name)
		assert.Equal(t, deploymentZone.ID.String(), firstReleaseData.Instances[0].DeploymentZoneID)

		require.Len(t, secondReleaseData.Instances, 1)
		assert.Equal(t, instance.ID.String(), secondReleaseData.Instances[0].ID)

		require.Len(t, firstReleaseData.Deployments, 1)
		assert.Equal(t, firstDeployment.ReleaseID.String(), firstReleaseData.Deployments[0].ReleaseID)
		assert.Equal(t, firstDeployment.DeploymentZoneID.String(), firstReleaseData.Deployments[0].DeploymentZoneID)

		require.Len(t, secondReleaseData.Deployments, 1)
		assert.Equal(t, secondDeployment.ReleaseID.String(), secondReleaseData.Deployments[0].ReleaseID)
		assert.Equal(t, secondDeployment.DeploymentZoneID.String(), secondReleaseData.Deployments[0].DeploymentZoneID)
	})
}

func TestGraphQL_QuerySingleRelease(t *testing.T) {
	t.Run("WhenReleaseExistsById_ReturnsThatRelease", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Arrange
		release := newRelease(t, "v1.0.0")

		query := `query GetRelease($id: UUID!) {
			release(id: $id) {
				id
				version
				slug
			}
		}`

		// Act
		resp := executeGraphQL(t, query, map[string]interface{}{
			"id": release.ID.String(),
		})

		// Assert
		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		var data struct {
			Release struct {
				ID      string `json:"id"`
				Version string `json:"version"`
				Slug    string `json:"slug"`
			} `json:"release"`
		}
		err := json.Unmarshal(resp.Data, &data)
		require.NoError(t, err)

		assert.Equal(t, release.ID.String(), data.Release.ID)
		assert.Equal(t, release.Version, data.Release.Version)
		assert.Equal(t, release.Slug, data.Release.Slug)
	})

	t.Run("WhenReleaseExistsBySlug_ReturnsThatRelease", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Arrange
		release := newRelease(t, "v2.0.0")

		query := `query GetRelease($slug: String!) {
			release(slug: $slug) {
				id
				version
				slug
			}
		}`

		// Act
		resp := executeGraphQL(t, query, map[string]interface{}{
			"slug": release.Slug,
		})

		// Assert
		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		var data struct {
			Release struct {
				ID      string `json:"id"`
				Version string `json:"version"`
				Slug    string `json:"slug"`
			} `json:"release"`
		}
		err := json.Unmarshal(resp.Data, &data)
		require.NoError(t, err)

		assert.Equal(t, release.ID.String(), data.Release.ID)
		assert.Equal(t, release.Version, data.Release.Version)
		assert.Equal(t, release.Slug, data.Release.Slug)
	})

	t.Run("WhenReleaseHasComponents_ReturnsComponentsWithRelease", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Arrange
		release := newReleaseWithComponents(t, "v3.0.0", []string{"frontend", "backend", "database"})

		query := `query GetRelease($id: UUID!) {
			release(id: $id) {
				id
				version
				components {
					id
					name
					version
					slug
				}
			}
		}`

		// Act
		resp := executeGraphQL(t, query, map[string]interface{}{
			"id": release.ID.String(),
		})

		// Assert
		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		var data struct {
			Release struct {
				ID         string `json:"id"`
				Version    string `json:"version"`
				Components []struct {
					ID      string `json:"id"`
					Name    string `json:"name"`
					Version string `json:"version"`
					Slug    string `json:"slug"`
				} `json:"components"`
			} `json:"release"`
		}
		err := json.Unmarshal(resp.Data, &data)
		require.NoError(t, err)

		assert.Equal(t, release.ID.String(), data.Release.ID)
		assert.Equal(t, release.Version, data.Release.Version)

		require.Len(t, data.Release.Components, 3)

		componentNames := make(map[string]bool)
		for _, c := range data.Release.Components {
			componentNames[c.Name] = true
			assert.NotEmpty(t, c.ID)
			assert.NotEmpty(t, c.Slug)
			assert.Equal(t, "v1.0.0", c.Version)
		}
		assert.True(t, componentNames["frontend"], "Expected frontend component")
		assert.True(t, componentNames["backend"], "Expected backend component")
		assert.True(t, componentNames["database"], "Expected database component")
	})
}
