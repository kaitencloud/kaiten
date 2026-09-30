package instances_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getinstance"
	instancedb "github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/integrations/upsertintegration"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// TestInstanceLicenseAssignment_ArchivedVersions covers the rule the
// instance_license_not_archived trigger enforces: an archived license
// version is withdrawn from sale, so no instance may be created on it or moved
// onto it, while an instance already pinned to it keeps it and stays editable.
// Drafts stay assignable, so a vendor can test a version before publishing it.
//
// The states are set with SQL rather than through PUT /licenses: what is under
// test is the assignment, not the way a version got archived.
func TestInstanceLicenseAssignment_ArchivedVersions(t *testing.T) {
	t.Run("WhenCreatingOnAnArchivedVersion_Returns422AndCreatesNothing", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		customer := newCustomer(t)
		license := newLicense(t)
		setLicenseLifecycleState(t, license.ID, "ARCHIVED")

		problem := sendInstanceRequest[kaitenerrors.Problem](t, http.MethodPost, "/api/instances",
			newInstancePayload(customer.ID, license.ID), fiber.StatusUnprocessableEntity)

		require.Equal(t, "CreateInstance.LicenseArchived", problem.Code)
		require.Zero(t, countInstances(t), "no instance row must be created")
	})

	t.Run("WhenCreatingOnADraftVersion_CreatesTheInstance", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		customer := newCustomer(t)
		license := newLicense(t)
		setLicenseLifecycleState(t, license.ID, "DRAFT")

		created := sendInstanceRequest[schema.Instance](t, http.MethodPost, "/api/instances",
			newInstancePayload(customer.ID, license.ID), fiber.StatusCreated)

		require.Equal(t, license.ID, created.LicenseID,
			"a draft can be tried on an instance before it is published")
	})

	t.Run("WhenMovingAnInstanceOntoAnArchivedVersion_Returns422AndKeepsItsLicense", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		archived := newLicense(t)
		setLicenseLifecycleState(t, archived.ID, "ARCHIVED")

		payload := updatePayloadFrom(instance)
		payload.LicenseID = archived.ID
		problem := sendInstanceRequest[kaitenerrors.Problem](t, http.MethodPut, "/api/instances/"+instance.Slug,
			payload, fiber.StatusUnprocessableEntity)

		require.Equal(t, "UpdateInstance.LicenseArchived", problem.Code)
		require.Equal(t, instance.LicenseID, storedInstance(t, instance.Slug).LicenseID,
			"a refused move leaves the instance on its license")
	})

	// Pinned access stays pinned: archiving a version withdraws it from sale,
	// it does not freeze the instances already running on it.
	t.Run("WhenTheInstancesOwnVersionIsArchivedLater_TheInstanceStaysEditable", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		setLicenseLifecycleState(t, instance.LicenseID, "ARCHIVED")

		payload := updatePayloadFrom(instance)
		payload.Name = "Renamed while pinned to an archived version"
		req := commonfixture.NewJSONRequest(t, http.MethodPut, "/api/instances/"+instance.Slug, payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		stored := storedInstance(t, instance.Slug)
		require.Equal(t, payload.Name, stored.Name)
		require.Equal(t, instance.LicenseID, stored.LicenseID)
	})

	// The trigger looks the license up inside the instance's organization, like
	// the composite foreign key, so another tenant's archived version is
	// reported as missing rather than revealed as archived.
	t.Run("WhenAnArchivedVersionBelongsToAnotherOrganization_Returns404", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		customer := newCustomer(t)
		neighbourLicense := newLicenseIn(t, newNeighbourOrganization(t))
		setLicenseLifecycleState(t, neighbourLicense.ID, "ARCHIVED")

		problem := sendInstanceRequest[kaitenerrors.Problem](t, http.MethodPost, "/api/instances",
			newInstancePayload(customer.ID, neighbourLicense.ID), fiber.StatusNotFound)

		require.Equal(t, "CreateInstance.LicenseNotFound", problem.Code)
		require.Zero(t, countInstances(t))
	})

	// The trigger locks the license row FOR SHARE, which conflicts with the lock
	// an archive takes: an assignment that starts while an archive of the same
	// version is still open waits for it, then sees ARCHIVED. Without that lock
	// the trigger would read the state the archive has not committed yet, and
	// the instance would land on a version withdrawn a moment earlier.
	t.Run("WhenAnArchiveCommitsWhileTheAssignmentWaits_Returns422", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		customer := newCustomer(t)
		license := newLicense(t)

		archive, err := testServer.Dependencies.DB.Begin(t.Context())
		require.NoError(t, err)
		defer func() { _ = archive.Rollback(context.Background()) }()
		_, err = archive.Exec(t.Context(),
			`UPDATE "license" SET "lifecycle_state" = 'ARCHIVED' WHERE "id" = $1`, license.ID)
		require.NoError(t, err)

		req := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/instances",
			newInstancePayload(customer.ID, license.ID))
		type result struct {
			status int
			body   kaitenerrors.Problem
			err    error
		}
		created := make(chan result, 1)
		go func() {
			resp, err := testServer.App.Test(req, fiber.TestConfig{})
			if err != nil {
				created <- result{err: err}
				return
			}
			defer func() { _ = resp.Body.Close() }()
			var out result
			out.status = resp.StatusCode
			out.err = json.NewDecoder(resp.Body).Decode(&out.body)
			created <- out
		}()

		waitUntilABackendWaitsOnALock(t)
		require.NoError(t, archive.Commit(t.Context()))

		got := <-created
		require.NoError(t, got.err)
		require.Equal(t, fiber.StatusUnprocessableEntity, got.status)
		require.Equal(t, "CreateInstance.LicenseArchived", got.body.Code)
		require.Zero(t, countInstances(t))
	})

	// The integration upsert creates instances through the same use case, and
	// the trigger guards the table itself, so the third write path refuses too.
	t.Run("WhenTheIntegrationUpsertCreatesOnAnArchivedVersion_Returns422", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		customer := newCustomer(t)
		license := newLicense(t)
		setLicenseLifecycleState(t, license.ID, "ARCHIVED")
		const (
			adapter            = "kaiten.integration.crm.attio"
			customerExternalID = "rec_customer_archived"
			instanceExternalID = "rec_workspace_archived"
		)
		sendInstanceRequest[customerschema.CustomerIntegration](t, http.MethodPost,
			"/api/customers/"+customer.Slug+"/integrations/"+adapter,
			customerschema.CustomerIntegration{ExternalID: customerExternalID}, http.StatusCreated)

		problem := sendInstanceRequest[kaitenerrors.Problem](t, http.MethodPatch,
			"/api/integration/crm.attio/instance/"+instanceExternalID,
			upsertintegration.InstanceBody{
				CustomerExternalID: ptr.To(customerExternalID),
				Description:        ptr.To("Created by the CRM on an archived version"),
				EndLicenseDate:     timePointer(time.Now().AddDate(1, 0, 0).UTC()),
				LicenseID:          &license.ID,
				Name:               ptr.To("External workspace"),
				StartLicenseDate:   timePointer(time.Now().UTC()),
			}, fiber.StatusUnprocessableEntity)

		require.Equal(t, "CreateInstance.LicenseArchived", problem.Code)
		require.Zero(t, countInstances(t))
	})
}

// waitUntilABackendWaitsOnALock blocks until some backend on the test
// database is waiting on a row lock -- here, the assignment queued behind the
// archive -- so the test commits the archive only once the two really overlap.
func waitUntilABackendWaitsOnALock(t *testing.T) {
	t.Helper()

	const attempts = 100
	for range attempts {
		var blocked bool
		err := testServer.Dependencies.DB.QueryRow(t.Context(),
			`SELECT EXISTS (SELECT 1
			                FROM pg_stat_activity
			                WHERE datname = current_database()
			                  AND wait_event_type = 'Lock'
			                  AND state = 'active')`).Scan(&blocked)
		require.NoError(t, err)
		if blocked {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("the assignment never waited on the archive: the trigger no longer locks the license row")
}

func setLicenseLifecycleState(t *testing.T, licenseID uuid.UUID, state string) {
	t.Helper()
	_, err := testServer.Dependencies.DB.Exec(t.Context(),
		`UPDATE "license" SET "lifecycle_state" = $1::license_lifecycle_state WHERE "id" = $2`,
		state, licenseID)
	require.NoError(t, err)
}

func newInstancePayload(customerID, licenseID uuid.UUID) schema.Instance {
	return schema.Instance{
		Name:             "Assignment check",
		Description:      "An instance naming a license version",
		StartLicenseDate: time.Now().UTC(),
		EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
		Metadata:         map[string]any{},
		LicenseID:        licenseID,
		CustomerID:       customerID,
	}
}

// updatePayloadFrom is the full representation PUT /instances/{slug} expects,
// as a client that read the instance would send it back.
func updatePayloadFrom(instance *schema.Instance) schema.Instance {
	metadata := instance.Metadata
	if metadata == nil {
		metadata = map[string]any{}
	}
	return schema.Instance{
		Name:             instance.Name,
		Description:      instance.Description,
		StartLicenseDate: instance.StartLicenseDate,
		EndLicenseDate:   instance.EndLicenseDate,
		Metadata:         metadata,
		LicenseID:        instance.LicenseID,
		CustomerID:       instance.CustomerID,
	}
}

func sendInstanceRequest[T any](t *testing.T, method, path string, body any, wantStatus int) T {
	t.Helper()
	req := commonfixture.NewJSONRequest(t, method, path, body)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	return commonfixture.AssertJSONResponse[T](t, resp, wantStatus)
}

func storedInstance(t *testing.T, slug string) *schema.Instance {
	t.Helper()
	repo := getinstance.NewQueryRepository(instancedb.New(testServer.Dependencies.DB))
	stored, err := repo.GetInstance(t.Context(), slug, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	return stored
}
