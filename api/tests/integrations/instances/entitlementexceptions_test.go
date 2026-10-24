package instances_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/exceptions"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/createinstance"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// Entitlement exceptions (§13.16, V32-03 a): the vendor's dated decision on one
// entitlement of one instance, the last layer of the view, with billing off as
// it is in this suite.

type exceptionProblem struct {
	Code   string `json:"code"`
	Errors []struct {
		Value map[string]any `json:"value"`
	} `json:"errors"`
}

func newInstanceOn(t *testing.T, license *licenseschema.License) *instanceschema.Instance {
	t.Helper()
	slug, err := slugutil.GenerateUnique("exception")
	require.NoError(t, err)
	instance, err := createinstance.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB)).CreateInstance(t.Context(),
		&createinstance.Command{
			Name: "exception", Slug: &slug, Description: "exceptions", StartLicenseDate: time.Now(), EndLicenseDate: time.Now().AddDate(1, 0, 0),
			LicenseID: license.ID, CustomerID: newCustomer(t).ID,
		}, testDb.DefaultData.UserID, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	return instance
}

func exceptionsPath(instanceSlug string) string {
	return "/api/instances/" + instanceSlug + "/entitlement-exceptions"
}

func createdException(t *testing.T, instanceSlug string, body map[string]any) exceptions.EntitlementException {
	t.Helper()
	resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, http.MethodPost, exceptionsPath(instanceSlug), body), fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	return commonfixture.AssertJSONResponse[exceptions.EntitlementException](t, resp, fiber.StatusCreated)
}

func refusedException(t *testing.T, instanceSlug string, body map[string]any, wantStatus int) exceptionProblem {
	t.Helper()
	resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, http.MethodPost, exceptionsPath(instanceSlug), body), fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	return commonfixture.AssertJSONResponse[exceptionProblem](t, resp, wantStatus)
}

func listExceptions(t *testing.T, instanceSlug, filter string) []exceptions.EntitlementException {
	t.Helper()
	path := exceptionsPath(instanceSlug)
	if filter != "" {
		path += "?filter=" + filter
	}
	return sendInstanceRequest[[]exceptions.EntitlementException](t, http.MethodGet, path, nil, fiber.StatusOK)
}

func revokeException(t *testing.T, instanceSlug string, id uuid.UUID) int {
	t.Helper()
	resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, http.MethodDelete, exceptionsPath(instanceSlug)+"/"+id.String(), nil), fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	return resp.StatusCode
}

func usagesOf(t *testing.T, instanceSlug string) map[string]instanceschema.EntitlementUsage {
	t.Helper()
	list := sendInstanceRequest[[]instanceschema.EntitlementUsage](t, http.MethodGet, "/api/instances/"+instanceSlug+"/entitlements/usage", nil, fiber.StatusOK)
	out := make(map[string]instanceschema.EntitlementUsage, len(list))
	for _, usage := range list {
		out[usage.EntitlementSlug] = usage
	}
	return out
}

// exceptionEvents is the payloads of the exception events of that name.
func exceptionEvents(t *testing.T, name string, id uuid.UUID) []map[string]any {
	t.Helper()
	var out []map[string]any
	for _, event := range commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
		if event.EventName != name {
			continue
		}
		var data map[string]any
		require.NoError(t, json.Unmarshal(event.Data, &data))
		if data["id"] == id.String() {
			out = append(out, data)
		}
	}
	return out
}

func TestEntitlementExceptions(t *testing.T) {
	// Its instances must not outlive it: the package's tests run shuffled, and
	// some count every instance in the database.
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	license := newLicense(t)
	sso := newEntitlementWithType(t, entitlementschema.Boolean)
	seats := newEntitlement(t)
	assignEntitlementToLicense(t, license.Slug, seats.Slug, 100)

	t.Run("SSOForTwoWeeks", func(t *testing.T) {
		instance := newInstanceOn(t, license)
		require.NotContains(t, usagesOf(t, instance.Slug), sso.Slug)

		endsAt := time.Now().Add(14 * 24 * time.Hour).UTC().Truncate(time.Millisecond)
		created := createdException(t, instance.Slug, map[string]any{
			"entitlementSlug": sso.Slug, "kind": "SET", "value": true, "endsAt": endsAt, "reason": "PoC",
		})
		require.Equal(t, exceptions.StatusActive, created.Status)
		require.Equal(t, "BOOLEAN", created.EntitlementType)
		require.Equal(t, instance.Slug, created.InstanceSlug)
		require.JSONEq(t, `true`, string(created.Value))
		require.True(t, endsAt.Equal(*created.EndsAt))
		require.Nil(t, created.RevokedAt)

		// Every read sees it at once, granted by the exception alone.
		usage, ok := usagesOf(t, instance.Slug)[sso.Slug]
		require.True(t, ok)
		require.Equal(t, instanceschema.SourceException, usage.Source)
		require.NotNil(t, usage.Value.Boolean)
		require.True(t, usage.Value.Boolean.Value)
		require.NotNil(t, usage.Provenance)
		require.Nil(t, usage.Provenance.License)
		require.NotNil(t, usage.Provenance.Exception)
		require.Equal(t, created.ID, usage.Provenance.Exception.InstanceEntitlementExceptionID)
		require.Equal(t, "SET", usage.Provenance.Exception.Kind)

		// The event carries the raw value, never the {type, value} wrapper.
		events := exceptionEvents(t, "INSTANCE_ENTITLEMENT_EXCEPTION_CREATED", created.ID)
		require.Len(t, events, 1)
		require.Equal(t, true, events[0]["value"])
		require.Equal(t, "PoC", events[0]["reason"])

		// A second window that meets it is refused, naming the first.
		problem := refusedException(t, instance.Slug, map[string]any{
			"entitlementSlug": sso.Slug, "kind": "SET", "value": false, "startsAt": time.Now().Add(7 * 24 * time.Hour), "reason": "overlap",
		}, fiber.StatusConflict)
		require.Equal(t, "CreateEntitlementException.Overlap", problem.Code)
		require.Len(t, problem.Errors, 1)
		require.Equal(t, created.ID.String(), problem.Errors[0].Value["exceptionId"])

		// One starting where the first ends is accepted, and scheduled.
		next := createdException(t, instance.Slug, map[string]any{
			"entitlementSlug": sso.Slug, "kind": "SET", "value": false, "startsAt": endsAt, "reason": "after the PoC",
		})
		require.Equal(t, exceptions.StatusScheduled, next.Status)
		require.Nil(t, next.EndsAt)

		active := listExceptions(t, instance.Slug, "")
		require.Equal(t, []uuid.UUID{next.ID, created.ID}, []uuid.UUID{active[0].ID, active[1].ID}, "latest start first")

		// Revoking ends it at once and keeps the row; a second revoke is a no-op.
		require.Equal(t, fiber.StatusNoContent, revokeException(t, instance.Slug, created.ID))
		require.NotContains(t, usagesOf(t, instance.Slug), sso.Slug)
		require.Len(t, exceptionEvents(t, "INSTANCE_ENTITLEMENT_EXCEPTION_REVOKED", created.ID), 1)
		require.Equal(t, fiber.StatusNoContent, revokeException(t, instance.Slug, created.ID))
		require.Len(t, exceptionEvents(t, "INSTANCE_ENTITLEMENT_EXCEPTION_REVOKED", created.ID), 1, "an idempotent revoke emits nothing")

		active = listExceptions(t, instance.Slug, "active")
		require.Len(t, active, 1)
		require.Equal(t, next.ID, active[0].ID)
		all := listExceptions(t, instance.Slug, "all")
		require.Len(t, all, 2)
		require.Equal(t, exceptions.StatusRevoked, all[1].Status)
		require.NotNil(t, all[1].RevokedAt)

		// Revoking the scheduled one means it never starts.
		require.Equal(t, fiber.StatusNoContent, revokeException(t, instance.Slug, next.ID))
		require.Empty(t, listExceptions(t, instance.Slug, ""))
	})

	t.Run("ANumberIsTheLastLayer", func(t *testing.T) {
		instance := newInstanceOn(t, license)
		set := createdException(t, instance.Slug, map[string]any{
			"entitlementSlug": seats.Slug, "kind": "SET", "value": 10, "reason": "investigation",
		})
		usage := usagesOf(t, instance.Slug)[seats.Slug]
		require.Equal(t, instanceschema.SourceLicense, usage.Source, "the licence still grants it")
		require.NotNil(t, usage.Limit)
		require.InDelta(t, 10, usage.Limit.Number.Value, 0, "an exception may lower the value")
		require.NotNil(t, usage.Provenance.Number)
		require.InDelta(t, 100, usage.Provenance.Number.AfterBoosts, 0)
		require.InDelta(t, 10, usage.Provenance.Number.Effective, 0)
		require.Equal(t, fiber.StatusNoContent, revokeException(t, instance.Slug, set.ID))

		add := createdException(t, instance.Slug, map[string]any{
			"entitlementSlug": seats.Slug, "kind": "ADD", "value": 5, "reason": "a gesture",
		})
		require.InDelta(t, 105, usagesOf(t, instance.Slug)[seats.Slug].Limit.Number.Value, 0)
		require.Equal(t, fiber.StatusNoContent, revokeException(t, instance.Slug, add.ID))

		unlimited := createdException(t, instance.Slug, map[string]any{
			"entitlementSlug": seats.Slug, "kind": "UNLIMITED", "value": nil, "reason": "a pilot",
		})
		require.Empty(t, unlimited.Value)
		require.InDelta(t, -1, usagesOf(t, instance.Slug)[seats.Slug].Limit.Number.Value, 0)
		events := exceptionEvents(t, "INSTANCE_ENTITLEMENT_EXCEPTION_CREATED", unlimited.ID)
		require.Len(t, events, 1)
		require.Contains(t, events[0], "value")
		require.Nil(t, events[0]["value"])
	})

	t.Run("TheWindow", func(t *testing.T) {
		instance := newInstanceOn(t, license)
		// A past start is taken as given.
		past := createdException(t, instance.Slug, map[string]any{
			"entitlementSlug": seats.Slug, "kind": "SET", "value": 1, "startsAt": time.Now().Add(-time.Hour),
			"endsAt": time.Now().Add(time.Hour), "reason": "backdated",
		})
		require.Equal(t, exceptions.StatusActive, past.Status)
		require.Equal(t, fiber.StatusNoContent, revokeException(t, instance.Slug, past.ID))

		// A future start is scheduled: the reads do not see it yet.
		scheduled := createdException(t, instance.Slug, map[string]any{
			"entitlementSlug": seats.Slug, "kind": "SET", "value": 1, "startsAt": time.Now().Add(time.Hour), "reason": "later",
		})
		require.Equal(t, exceptions.StatusScheduled, scheduled.Status)
		require.InDelta(t, 100, usagesOf(t, instance.Slug)[seats.Slug].Limit.Number.Value, 0)
		require.Nil(t, usagesOf(t, instance.Slug)[seats.Slug].Provenance.Exception)
		require.Equal(t, fiber.StatusNoContent, revokeException(t, instance.Slug, scheduled.ID))

		// An ended exception stays in the constraint: a backdated window over it
		// is refused (INV-37).
		var ended uuid.UUID
		require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `
			INSERT INTO instance_entitlement_exception (organization_id, instance_id, entitlement_id, kind, value, starts_at, ends_at, reason, created_by_id)
			SELECT $1, $2, e.id, 'SET', '2', now() - interval '3 hours', now() - interval '2 hours', 'ended', $3
			FROM entitlement e WHERE e.slug = $4 AND e.organization_id = $1
			RETURNING id`,
			testDb.DefaultData.OrganizationID, instance.ID, testDb.DefaultData.UserID, seats.Slug).Scan(&ended))
		problem := refusedException(t, instance.Slug, map[string]any{
			"entitlementSlug": seats.Slug, "kind": "SET", "value": 3, "startsAt": time.Now().Add(-150 * time.Minute), "reason": "over the ended one",
		}, fiber.StatusConflict)
		require.Equal(t, "CreateEntitlementException.Overlap", problem.Code)
		require.Equal(t, ended.String(), problem.Errors[0].Value["exceptionId"])

		all := listExceptions(t, instance.Slug, "all")
		require.Len(t, all, 3)
		require.Equal(t, exceptions.StatusExpired, all[2].Status, "the ended one, started first")
		require.Empty(t, listExceptions(t, instance.Slug, "active"))
		// Revoking an ended exception changes nothing.
		require.Equal(t, fiber.StatusNoContent, revokeException(t, instance.Slug, ended))
		require.Nil(t, listExceptions(t, instance.Slug, "all")[2].RevokedAt)
	})

	t.Run("TheExpiryNotice", func(t *testing.T) {
		// Step (g) of billing-lifecycle, which runs with billing off as here.
		instance := newInstanceOn(t, license)
		insertEnded := func(entitlementSlug string, revoked bool) uuid.UUID {
			t.Helper()
			var id uuid.UUID
			require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `
				INSERT INTO instance_entitlement_exception (organization_id, instance_id, entitlement_id, kind, value, starts_at, ends_at, reason,
				                                            created_by_id, revoked_at, revoked_by_id)
				SELECT $1, $2, e.id, 'SET', '1', now() - interval '2 hours', now() - interval '1 hour', 'ended', $3,
				       CASE WHEN $5 THEN now() - interval '90 minutes' END, CASE WHEN $5 THEN $3::uuid END
				FROM entitlement e WHERE e.slug = $4 AND e.organization_id = $1
				RETURNING id`,
				testDb.DefaultData.OrganizationID, instance.ID, testDb.DefaultData.UserID, entitlementSlug, revoked).Scan(&id))
			return id
		}
		ended := insertEnded(seats.Slug, false)
		revoked := insertEnded(sso.Slug, true)
		expiry := exceptions.NewExpiry(uow.NewUnitOfWork(testServer.Dependencies.DB))

		announced, err := expiry.Pass(t.Context(), 100)
		require.NoError(t, err)
		require.GreaterOrEqual(t, announced, 1)
		events := exceptionEvents(t, "INSTANCE_ENTITLEMENT_EXCEPTION_EXPIRED", ended)
		require.Len(t, events, 1)
		require.Equal(t, instance.Slug, events[0]["instanceSlug"])
		require.Equal(t, seats.Slug, events[0]["entitlementSlug"])
		require.Empty(t, exceptionEvents(t, "INSTANCE_ENTITLEMENT_EXCEPTION_EXPIRED", revoked), "a revoked exception never expires")

		// Once only: the marker is set with the event.
		_, err = expiry.Pass(t.Context(), 100)
		require.NoError(t, err)
		require.Len(t, exceptionEvents(t, "INSTANCE_ENTITLEMENT_EXCEPTION_EXPIRED", ended), 1)
		all := listExceptions(t, instance.Slug, "all")
		require.Len(t, all, 2)
		for _, x := range all {
			if x.ID == ended {
				require.Equal(t, exceptions.StatusExpired, x.Status)
			}
		}
	})

	t.Run("Refusals", func(t *testing.T) {
		instance := newInstanceOn(t, license)
		config := newEntitlementWithType(t, entitlementschema.Config)
		cases := []struct {
			name   string
			body   map[string]any
			status int
			code   string
		}{
			{"AddOnABoolean", map[string]any{"entitlementSlug": sso.Slug, "kind": "ADD", "value": 1, "reason": "r"}, fiber.StatusUnprocessableEntity, "CreateEntitlementException.InvalidKind"},
			{"UnlimitedOnAConfig", map[string]any{"entitlementSlug": config.Slug, "kind": "UNLIMITED", "reason": "r"}, fiber.StatusUnprocessableEntity, "CreateEntitlementException.InvalidKind"},
			{"AStringOnANumber", map[string]any{"entitlementSlug": seats.Slug, "kind": "SET", "value": "10", "reason": "r"}, fiber.StatusUnprocessableEntity, "CreateEntitlementException.InvalidValue"},
			{"MinusOne", map[string]any{"entitlementSlug": seats.Slug, "kind": "SET", "value": -1, "reason": "r"}, fiber.StatusUnprocessableEntity, "CreateEntitlementException.InvalidValue"},
			{"AnAddOfZero", map[string]any{"entitlementSlug": seats.Slug, "kind": "ADD", "value": 0, "reason": "r"}, fiber.StatusUnprocessableEntity, "CreateEntitlementException.InvalidValue"},
			{"AValueOnUnlimited", map[string]any{"entitlementSlug": seats.Slug, "kind": "UNLIMITED", "value": 3, "reason": "r"}, fiber.StatusUnprocessableEntity, "CreateEntitlementException.InvalidValue"},
			{"NoValueOnSet", map[string]any{"entitlementSlug": seats.Slug, "kind": "SET", "reason": "r"}, fiber.StatusUnprocessableEntity, "CreateEntitlementException.InvalidValue"},
			{"ANumberOnABoolean", map[string]any{"entitlementSlug": sso.Slug, "kind": "SET", "value": 1, "reason": "r"}, fiber.StatusUnprocessableEntity, "CreateEntitlementException.InvalidValue"},
			{"AnArrayOnAConfig", map[string]any{"entitlementSlug": config.Slug, "kind": "SET", "value": []any{1}, "reason": "r"}, fiber.StatusUnprocessableEntity, "CreateEntitlementException.InvalidValue"},
			{"EndedAlready", map[string]any{"entitlementSlug": seats.Slug, "kind": "SET", "value": 1, "startsAt": time.Now().Add(-2 * time.Hour), "endsAt": time.Now().Add(-time.Hour), "reason": "r"}, fiber.StatusUnprocessableEntity, "CreateEntitlementException.InvalidWindow"},
			{"EndsBeforeItStarts", map[string]any{"entitlementSlug": seats.Slug, "kind": "SET", "value": 1, "startsAt": time.Now().Add(2 * time.Hour), "endsAt": time.Now().Add(time.Hour), "reason": "r"}, fiber.StatusUnprocessableEntity, "CreateEntitlementException.InvalidWindow"},
			{"ABlankReason", map[string]any{"entitlementSlug": seats.Slug, "kind": "SET", "value": 1, "reason": "   "}, fiber.StatusUnprocessableEntity, "CreateEntitlementException.ReasonRequired"},
			{"AnUnknownEntitlement", map[string]any{"entitlementSlug": "no-such-entitlement", "kind": "SET", "value": 1, "reason": "r"}, fiber.StatusNotFound, "CreateEntitlementException.EntitlementNotFound"},
		}
		for _, c := range cases {
			t.Run(c.name, func(t *testing.T) {
				require.Equal(t, c.code, refusedException(t, instance.Slug, c.body, c.status).Code)
			})
		}
		require.Empty(t, listExceptions(t, instance.Slug, "all"))

		require.Equal(t, "CreateEntitlementException.InstanceNotFound", refusedException(t, "no-such-instance",
			map[string]any{"entitlementSlug": seats.Slug, "kind": "SET", "value": 1, "reason": "r"}, fiber.StatusNotFound).Code)
		require.Equal(t, fiber.StatusNotFound, revokeException(t, instance.Slug, uuid.New()))
		require.Equal(t, fiber.StatusNotFound, revokeException(t, "no-such-instance", uuid.New()))
		resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, http.MethodGet, exceptionsPath("no-such-instance"), nil), fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, "ListEntitlementExceptions.InstanceNotFound", commonfixture.AssertJSONResponse[exceptionProblem](t, resp, fiber.StatusNotFound).Code)

		// A CONFIG document is taken as the vendor's object.
		document := createdException(t, instance.Slug, map[string]any{
			"entitlementSlug": config.Slug, "kind": "SET", "value": map[string]any{"region": "eu", "tier": 2}, "reason": "pilot",
		})
		require.JSONEq(t, `{"region":"eu","tier":2}`, string(document.Value))
		usage := usagesOf(t, instance.Slug)[config.Slug]
		require.Equal(t, instanceschema.SourceException, usage.Source)
		require.NotNil(t, usage.Value.Config)
	})
}
