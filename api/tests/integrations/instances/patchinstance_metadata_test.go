package instances_test

import (
	"encoding/json"
	"fmt"
	"io"
	"sync"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	instanceEvents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// patchInstanceRaw sends body verbatim, so a test controls exactly which keys
// are present and which are JSON null.
func patchInstanceRaw(t *testing.T, slug, body string) (int, string) {
	t.Helper()
	req := commonfixture.NewJSONRequest(t, "PATCH", "/api/instances/"+slug, json.RawMessage(body))
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	respBody, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return resp.StatusCode, string(respBody)
}

func instanceUpdatedEvents(t *testing.T) int {
	t.Helper()
	return countInstanceUpdatedEvents(commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID))
}

func TestPatchInstanceMetadata(t *testing.T) {
	t.Run("SetReplaceRemove_KeepsKeysTheBodyDoesNotName", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]

		status, body := patchInstanceRaw(t, instance.Slug,
			`{"metadata":{"region":"eu","betaOptIn":["a","b"],"limits":{"seats":5},"retired":"x"}}`)
		require.Equal(t, fiber.StatusNoContent, status, body)
		require.Equal(t, map[string]any{
			"region": "eu", "betaOptIn": []any{"a", "b"}, "limits": map[string]any{"seats": float64(5)}, "retired": "x",
		}, storedInstance(t, instance.Slug).Metadata)
		require.Equal(t, 1, instanceUpdatedEvents(t))

		status, body = patchInstanceRaw(t, instance.Slug,
			`{"metadata":{"betaOptIn":["c"],"limits":{"sso":true},"retired":null,"tier":"gold"}}`)
		require.Equal(t, fiber.StatusNoContent, status, body)
		require.Equal(t, map[string]any{
			"region":    "eu",                        // not named: kept
			"betaOptIn": []any{"c"},                  // replaced whole
			"limits":    map[string]any{"sso": true}, // replaced whole, not deep-merged
			"tier":      "gold",                      // set
		}, storedInstance(t, instance.Slug).Metadata) // retired: removed by null

		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.Equal(t, 2, countInstanceUpdatedEvents(events))
		require.Zero(t, countStatusChangedEvents(events))
		require.Zero(t, countLifecycleStageChangedEvents(events))
		// The second INSTANCE_UPDATED carries the merged metadata.
		tiers := []any{}
		for _, event := range events {
			if event.EventName != instanceEvents.InstanceUpdated.Name {
				continue
			}
			var payload schema.Instance
			require.NoError(t, json.Unmarshal(event.Data, &payload))
			tiers = append(tiers, payload.Metadata["tier"])
		}
		require.ElementsMatch(t, []any{nil, "gold"}, tiers)
	})

	t.Run("WhenNothingChanges_WritesNoEventAndKeepsUpdatedAt", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		status, body := patchInstanceRaw(t, instance.Slug, `{"metadata":{"region":"eu"}}`)
		require.Equal(t, fiber.StatusNoContent, status, body)
		before := storedInstance(t, instance.Slug)
		require.Equal(t, 1, instanceUpdatedEvents(t))

		for _, noop := range []string{
			`{}`,                                    // metadata omitted
			`{"metadata":null}`,                     // null: huma reads it as omitted
			`{"metadata":{}}`,                       // empty
			`{"metadata":{"region":"eu"}}`,          // same value
			`{"metadata":{"neverSet":null}}`,        // removing an absent key
			`{"metadata":{"region":"eu","x":null}}`, // both at once
		} {
			status, body := patchInstanceRaw(t, instance.Slug, noop)
			require.Equal(t, fiber.StatusNoContent, status, "%s: %s", noop, body)
		}

		after := storedInstance(t, instance.Slug)
		require.Equal(t, before.Metadata, after.Metadata)
		require.True(t, before.UpdatedAt.Equal(after.UpdatedAt))
		require.Equal(t, 1, instanceUpdatedEvents(t))
	})

	t.Run("WhenDeclaredFieldRefusesTheMergedValue_Returns422AsPUTDoes", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]
		seedInstanceMetadataField(t, "betaOptIn", "Betas opted in",
			map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "uniqueItems": true}, 0)

		status, body := patchInstanceRaw(t, instance.Slug, `{"metadata":{"betaOptIn":["a"],"other":1}}`)
		require.Equal(t, fiber.StatusNoContent, status, body)

		status, body = patchInstanceRaw(t, instance.Slug, `{"metadata":{"betaOptIn":["a","a"],"other":2}}`)
		require.Equal(t, fiber.StatusUnprocessableEntity, status, body)
		require.Contains(t, body, "MetadataValidation.Failed")

		// Nothing of the refused PATCH was written, its valid key included.
		require.Equal(t, map[string]any{"betaOptIn": []any{"a"}, "other": float64(1)}, storedInstance(t, instance.Slug).Metadata)
		require.Equal(t, 1, instanceUpdatedEvents(t))
	})

	t.Run("StatusAndMetadataInOnePatch_BothApplyWithOneUpdatedEvent", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]

		status, body := patchInstanceRaw(t, instance.Slug, `{"status":"INCIDENT","metadata":{"region":"eu"}}`)
		require.Equal(t, fiber.StatusNoContent, status, body)

		stored := storedInstance(t, instance.Slug)
		require.Equal(t, schema.InstanceStatusIncident, stored.Status)
		require.Equal(t, map[string]any{"region": "eu"}, stored.Metadata)

		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.Equal(t, 1, countStatusChangedEvents(events))
		require.Equal(t, 1, countInstanceUpdatedEvents(events))
		updated, found := findInstanceUpdatedEvent(events)
		require.True(t, found)
		var payload schema.Instance
		require.NoError(t, json.Unmarshal(updated.Data, &payload))
		require.Equal(t, schema.InstanceStatusIncident, payload.Status)
		require.Equal(t, "eu", payload.Metadata["region"])
	})

	t.Run("ConcurrentPatchesOnDifferentKeys_LoseNothing", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newInstances(t, 1)[0]

		const writers = 8
		var wg sync.WaitGroup
		statuses := make([]int, writers)
		for i := range writers {
			wg.Go(func() {
				statuses[i], _ = patchInstanceRaw(t, instance.Slug, fmt.Sprintf(`{"metadata":{"key%d":%d}}`, i, i))
			})
		}
		wg.Wait()

		want := map[string]any{}
		for i := range writers {
			require.Equal(t, fiber.StatusNoContent, statuses[i])
			want[fmt.Sprintf("key%d", i)] = float64(i)
		}
		require.Equal(t, want, storedInstance(t, instance.Slug).Metadata)
	})
}
