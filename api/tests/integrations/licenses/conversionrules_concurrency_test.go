package licenses_test

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	fixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func concurrentRuleRequests(t *testing.T, requests []*http.Request) []*http.Response {
	t.Helper()
	responses := make([]*http.Response, len(requests))
	errs := make([]error, len(requests))
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i, req := range requests {
		wg.Add(1)
		go func(i int, req *http.Request) {
			defer wg.Done()
			<-start
			responses[i], errs[i] = testServer.App.Test(req, fiber.TestConfig{})
		}(i, req)
	}
	close(start)
	wg.Wait()
	for i, err := range errs {
		require.NoError(t, err)
		r := responses[i]
		t.Cleanup(func() { fixture.MustCloseBody(t, r.Body) })
	}
	return responses
}

func TestConversionRulesConcurrentIdentityAndArchive(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	path := ruleFixture(t)
	for _, model := range []bool{false, true} {
		for _, typed := range []bool{false, true} {
			b := ruleBody()
			if model {
				b["modelSlug"] = "ai-model"
			}
			if typed {
				b["requestType"] = "COMPLETION"
			}
			rs := concurrentRuleRequests(t, []*http.Request{fixture.NewJSONRequest(t, "POST", "/api"+path, b), fixture.NewJSONRequest(t, "POST", "/api"+path, b)})
			statuses := []int{rs[0].StatusCode, rs[1].StatusCode}
			require.ElementsMatch(t, []int{201, 409}, statuses)
		}
	}
	rules := fixture.AssertJSONResponse[[]schema.ConversionRule](t, ruleRequest(t, "GET", path, nil), 200)
	require.Len(t, rules, 4)
	target := "/api" + path + "/" + rules[0].ID.String()
	rs := concurrentRuleRequests(t, []*http.Request{fixture.NewJSONRequest(t, "DELETE", target, nil), fixture.NewJSONRequest(t, "DELETE", target, nil)})
	for _, r := range rs {
		require.Equal(t, 204, r.StatusCode)
	}
	created, archived := 0, 0
	for _, e := range fixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
		if e.EventName == "LICENSE_CONVERSION_RULE_CREATED" {
			created++
		}
		if e.EventName == "LICENSE_CONVERSION_RULE_ARCHIVED" {
			archived++
		}
	}
	require.Equal(t, 4, created)
	require.Equal(t, 1, archived)
}

func TestConversionRulesConcurrentUpdatesAndArchive(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	path := ruleFixture(t)
	r := createRule(t, path, ruleBody())
	target := "/api" + path + "/" + r.ID.String()
	one := map[string]any{"rates": map[string]any{"perRequest": "1"}}
	two := map[string]any{"rates": map[string]any{"perRequest": "2"}}
	rs := concurrentRuleRequests(t, []*http.Request{fixture.NewJSONRequest(t, "PUT", target, one), fixture.NewJSONRequest(t, "PUT", target, two)})
	for _, r := range rs {
		require.Equal(t, 200, r.StatusCode)
	}
	var updates []schema.ConversionRuleUpdated
	for _, e := range fixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
		if e.EventName == "LICENSE_CONVERSION_RULE_UPDATED" {
			var u schema.ConversionRuleUpdated
			require.NoError(t, json.Unmarshal(e.Data, &u))
			updates = append(updates, u)
		}
	}
	require.Len(t, updates, 2)
	// One update must start with the other update's committed price, not both
	// with the original vector: snapshots must be serialized with writes.
	chained := *updates[0].Before.Rates.PerRequest == *updates[1].After.Rates.PerRequest || *updates[1].Before.Rates.PerRequest == *updates[0].After.Rates.PerRequest
	require.True(t, chained)
	rs = concurrentRuleRequests(t, []*http.Request{fixture.NewJSONRequest(t, "PUT", target, one), fixture.NewJSONRequest(t, "DELETE", target, nil)})
	require.Contains(t, []int{200, 409}, rs[0].StatusCode)
	require.Equal(t, 204, rs[1].StatusCode)
	final := fixture.AssertJSONResponse[schema.ConversionRule](t, ruleRequest(t, "GET", path+"/"+r.ID.String(), nil), 200)
	require.Equal(t, schema.ConversionRuleArchived, final.Status)
}

func TestConversionRuleCreateWaitsForCatalogueStatus(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	path := ruleFixture(t)
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()
	tx, err := testServer.Dependencies.DB.Begin(ctx)
	require.NoError(t, err)
	defer func() { _ = tx.Rollback(context.Background()) }()
	_, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended('models:' || $1::uuid::text,0))`, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	b := ruleBody()
	b["modelSlug"] = "ai-model"
	req := fixture.NewJSONRequest(t, "POST", "/api"+path, b)
	done := make(chan *http.Response, 1)
	errors := make(chan error, 1)
	go func() { r, err := testServer.App.Test(req, fiber.TestConfig{}); errors <- err; done <- r }()
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	for {
		var blocked bool
		err = testServer.Dependencies.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event='advisory' AND query LIKE '%models:%')`).Scan(&blocked)
		require.NoError(t, err)
		if blocked {
			break
		}
		select {
		case <-ctx.Done():
			t.Fatal("create did not wait for catalogue lock")
		case <-ticker.C:
		}
	}
	_, err = tx.Exec(ctx, `UPDATE model SET status='DEPRECATED' WHERE organization_id=$1`, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	require.NoError(t, tx.Commit(ctx))
	require.NoError(t, <-errors)
	response := <-done
	t.Cleanup(func() { fixture.MustCloseBody(t, response.Body) })
	require.Equal(t, 422, response.StatusCode)
	require.Empty(t, fixture.AssertJSONResponse[[]schema.ConversionRule](t, ruleRequest(t, "GET", path, nil), 200))
}
