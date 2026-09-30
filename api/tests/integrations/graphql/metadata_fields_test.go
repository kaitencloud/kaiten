package graphql_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	metadatafieldsdb "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
)

// TestGraphQL_QueryMetadataFields covers the query:
// metadataFields(resourceType, includeArchived).
func TestGraphQL_QueryMetadataFields(t *testing.T) {
	resetDB := func() { require.NoError(t, testDb.Reset()) }

	seedField := func(t *testing.T, key, label string, resourceType metadatafieldsdb.MetadataFieldResourceType, order int32) metadatafieldsdb.MetadataField {
		t.Helper()
		schemaBytes, err := json.Marshal(map[string]any{"type": "string"})
		require.NoError(t, err)
		row, err := metadatafieldsdb.New(testServer.Dependencies.DB).InsertMetadataField(context.Background(), metadatafieldsdb.InsertMetadataFieldParams{
			OrganizationID: testDb.DefaultData.OrganizationID,
			ResourceType:   resourceType,
			Key:            key,
			Label:          label,
			JsonSchema:     schemaBytes,
			DisplayOrder:   order,
			UserID:         testDb.DefaultData.UserID,
		})
		require.NoError(t, err)
		return row
	}

	archive := func(t *testing.T, id metadatafieldsdb.MetadataField) {
		t.Helper()
		_, err := metadatafieldsdb.New(testServer.Dependencies.DB).ArchiveMetadataField(context.Background(), metadatafieldsdb.ArchiveMetadataFieldParams{
			ID:             id.ID,
			OrganizationID: testDb.DefaultData.OrganizationID,
			UserID:         testDb.DefaultData.UserID,
		})
		require.NoError(t, err)
	}

	query := `query($rt: MetadataFieldResourceType!, $ia: Boolean, $limit: Int, $cursor: String) {
		metadataFields(resourceType: $rt, includeArchived: $ia, limit: $limit, cursor: $cursor) {
			items {
				id
				resourceType
				key
				label
				jsonSchema
				displayOrder
				archivedAt
				createdBy { id name }
				updatedBy { id name }
			}
			nextCursor
			hasMore
		}
	}`

	t.Run("WhenFieldsExist_ReturnsThemOrderedByDisplayOrder", func(t *testing.T) {
		t.Cleanup(resetDB)
		seedField(t, "tier", "Tier", metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, 1)
		seedField(t, "region", "Region", metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, 0)

		resp := executeGraphQL(t, query, map[string]any{"rt": "DEPLOYMENT_ZONE"})
		require.Empty(t, resp.Errors)

		var data struct {
			MetadataFields struct {
				Items []struct {
					Key          string         `json:"key"`
					Label        string         `json:"label"`
					JSONSchema   map[string]any `json:"jsonSchema"`
					DisplayOrder int            `json:"displayOrder"`
					ArchivedAt   *string        `json:"archivedAt"`
					CreatedBy    struct{ ID, Name string }
				} `json:"items"`
				NextCursor *string `json:"nextCursor"`
				HasMore    bool    `json:"hasMore"`
			} `json:"metadataFields"`
		}
		require.NoError(t, json.Unmarshal(resp.Data, &data))
		require.Len(t, data.MetadataFields.Items, 2)
		assert.Equal(t, "region", data.MetadataFields.Items[0].Key, "lowest displayOrder first")
		assert.Equal(t, "tier", data.MetadataFields.Items[1].Key)
		assert.Equal(t, "string", data.MetadataFields.Items[0].JSONSchema["type"])
		assert.NotEmpty(t, data.MetadataFields.Items[0].CreatedBy.Name, "createdBy.name should be joined from user")
		assert.Nil(t, data.MetadataFields.Items[0].ArchivedAt)
		assert.False(t, data.MetadataFields.HasMore, "both fields fit on the default page")
		assert.Nil(t, data.MetadataFields.NextCursor, "nextCursor is nil exactly when hasMore is false")
	})

	t.Run("WhenIncludeArchivedFalse_ArchivedFieldsAreHidden", func(t *testing.T) {
		t.Cleanup(resetDB)
		active := seedField(t, "region", "Region", metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, 0)
		archivedField := seedField(t, "legacy", "Legacy", metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, 1)
		archive(t, archivedField)

		resp := executeGraphQL(t, query, map[string]any{"rt": "DEPLOYMENT_ZONE", "ia": false})
		require.Empty(t, resp.Errors)

		var data struct {
			MetadataFields struct {
				Items []struct {
					ID string `json:"id"`
				} `json:"items"`
			} `json:"metadataFields"`
		}
		require.NoError(t, json.Unmarshal(resp.Data, &data))
		require.Len(t, data.MetadataFields.Items, 1)
		assert.Equal(t, active.ID.String(), data.MetadataFields.Items[0].ID)
	})

	t.Run("WhenIncludeArchivedTrue_BothActiveAndArchivedAreReturned", func(t *testing.T) {
		t.Cleanup(resetDB)
		seedField(t, "region", "Region", metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, 0)
		archivedField := seedField(t, "legacy", "Legacy", metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, 1)
		archive(t, archivedField)

		resp := executeGraphQL(t, query, map[string]any{"rt": "DEPLOYMENT_ZONE", "ia": true})
		require.Empty(t, resp.Errors)

		var data struct {
			MetadataFields struct {
				Items []struct {
					Key        string  `json:"key"`
					ArchivedAt *string `json:"archivedAt"`
				} `json:"items"`
			} `json:"metadataFields"`
		}
		require.NoError(t, json.Unmarshal(resp.Data, &data))
		require.Len(t, data.MetadataFields.Items, 2)
		// archived field should carry a non-nil archivedAt
		var archivedReturned bool
		for _, f := range data.MetadataFields.Items {
			if f.Key == "legacy" {
				require.NotNil(t, f.ArchivedAt)
				archivedReturned = true
			}
		}
		assert.True(t, archivedReturned)
	})

	// Cross-organization isolation on the GraphQL surface.
	// Seeds a *second* organization + a MetadataField inside it, then queries
	// from the default org's server. The cross-org row MUST NOT appear.
	t.Run("CrossOrgIsolation_DoesNotLeakOtherOrgFields_KTN62", func(t *testing.T) {
		t.Cleanup(resetDB)
		// Seed a metadata_field row owned by the default org so we have a
		// known positive control to compare against.
		seedField(t, "region", "Region", metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, 0)

		// Build a second org directly in the DB. Going through the API would
		// require an admin path that doesn't exist; raw SQL is the
		// established pattern for cross-org seeding in this codebase.
		ctx := t.Context()
		otherOrgID := uuid.New()
		otherUserID := uuid.New()
		_, err := testDb.DbPool.Exec(
			ctx,
			"INSERT INTO organization (id, external_id, name) VALUES ($1, $2, 'Other Org')",
			otherOrgID, "other-org-external-id",
		)
		require.NoError(t, err)
		_, err = testDb.DbPool.Exec(
			ctx,
			"INSERT INTO \"user\" (id, external_id, email, name) VALUES ($1, $2, 'other@example.com', 'Other User')",
			otherUserID, "other-user-external-id",
		)
		require.NoError(t, err)
		_, err = testDb.DbPool.Exec(
			ctx,
			"INSERT INTO user_on_organization (organization_id, user_id) VALUES ($1, $2)",
			otherOrgID, otherUserID,
		)
		require.NoError(t, err)

		// MetadataField owned by the *other* org.
		schemaBytes, _ := json.Marshal(map[string]any{"type": "string"})
		_, err = metadatafieldsdb.New(testServer.Dependencies.DB).InsertMetadataField(ctx, metadatafieldsdb.InsertMetadataFieldParams{
			OrganizationID: otherOrgID,
			ResourceType:   metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE,
			Key:            "secret_other_org_field",
			Label:          "Should never appear to default org",
			JsonSchema:     schemaBytes,
			DisplayOrder:   0,
			UserID:         otherUserID,
		})
		require.NoError(t, err)

		// Query through the default org's server. The other org's field must
		// not leak.
		resp := executeGraphQL(t, query, map[string]any{"rt": "DEPLOYMENT_ZONE", "ia": true})
		require.Empty(t, resp.Errors)

		var data struct {
			MetadataFields struct {
				Items []struct {
					Key string `json:"key"`
				} `json:"items"`
			} `json:"metadataFields"`
		}
		require.NoError(t, json.Unmarshal(resp.Data, &data))
		keys := make([]string, 0, len(data.MetadataFields.Items))
		for _, f := range data.MetadataFields.Items {
			keys = append(keys, f.Key)
		}
		assert.Contains(t, keys, "region", "default org's own field is visible")
		assert.NotContains(t, keys, "secret_other_org_field",
			"GraphQL resolver must filter by principal.OrganizationID")
	})

	t.Run("FiltersByResourceType_DZQueryDoesNotReturnInstanceFields", func(t *testing.T) {
		t.Cleanup(resetDB)
		seedField(t, "region", "Region", metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, 0)
		seedField(t, "platform", "Platform", metadatafieldsdb.MetadataFieldResourceTypeINSTANCE, 0)

		resp := executeGraphQL(t, query, map[string]any{"rt": "DEPLOYMENT_ZONE"})
		require.Empty(t, resp.Errors)

		var data struct {
			MetadataFields struct {
				Items []struct {
					Key string `json:"key"`
				} `json:"items"`
			} `json:"metadataFields"`
		}
		require.NoError(t, json.Unmarshal(resp.Data, &data))
		require.Len(t, data.MetadataFields.Items, 1)
		assert.Equal(t, "region", data.MetadataFields.Items[0].Key)
	})

	// Walks the whole list one row at a time and asserts the pages recompose
	// the display order exactly once each -- the property keyset pagination
	// exists to provide, and the one a limit-only implementation would fail.
	t.Run("CursorWalk_YieldsEveryFieldOnceInDisplayOrder", func(t *testing.T) {
		t.Cleanup(resetDB)
		seedField(t, "region", "Region", metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, 0)
		seedField(t, "tier", "Tier", metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, 1)
		seedField(t, "owner", "Owner", metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, 2)

		var (
			seen   []string
			cursor *string
		)
		for page := range 3 {
			resp := executeGraphQL(t, query, map[string]any{
				"rt": "DEPLOYMENT_ZONE", "limit": 1, "cursor": cursor,
			})
			require.Empty(t, resp.Errors)

			var data struct {
				MetadataFields struct {
					Items []struct {
						Key string `json:"key"`
					} `json:"items"`
					NextCursor *string `json:"nextCursor"`
					HasMore    bool    `json:"hasMore"`
				} `json:"metadataFields"`
			}
			require.NoError(t, json.Unmarshal(resp.Data, &data))
			require.Len(t, data.MetadataFields.Items, 1, "page %d honours limit: 1", page)

			lastPage := page == 2
			assert.Equal(t, !lastPage, data.MetadataFields.HasMore, "page %d hasMore", page)
			assert.Equal(t, !lastPage, data.MetadataFields.NextCursor != nil, "page %d nextCursor", page)

			seen = append(seen, data.MetadataFields.Items[0].Key)
			cursor = data.MetadataFields.NextCursor
		}

		assert.Equal(t, []string{"region", "tier", "owner"}, seen, "display order preserved across pages")
	})

	// A cursor is opaque, so a client can only ever send back one we minted --
	// or garbage. Garbage must read as bad input, not as a server fault: the
	// resolver types it so presentError keeps the message instead of
	// withholding it behind a correlation id.
	t.Run("WhenCursorIsMalformed_ReturnsTypedValidationError", func(t *testing.T) {
		t.Cleanup(resetDB)
		seedField(t, "region", "Region", metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, 0)

		bogus := "not-a-real-cursor"
		resp := executeGraphQL(t, query, map[string]any{"rt": "DEPLOYMENT_ZONE", "cursor": &bogus})
		require.Len(t, resp.Errors, 1)
		assert.Equal(t, "invalid cursor", resp.Errors[0].Message)
		assert.Equal(t, "MetadataFields.InvalidCursor", resp.Errors[0].Extensions["code"])
	})
}
