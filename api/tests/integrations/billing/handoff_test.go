package billing_test

import (
	"sync"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/claimhandoff"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/listhandoff"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func claim(t *testing.T, body map[string]any) claimhandoff.HandoffClaim {
	t.Helper()
	return commonfixture.AssertJSONResponse[claimhandoff.HandoffClaim](t, call(t, "POST", "/api/billing/handoff/claim", body), fiber.StatusOK)
}

func ack(t *testing.T, invoiceID uuid.UUID, body map[string]any, status int) invoices.Invoice {
	t.Helper()
	return commonfixture.AssertJSONResponse[invoices.Invoice](t,
		call(t, "POST", "/api/billing/handoff/"+invoiceID.String()+"/ack", body), status)
}

// pendingInvoices subscribes n instances at 29.00 EUR, plus one free, and
// returns the n MANUAL activations, oldest first.
func pendingInvoices(t *testing.T, n int) []uuid.UUID {
	t.Helper()
	s := newSold(t, flatFee("2900", "MONTHLY"))
	free := createPrice(t, s.version.Slug, flatFee("0", "ANNUAL"))
	customer := newCustomer(t, "globex")
	ids := []uuid.UUID{subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID}).ActivationInvoice.ID}
	for i := 1; i < n; i++ {
		instance := newInstance(t, "Globex "+uuid.NewString()[:8], customer.ID, s.version.ID)
		ids = append(ids, subscribe(t, instance.Slug, map[string]any{"basePriceId": s.monthly.ID}).ActivationInvoice.ID)
	}
	instance := newInstance(t, "Free tier", customer.ID, s.version.ID)
	subscribe(t, instance.Slug, map[string]any{"basePriceId": free.ID})
	return ids
}

func TestHandoffQueue(t *testing.T) {
	t.Run("AClaim_LeasesTheOldestWaitingInvoices", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		ids := pendingInvoices(t, 3)

		first := claim(t, map[string]any{"limit": 2})
		require.Len(t, first.Invoices, 2)
		require.Equal(t, ids[0], first.Invoices[0].ID)
		require.Equal(t, ids[1], first.Invoices[1].ID)
		require.Equal(t, first.LeaseID, *first.Invoices[0].Handoff.LeaseID)
		require.EqualValues(t, 1, first.Invoices[0].Handoff.ClaimCount)
		require.NotNil(t, first.Invoices[0].BillingEmail, "the accounting system needs the address")

		second := claim(t, map[string]any{})
		require.Len(t, second.Invoices, 1, "the leased ones and the free invoice are not claimable")
		require.Equal(t, ids[2], second.Invoices[0].ID)
		require.Empty(t, claim(t, map[string]any{}).Invoices)

		exec(t, `UPDATE instance_invoice SET handoff_leased_until = now() - INTERVAL '1 second' WHERE id = $1`, ids[0])
		again := claim(t, map[string]any{})
		require.Len(t, again.Invoices, 1, "an expired lease is claimable again")
		require.EqualValues(t, 2, again.Invoices[0].Handoff.ClaimCount)
	})

	t.Run("ConcurrentClaims_GetDisjointInvoices", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		pendingInvoices(t, 6)
		var mu sync.Mutex
		seen := map[uuid.UUID]int{}
		var wg sync.WaitGroup
		for range 4 {
			wg.Go(func() {
				for _, invoice := range claim(t, map[string]any{"limit": 2}).Invoices {
					mu.Lock()
					seen[invoice.ID]++
					mu.Unlock()
				}
			})
		}
		wg.Wait()
		require.Len(t, seen, 6)
		for id, n := range seen {
			require.Equal(t, 1, n, "invoice %s claimed twice", id)
		}
	})

	t.Run("AnAcknowledgement_IsSafeToRepeat", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		pendingInvoices(t, 2)
		claimed := claim(t, map[string]any{"limit": 2})
		id := claimed.Invoices[0].ID

		acked := ack(t, id, map[string]any{"leaseId": claimed.LeaseID, "externalReference": "ERP-1"}, fiber.StatusOK)
		require.Equal(t, invoices.HandoffAcknowledged, acked.Handoff.Status)
		require.Nil(t, acked.Handoff.LeaseID)
		require.Equal(t, "ERP-1", *acked.Handoff.ExternalReference)
		require.NotNil(t, acked.Handoff.AcknowledgedAt)

		ack(t, id, map[string]any{"leaseId": claimed.LeaseID, "externalReference": "ERP-1"}, fiber.StatusOK)
		ack(t, id, map[string]any{}, fiber.StatusOK)
		require.Len(t, outboxPayloads(t, "INSTANCE_INVOICE_HANDOFF_ACKNOWLEDGED"), 1)
		require.Equal(t, "AckHandoff.ReferenceMismatch", problemCode(t, fiber.StatusConflict, "POST",
			"/api/billing/handoff/"+id.String()+"/ack", map[string]any{"externalReference": "ERP-2"}))

		other := claimed.Invoices[1].ID
		ack(t, other, map[string]any{}, fiber.StatusOK)
		filled := ack(t, other, map[string]any{"externalReference": "ERP-9"}, fiber.StatusOK)
		require.Equal(t, "ERP-9", *filled.Handoff.ExternalReference, "a later acknowledgement fills in the reference")
		require.Len(t, outboxPayloads(t, "INSTANCE_INVOICE_HANDOFF_ACKNOWLEDGED"), 2)
	})

	t.Run("ALeaseTakenByAnotherClaim_IsRefused", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		pendingInvoices(t, 1)
		old := claim(t, map[string]any{})
		id := old.Invoices[0].ID
		exec(t, `UPDATE instance_invoice SET handoff_leased_until = now() - INTERVAL '1 second' WHERE id = $1`, id)
		fresh := claim(t, map[string]any{})
		require.Equal(t, "AckHandoff.LeaseMismatch", problemCode(t, fiber.StatusConflict, "POST",
			"/api/billing/handoff/"+id.String()+"/ack", map[string]any{"leaseId": old.LeaseID}))
		ack(t, id, map[string]any{"leaseId": fresh.LeaseID}, fiber.StatusOK)
	})

	t.Run("AMarkPaid_AcknowledgesAndFreesTheLease", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		pendingInvoices(t, 1)
		claimed := claim(t, map[string]any{})
		id := claimed.Invoices[0].ID
		paid := act(t, id, "mark-paid", map[string]any{}, fiber.StatusOK)
		require.Equal(t, invoices.HandoffAcknowledged, paid.Handoff.Status)
		require.Nil(t, paid.Handoff.LeaseID)
		ack(t, id, map[string]any{"leaseId": claimed.LeaseID}, fiber.StatusOK)
	})

	t.Run("WhatIsNotInTheQueue_IsRefused", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("0", "MONTHLY"))
		free := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID}).ActivationInvoice.ID
		require.Equal(t, "AckHandoff.NotRequired", problemCode(t, fiber.StatusConflict, "POST",
			"/api/billing/handoff/"+free.String()+"/ack", map[string]any{}))
		require.Equal(t, "AckHandoff.NotFound", problemCode(t, fiber.StatusNotFound, "POST",
			"/api/billing/handoff/"+uuid.NewString()+"/ack", map[string]any{}))
		require.Equal(t, "ClaimHandoff.InvalidLimit", problemCode(t, fiber.StatusUnprocessableEntity, "POST",
			"/api/billing/handoff/claim", map[string]any{"limit": 101}))
		require.Equal(t, "ClaimHandoff.InvalidLeaseSeconds", problemCode(t, fiber.StatusUnprocessableEntity, "POST",
			"/api/billing/handoff/claim", map[string]any{"leaseSeconds": 30}))
	})

	t.Run("TheList_ReadsWithoutLeasing", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		ids := pendingInvoices(t, 3)
		list := func(query string) pagination.Page[listhandoff.QueuedInvoice] {
			return commonfixture.AssertJSONResponse[pagination.Page[listhandoff.QueuedInvoice]](t,
				call(t, "GET", "/api/billing/handoff"+query, nil), fiber.StatusOK)
		}
		pending := list("")
		require.Len(t, pending.Items, 3)
		require.Equal(t, ids[0], pending.Items[0].ID)
		page := list("?limit=2")
		require.True(t, page.HasMore)
		require.Len(t, list("?limit=2&cursor="+*page.NextCursor).Items, 1)

		require.Len(t, claim(t, map[string]any{"limit": 3}).Invoices, 3, "listing leased nothing")
		ack(t, ids[1], map[string]any{}, fiber.StatusOK)
		require.Len(t, list("?status=ACKNOWLEDGED").Items, 1)
		require.Len(t, list("?status=PENDING").Items, 2)
	})
}
