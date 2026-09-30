package instances_test

import (
	"encoding/json"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	outboxdb "github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox/db"
	instanceEvents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getinstance"
	instancedb "github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

type instanceStatusChangedPayload struct {
	InstanceID     uuid.UUID             `json:"instance_id"`
	PreviousStatus schema.InstanceStatus `json:"previous_status"`
	NewStatus      schema.InstanceStatus `json:"new_status"`
	ChangedBy      uuid.UUID             `json:"changed_by"`
}

type instanceLifecycleStageChangedPayload struct {
	InstanceID             uuid.UUID `json:"instance_id"`
	PreviousLifecycleStage *string   `json:"previous_lifecycle_stage"`
	NewLifecycleStage      *string   `json:"new_lifecycle_stage"`
	ChangedBy              uuid.UUID `json:"changed_by"`
}

func TestPatchInstanceStatus(t *testing.T) {
	t.Run("WhenStatusChanges_UpdatesStatusAndDispatchesEvent", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		payload := map[string]schema.InstanceStatus{
			"status": schema.InstanceStatusIncident,
		}

		req := commonfixture.NewJSONRequest(t, "PATCH", "/api/instances/"+instance.Slug, payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		repo := getinstance.NewQueryRepository(instancedb.New(testServer.Dependencies.DB))
		updated, err := repo.GetInstance(t.Context(), instance.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, schema.InstanceStatusIncident, updated.Status)

		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		event, found := findStatusChangedEvent(events)
		require.True(t, found, "Expected INSTANCE_STATUS_CHANGED event to be present")
		require.Equal(t, instanceEvents.InstanceStatusChanged.Type, event.EventType)

		var eventPayload instanceStatusChangedPayload
		require.NoError(t, json.Unmarshal(event.Data, &eventPayload))
		require.Equal(t, instance.ID, eventPayload.InstanceID)
		require.Equal(t, schema.InstanceStatusHealthy, eventPayload.PreviousStatus)
		require.Equal(t, schema.InstanceStatusIncident, eventPayload.NewStatus)
		require.Equal(t, testDb.DefaultData.UserID, eventPayload.ChangedBy)

		var headers outbox.AuditHeaders
		require.NoError(t, json.Unmarshal(event.Headers, &headers))
		require.NotNil(t, headers.InstanceID)
		require.Equal(t, instance.ID, *headers.InstanceID)

		updatedEvent, found := findInstanceUpdatedEvent(events)
		require.True(t, found, "Expected INSTANCE_UPDATED event to be present")
		var updatedPayload schema.Instance
		require.NoError(t, json.Unmarshal(updatedEvent.Data, &updatedPayload))
		require.Equal(t, instance.ID, updatedPayload.ID)
		require.Equal(t, instance.Slug, updatedPayload.Slug)
		require.Equal(t, schema.InstanceStatusIncident, updatedPayload.Status)
	})

	t.Run("WhenStatusIsInvalid_Returns422", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]

		req := commonfixture.NewJSONRequest(t, "PATCH", "/api/instances/"+instance.Slug, map[string]string{
			"status": "BROKEN",
		})
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
	})

	t.Run("WhenStatusIsUnchanged_DoesNotWriteEventOrUpdatedAt", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		repo := getinstance.NewQueryRepository(instancedb.New(testServer.Dependencies.DB))
		before, err := repo.GetInstance(t.Context(), instance.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		req := commonfixture.NewJSONRequest(t, "PATCH", "/api/instances/"+instance.Slug, map[string]schema.InstanceStatus{
			"status": schema.InstanceStatusHealthy,
		})
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		after, err := repo.GetInstance(t.Context(), instance.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, schema.InstanceStatusHealthy, after.Status)
		require.True(t, before.UpdatedAt.Equal(after.UpdatedAt))

		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.Zero(t, countStatusChangedEvents(events))
		require.Zero(t, countInstanceUpdatedEvents(events))
	})

	t.Run("WhenInstanceDoesNotExist_Returns404", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		req := commonfixture.NewJSONRequest(t, "PATCH", "/api/instances/nonexistent-slug", map[string]schema.InstanceStatus{
			"status": schema.InstanceStatusIncident,
		})
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})

	t.Run("WhenInstanceIsDeleted_Returns404", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]

		deleteReq := commonfixture.NewJSONRequest(t, "DELETE", "/api/instances/"+instance.Slug, nil)
		deleteResp, err := testServer.App.Test(deleteReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, deleteResp.Body)
		require.Equal(t, fiber.StatusNoContent, deleteResp.StatusCode)

		req := commonfixture.NewJSONRequest(t, "PATCH", "/api/instances/"+instance.Slug, map[string]schema.InstanceStatus{
			"status": schema.InstanceStatusIncident,
		})
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})
}

func TestPatchInstanceLifecycleStage(t *testing.T) {
	t.Run("WhenLifecycleStageChanges_PersistsAndDispatchesEvent", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]

		req := commonfixture.NewJSONRequest(t, "PATCH", "/api/instances/"+instance.Slug, map[string]string{
			"lifecycleStage": "AT_RISK",
		})
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		repo := getinstance.NewQueryRepository(instancedb.New(testServer.Dependencies.DB))
		updated, err := repo.GetInstance(t.Context(), instance.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, updated.LifecycleStage)
		require.Equal(t, "AT_RISK", *updated.LifecycleStage)

		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		event, found := findLifecycleStageChangedEvent(events)
		require.True(t, found, "Expected INSTANCE_LIFECYCLE_STAGE_CHANGED event to be present")
		require.Equal(t, instanceEvents.InstanceLifecycleStageChanged.Type, event.EventType)

		var eventPayload instanceLifecycleStageChangedPayload
		require.NoError(t, json.Unmarshal(event.Data, &eventPayload))
		require.Equal(t, instance.ID, eventPayload.InstanceID)
		require.Nil(t, eventPayload.PreviousLifecycleStage)
		require.NotNil(t, eventPayload.NewLifecycleStage)
		require.Equal(t, "AT_RISK", *eventPayload.NewLifecycleStage)
		require.Equal(t, testDb.DefaultData.UserID, eventPayload.ChangedBy)

		var headers outbox.AuditHeaders
		require.NoError(t, json.Unmarshal(event.Headers, &headers))
		require.NotNil(t, headers.InstanceID)
		require.Equal(t, instance.ID, *headers.InstanceID)

		updatedEvent, found := findInstanceUpdatedEvent(events)
		require.True(t, found, "Expected INSTANCE_UPDATED event to be present")
		var updatedPayload schema.Instance
		require.NoError(t, json.Unmarshal(updatedEvent.Data, &updatedPayload))
		require.Equal(t, instance.ID, updatedPayload.ID)
		require.Equal(t, instance.Slug, updatedPayload.Slug)
		require.NotNil(t, updatedPayload.LifecycleStage)
		require.Equal(t, "AT_RISK", *updatedPayload.LifecycleStage)
	})

	t.Run("WhenLifecycleStageIsCustomValue_IsAccepted", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]

		req := commonfixture.NewJSONRequest(t, "PATCH", "/api/instances/"+instance.Slug, map[string]string{
			"lifecycleStage": "PILOT",
		})
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		repo := getinstance.NewQueryRepository(instancedb.New(testServer.Dependencies.DB))
		updated, err := repo.GetInstance(t.Context(), instance.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, updated.LifecycleStage)
		require.Equal(t, "PILOT", *updated.LifecycleStage)
	})

	t.Run("WhenLifecycleStageIsEmpty_Returns422", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]

		req := commonfixture.NewJSONRequest(t, "PATCH", "/api/instances/"+instance.Slug, map[string]string{
			"lifecycleStage": "",
		})
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
	})

	t.Run("WhenLifecycleStageUnchanged_DoesNotWriteEvent", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]

		first := commonfixture.NewJSONRequest(t, "PATCH", "/api/instances/"+instance.Slug, map[string]string{
			"lifecycleStage": "TRIAL",
		})
		firstResp, err := testServer.App.Test(first, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, firstResp.Body)
		require.Equal(t, fiber.StatusNoContent, firstResp.StatusCode)

		second := commonfixture.NewJSONRequest(t, "PATCH", "/api/instances/"+instance.Slug, map[string]string{
			"lifecycleStage": "TRIAL",
		})
		secondResp, err := testServer.App.Test(second, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, secondResp.Body)
		require.Equal(t, fiber.StatusNoContent, secondResp.StatusCode)

		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.Equal(t, 1, countLifecycleStageChangedEvents(events))
		require.Equal(t, 1, countInstanceUpdatedEvents(events))
	})
}

func findInstanceUpdatedEvent(events []outboxdb.OutboxEvent) (*outboxdb.OutboxEvent, bool) {
	for i := range events {
		if events[i].EventName == instanceEvents.InstanceUpdated.Name {
			return &events[i], true
		}
	}
	return nil, false
}

func countInstanceUpdatedEvents(events []outboxdb.OutboxEvent) int {
	count := 0
	for _, event := range events {
		if event.EventName == instanceEvents.InstanceUpdated.Name {
			count++
		}
	}
	return count
}

func findLifecycleStageChangedEvent(events []outboxdb.OutboxEvent) (*outboxdb.OutboxEvent, bool) {
	for i := range events {
		if events[i].EventName == instanceEvents.InstanceLifecycleStageChanged.Name {
			return &events[i], true
		}
	}
	return nil, false
}

func countLifecycleStageChangedEvents(events []outboxdb.OutboxEvent) int {
	count := 0
	for _, event := range events {
		if event.EventName == instanceEvents.InstanceLifecycleStageChanged.Name {
			count++
		}
	}
	return count
}

func findStatusChangedEvent(events []outboxdb.OutboxEvent) (*outboxdb.OutboxEvent, bool) {
	for i := range events {
		if events[i].EventName == instanceEvents.InstanceStatusChanged.Name {
			return &events[i], true
		}
	}
	return nil, false
}

func countStatusChangedEvents(events []outboxdb.OutboxEvent) int {
	count := 0
	for _, event := range events {
		if event.EventName == instanceEvents.InstanceStatusChanged.Name {
			count++
		}
	}
	return count
}
