package billing_test

import (
	"net/url"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func listInvoices(t *testing.T, path string) pagination.Page[invoices.InvoiceSummary] {
	t.Helper()
	return commonfixture.AssertJSONResponse[pagination.Page[invoices.InvoiceSummary]](t, call(t, "GET", path, nil), fiber.StatusOK)
}

func TestInvoiceReads(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	before := time.Now().UTC().Add(-time.Second)
	acme := newSold(t, flatFee("2900", "MONTHLY"))
	globexCustomer := newCustomer(t, "globex")
	globex := newInstance(t, "Globex prod", globexCustomer.ID, acme.version.ID)
	first := subscribe(t, acme.instance.Slug, map[string]any{"basePriceId": acme.monthly.ID})
	subscribe(t, globex.Slug, map[string]any{"basePriceId": acme.monthly.ID})
	backdate(t, first.ID, 2)
	require.Equal(t, 2, closePeriods(t, map[string]any{}).Closed)

	t.Run("TheList_IsNewestFirst_AndPages", func(t *testing.T) {
		all := listInvoices(t, "/api/invoices")
		require.Len(t, all.Items, 4)
		for i := 1; i < len(all.Items); i++ {
			require.False(t, all.Items[i].CreatedAt.After(all.Items[i-1].CreatedAt))
		}

		page := listInvoices(t, "/api/invoices?limit=3")
		require.Len(t, page.Items, 3)
		require.True(t, page.HasMore)
		rest := listInvoices(t, "/api/invoices?limit=3&cursor="+url.QueryEscape(*page.NextCursor))
		require.Len(t, rest.Items, 1)
		require.False(t, rest.HasMore)
		require.Equal(t, all.Items[3].ID, rest.Items[0].ID)

		require.Equal(t, "Invoices.InvalidCursor", problemCode(t, fiber.StatusBadRequest, "GET", "/api/invoices?cursor=garbage", nil))
	})

	t.Run("TheFilters_Narrow_It", func(t *testing.T) {
		count := func(query string) int { return len(listInvoices(t, "/api/invoices?"+query).Items) }
		require.Equal(t, 2, count("kind=RENEWAL"))
		require.Equal(t, 2, count("kind=ACTIVATION"))
		require.Equal(t, 4, count("status=MANUAL"))
		require.Equal(t, 4, count("status=MANUAL&status=PAID"))
		require.Equal(t, 0, count("status=PAID"))
		require.Equal(t, 1, count("customerSlug="+globexCustomer.Slug))
		require.Equal(t, 3, count("instanceSlug="+acme.instance.Slug))
		require.Equal(t, 4, count("handoffStatus=PENDING"))
		require.Equal(t, 0, count("held=true"))
		require.Equal(t, 4, count("providerKind=NOOP"))
		// The renewals bill the backdated anchor's next two months; the second
		// is the boundary the activation billed before it was backdated.
		require.Equal(t, 1, count("boundaryTo="+url.QueryEscape(first.AnchorAt.AddDate(0, -1, 0).Add(time.Second).Format(time.RFC3339))))

		exec(t, `UPDATE instance_invoice SET due_at = issued_at, days_until_due = 0 WHERE customer_slug = $1`, globexCustomer.Slug)
		require.Equal(t, 1, count("overdue=true"))

		require.Equal(t, "ListInvoices.InvalidFilter", problemCode(t, fiber.StatusUnprocessableEntity, "GET",
			"/api/invoices?issuedFrom=2027-01-02T00:00:00Z&issuedTo=2027-01-01T00:00:00Z", nil))
	})

	t.Run("UpdatedSince_IsOldestChangeFirst", func(t *testing.T) {
		changed := listInvoices(t, "/api/invoices?updatedSince="+url.QueryEscape(before.Format(time.RFC3339Nano)))
		require.Len(t, changed.Items, 4)
		for i := 1; i < len(changed.Items); i++ {
			require.False(t, changed.Items[i].UpdatedAt.Before(changed.Items[i-1].UpdatedAt))
		}
		page := listInvoices(t, "/api/invoices?limit=2&updatedSince="+url.QueryEscape(before.Format(time.RFC3339Nano)))
		next := listInvoices(t, "/api/invoices?limit=2&updatedSince="+url.QueryEscape(before.Format(time.RFC3339Nano))+"&cursor="+url.QueryEscape(*page.NextCursor))
		require.Equal(t, changed.Items[2].ID, next.Items[0].ID)
		require.Empty(t, listInvoices(t, "/api/invoices?updatedSince="+url.QueryEscape(time.Now().UTC().Add(time.Hour).Format(time.RFC3339))).Items)
	})

	t.Run("AnInstancesInvoices_SpanItsSubscription", func(t *testing.T) {
		require.Len(t, listInvoices(t, "/api/instances/"+acme.instance.Slug+"/invoices").Items, 3)
		require.Len(t, listInvoices(t, "/api/instances/"+acme.instance.Slug+"/invoices?kind=RENEWAL").Items, 2)
		require.Equal(t, "ListInstanceInvoices.InstanceNotFound", problemCode(t, fiber.StatusNotFound, "GET", "/api/instances/nope/invoices", nil))
		lonely := newInstance(t, "Lonely", globexCustomer.ID, acme.version.ID)
		require.Empty(t, listInvoices(t, "/api/instances/"+lonely.Slug+"/invoices").Items)
	})

	t.Run("AnInvoice_ReadsWithItsLines", func(t *testing.T) {
		summary := listInvoices(t, "/api/invoices?kind=RENEWAL&limit=1").Items[0]
		invoice := commonfixture.AssertJSONResponse[invoices.Invoice](t, call(t, "GET", "/api/invoices/"+summary.ID.String(), nil), fiber.StatusOK)
		require.Equal(t, summary, invoice.InvoiceSummary)
		require.Len(t, invoice.Lines, 1)
		require.NotNil(t, invoice.Lines[0].ID)
		require.Equal(t, "billing@acme.test", *invoice.BillingEmail, "an authenticated read carries the address")
		require.Equal(t, invoices.HandoffPending, invoice.Handoff.Status)
		require.Equal(t, "GetInvoice.NotFound", problemCode(t, fiber.StatusNotFound, "GET", "/api/invoices/00000000-0000-0000-0000-000000000001", nil))
	})
}

func TestUpcomingInvoice(t *testing.T) {
	t.Run("ItPreviewsTheNextBoundary_OnTheUsageSoFar", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := meteredSold(t)
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		reportTokens(t, s.instance.Slug, 130500)

		preview := commonfixture.AssertJSONResponse[rating.InvoicePreview](t,
			call(t, "GET", "/api/instances/"+s.instance.Slug+"/billing/upcoming-invoice", nil), fiber.StatusOK)
		require.Equal(t, "PREVIEW", preview.Status)
		require.Equal(t, rating.KindRenewal, preview.Kind)
		require.True(t, preview.BoundaryAt.Equal(started.CurrentPeriodEnd))
		require.Len(t, preview.Lines, 2)
		require.EqualValues(t, 2440, preview.Lines[0].Amount)
		require.True(t, preview.Lines[0].ServiceTo.Equal(started.CurrentPeriodEnd), "the line bills the whole period")
		require.EqualValues(t, 5340, preview.Total)
		require.Empty(t, preview.WouldHold)
		require.Empty(t, listInvoices(t, "/api/invoices?kind=RENEWAL").Items, "a preview writes nothing")

		exec(t, `UPDATE usage_ledger SET value_after = 5 WHERE instance_id = $1`, s.instance.ID)
		preview = commonfixture.AssertJSONResponse[rating.InvoicePreview](t,
			call(t, "GET", "/api/instances/"+s.instance.Slug+"/billing/upcoming-invoice", nil), fiber.StatusOK)
		require.Len(t, preview.WouldHold, 1)
	})

	t.Run("WithoutALiveSubscription_ThereIsNone", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		path := "/api/instances/" + s.instance.Slug + "/billing/upcoming-invoice"
		require.Equal(t, "GetUpcomingInvoice.NotFound", problemCode(t, fiber.StatusNotFound, "GET", path, nil))
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		exec(t, `UPDATE instance_billing SET status = 'CANCELED', canceled_at = now() WHERE id = $1`, started.ID)
		require.Equal(t, "GetUpcomingInvoice.NotActive", problemCode(t, fiber.StatusConflict, "GET", path, nil))
	})
}
