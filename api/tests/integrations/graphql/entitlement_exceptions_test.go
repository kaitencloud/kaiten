package graphql_test

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	entitlementsschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
)

// Instance.entitlementExceptions (§13.14, V32-03 a): the list of
// GET /instances/{instanceSlug}/entitlement-exceptions, with the value in the
// {type, value} shape of a licence grant.
func TestGraphQL_InstanceEntitlementExceptions(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	instance := newInstance(t, "gql-exceptions", newCustomer(t, "GQL Exceptions Co"), newLicense(t, "GQL Exceptions Plan"))
	sso, err := createentitlement.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB)).CreateEntitlement(t.Context(),
		createentitlement.CreateEntitlementInput{Name: "SSO", Slug: "gql-sso", Type: entitlementsschema.Boolean}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	seats := newPresentedEntitlement(t, "gql-exception-seats", 1)

	insert := func(entitlementSlug, kind string, value any, starts, ends string, revoked bool) uuid.UUID {
		t.Helper()
		var raw []byte
		if value != nil {
			raw, err = json.Marshal(value)
			require.NoError(t, err)
		}
		var id uuid.UUID
		require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `
			INSERT INTO instance_entitlement_exception (organization_id, instance_id, entitlement_id, kind, value, starts_at, ends_at, reason,
			                                            created_by_id, revoked_at, revoked_by_id)
			SELECT $1, $2, e.id, $4::entitlement_exception_kind, $5::jsonb, now() + $6::interval, now() + $7::interval, 'pilot', $3,
			       CASE WHEN $8 THEN now() END, CASE WHEN $8 THEN $3::uuid END
			FROM entitlement e WHERE e.organization_id = $1 AND e.slug = $9
			RETURNING id`,
			testDb.DefaultData.OrganizationID, instance.ID, testDb.DefaultData.UserID, kind, raw, starts, ends, revoked, entitlementSlug).Scan(&id))
		return id
	}
	active := insert(sso.Slug, "SET", true, "-1 hour", "14 days", false)
	revoked := insert(seats.Slug, "SET", 10, "-2 hours", "1 day", true)
	scheduled := insert(seats.Slug, "UNLIMITED", nil, "2 days", "3 days", false)

	resp := executeGraphQL(t, `query($id: UUID!) {
		instance(id: $id) {
			entitlementExceptions { id entitlementSlug entitlementType kind value status reason endsAt revokedAt }
			all: entitlementExceptions(filter: ALL) { id status }
		}
	}`, map[string]any{"id": instance.ID.String()})
	require.Empty(t, resp.Errors)

	type exception struct {
		ID              string          `json:"id"`
		EntitlementSlug string          `json:"entitlementSlug"`
		EntitlementType string          `json:"entitlementType"`
		Kind            string          `json:"kind"`
		Value           json.RawMessage `json:"value"`
		Status          string          `json:"status"`
		Reason          string          `json:"reason"`
		EndsAt          *string         `json:"endsAt"`
		RevokedAt       *string         `json:"revokedAt"`
	}
	var data struct {
		Instance struct {
			EntitlementExceptions []exception `json:"entitlementExceptions"`
			All                   []exception `json:"all"`
		} `json:"instance"`
	}
	require.NoError(t, json.Unmarshal(resp.Data, &data))

	// Active by default, scheduled ones included, latest start first.
	listed := data.Instance.EntitlementExceptions
	require.Len(t, listed, 2)
	assert.Equal(t, scheduled.String(), listed[0].ID)
	assert.Equal(t, "SCHEDULED", listed[0].Status)
	assert.Equal(t, "UNLIMITED", listed[0].Kind)
	assert.JSONEq(t, `null`, string(listed[0].Value))
	assert.Equal(t, active.String(), listed[1].ID)
	assert.Equal(t, "ACTIVE", listed[1].Status)
	assert.Equal(t, "BOOLEAN", listed[1].EntitlementType)
	assert.Equal(t, sso.Slug, listed[1].EntitlementSlug)
	assert.JSONEq(t, `{"type":"boolean","value":true}`, string(listed[1].Value))
	assert.Equal(t, "pilot", listed[1].Reason)
	assert.NotNil(t, listed[1].EndsAt)
	assert.Nil(t, listed[1].RevokedAt)

	all := data.Instance.All
	require.Len(t, all, 3)
	assert.Equal(t, revoked.String(), all[2].ID)
	assert.Equal(t, "REVOKED", all[2].Status)
}
