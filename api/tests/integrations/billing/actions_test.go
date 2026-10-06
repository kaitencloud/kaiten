package billing_test

import (
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/closing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/billableusage"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/billablecatalogue"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func act(t *testing.T, invoiceID uuid.UUID, action string, body map[string]any, status int) invoices.Invoice {
	t.Helper()
	return commonfixture.AssertJSONResponse[invoices.Invoice](t,
		call(t, "POST", "/api/invoices/"+invoiceID.String()+"/"+action, body), status)
}

func getInvoice(t *testing.T, id uuid.UUID) invoices.Invoice {
	t.Helper()
	return commonfixture.AssertJSONResponse[invoices.Invoice](t, call(t, "GET", "/api/invoices/"+id.String(), nil), fiber.StatusOK)
}

// activation subscribes an instance at 29.00 EUR a month and returns its
// MANUAL ACTIVATION invoice.
func activation(t *testing.T) uuid.UUID {
	t.Helper()
	s := newSold(t, flatFee("2900", "MONTHLY"))
	return subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID}).ActivationInvoice.ID
}

// heldRenewal closes a period whose journal has a broken chain and returns
// the held invoice and the instance it bills.
func heldRenewal(t *testing.T) (uuid.UUID, sold) {
	t.Helper()
	s := meteredSold(t)
	started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
	reportTokens(t, s.instance.Slug, 110000)
	reportTokens(t, s.instance.Slug, 20000)
	exec(t, `UPDATE usage_ledger SET value_before = 999 WHERE instance_id = $1 AND report_seq = 2`, s.instance.ID)
	backdate(t, started.ID, 1)
	exec(t, `UPDATE usage_ledger SET reported_at = reported_at - INTERVAL '1 month' WHERE instance_id = $1`, s.instance.ID)
	report := closePeriods(t, map[string]any{})
	require.Equal(t, 1, report.Held)
	return report.Invoices[0].ID, s
}

func mendJournal(t *testing.T, s sold) {
	t.Helper()
	exec(t, `UPDATE usage_ledger SET value_before = 110000 WHERE instance_id = $1 AND report_seq = 2`, s.instance.ID)
}

func TestMarkInvoicePaid(t *testing.T) {
	t.Run("AManualInvoice_IsPaid_AndItsHandoffAcknowledged", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		id := activation(t)
		paid := act(t, id, "mark-paid", map[string]any{"externalReference": "INV-2027-001", "note": "wire 42"}, fiber.StatusOK)
		require.Equal(t, invoices.StatusPaid, paid.Status)
		require.WithinDuration(t, time.Now(), *paid.PaidAt, time.Minute)
		require.Equal(t, invoices.HandoffAcknowledged, paid.Handoff.Status)
		require.Equal(t, "INV-2027-001", *paid.Handoff.ExternalReference)
		events := outboxPayloads(t, "INSTANCE_INVOICE_PAID")
		require.Len(t, events, 1)
		require.Equal(t, "MARK_PAID", events[0]["source"])
		require.Equal(t, "wire 42", events[0]["note"])
		require.Len(t, outboxPayloads(t, "INSTANCE_INVOICE_HANDOFF_ACKNOWLEDGED"), 1)

		again := act(t, id, "mark-paid", map[string]any{"externalReference": "INV-2027-001"}, fiber.StatusOK)
		require.Equal(t, paid.PaidAt, again.PaidAt)
		require.Len(t, outboxPayloads(t, "INSTANCE_INVOICE_PAID"), 1, "a replay records nothing")
		require.Equal(t, "MarkInvoicePaid.InvalidStatus", problemCode(t, fiber.StatusConflict, "POST",
			"/api/invoices/"+id.String()+"/mark-paid", map[string]any{"externalReference": "OTHER"}))
	})

	t.Run("APaymentDate_IsNowOrEarlier", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		id := activation(t)
		require.Equal(t, "MarkInvoicePaid.PaidAtInFuture", problemCode(t, fiber.StatusUnprocessableEntity, "POST",
			"/api/invoices/"+id.String()+"/mark-paid", map[string]any{"paidAt": time.Now().UTC().Add(time.Hour)}))
		paidAt := time.Now().UTC().AddDate(0, 0, -3).Truncate(time.Millisecond)
		paid := act(t, id, "mark-paid", map[string]any{"paidAt": paidAt}, fiber.StatusOK)
		require.True(t, paid.PaidAt.Equal(paidAt))
	})

	t.Run("AnInvoiceHandedOffUnderAnotherReference_IsRefused", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		id := activation(t)
		exec(t, `UPDATE instance_invoice SET external_reference = 'ERP-1' WHERE id = $1`, id)
		require.Equal(t, "MarkInvoicePaid.ReferenceMismatch", problemCode(t, fiber.StatusConflict, "POST",
			"/api/invoices/"+id.String()+"/mark-paid", map[string]any{"externalReference": "ERP-2"}))
	})

	t.Run("OnlyAManualInvoice_CanBeMarkedPaid", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("0", "MONTHLY"))
		free := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID}).ActivationInvoice.ID
		require.Equal(t, "MarkInvoicePaid.InvalidStatus", problemCode(t, fiber.StatusConflict, "POST",
			"/api/invoices/"+free.String()+"/mark-paid", map[string]any{}))
		require.Equal(t, "MarkInvoicePaid.NotFound", problemCode(t, fiber.StatusNotFound, "POST",
			"/api/invoices/"+uuid.NewString()+"/mark-paid", map[string]any{}))
	})
}

func TestWriteOffAndVoid(t *testing.T) {
	t.Run("AManualInvoice_IsWrittenOff_OnceForAll", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		id := activation(t)
		require.Equal(t, "WriteOffInvoice.ReasonRequired", problemCode(t, fiber.StatusUnprocessableEntity, "POST",
			"/api/invoices/"+id.String()+"/write-off", map[string]any{"reason": ""}))
		off := act(t, id, "write-off", map[string]any{"reason": "customer gone"}, fiber.StatusOK)
		require.Equal(t, invoices.StatusUncollectible, off.Status)
		require.NotNil(t, off.UncollectibleAt)
		require.Equal(t, invoices.HandoffPending, off.Handoff.Status, "its consumer sees the new status")
		act(t, id, "write-off", map[string]any{"reason": "again"}, fiber.StatusOK)
		require.Len(t, outboxPayloads(t, "INSTANCE_INVOICE_MARKED_UNCOLLECTIBLE"), 1)
		require.Equal(t, "VoidInvoice.InvalidStatus", problemCode(t, fiber.StatusConflict, "POST",
			"/api/invoices/"+id.String()+"/void", map[string]any{"reason": "too late"}))
	})

	t.Run("AManualInvoice_IsVoided_OnceForAll", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		id := activation(t)
		void := act(t, id, "void", map[string]any{"reason": "wrong price"}, fiber.StatusOK)
		require.Equal(t, invoices.StatusVoid, void.Status)
		require.Equal(t, "wrong price", *void.VoidReason)
		act(t, id, "void", map[string]any{"reason": "again"}, fiber.StatusOK)
		require.Len(t, outboxPayloads(t, "INSTANCE_INVOICE_VOIDED"), 1)
		require.Equal(t, "MarkInvoicePaid.InvalidStatus", problemCode(t, fiber.StatusConflict, "POST",
			"/api/invoices/"+id.String()+"/mark-paid", map[string]any{}))
	})

	t.Run("AHeldDraftVoided_LeavesItsHold", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		id, _ := heldRenewal(t)
		void := act(t, id, "void", map[string]any{"reason": "journal broken"}, fiber.StatusOK)
		require.Equal(t, invoices.StatusVoid, void.Status)
		require.Nil(t, void.HoldReason)
	})
}

func TestReleaseAndRecompose(t *testing.T) {
	t.Run("AReleasedInvoice_IsIssuedAsComposed", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		id, _ := heldRenewal(t)
		released := act(t, id, "release-hold", map[string]any{"reason": "reviewed by finance"}, fiber.StatusOK)
		require.Equal(t, invoices.StatusManual, released.Status)
		require.Nil(t, released.HoldReason)
		require.Nil(t, released.HoldDetail)
		require.Equal(t, "reviewed by finance", *released.Hold.ReleaseReason)
		require.Equal(t, testDb.DefaultData.UserID, *released.Hold.ReleasedBy)
		require.Equal(t, invoices.HandoffPending, released.Handoff.Status)
		events := outboxPayloads(t, "INSTANCE_INVOICE_RELEASED")
		require.Len(t, events, 1)
		require.NotEmpty(t, events[0]["holdDetail"].(map[string]any)["pairs"])
		require.Len(t, outboxPayloads(t, "INSTANCE_INVOICE_ISSUED"), 2, "the activation, then the released renewal")
		require.Equal(t, "ReleaseInvoiceHold.NotHeld", problemCode(t, fiber.StatusConflict, "POST",
			"/api/invoices/"+id.String()+"/release-hold", map[string]any{"reason": "twice"}))
	})

	t.Run("AHeldInvoiceRecomposed_IsIssued_OnceItsJournalIsSound", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		id, s := heldRenewal(t)
		still := act(t, id, "recompose", nil, fiber.StatusOK)
		require.Equal(t, invoices.StatusDraft, still.Status)
		require.NotNil(t, still.HoldReason, "the journal is still broken")

		mendJournal(t, s)
		recomposed := act(t, id, "recompose", nil, fiber.StatusOK)
		require.Equal(t, id, recomposed.ID)
		require.Equal(t, invoices.StatusManual, recomposed.Status)
		require.Equal(t, "recomposed", *recomposed.Hold.ReleaseReason)
		require.Len(t, recomposed.Lines, 2)
		require.EqualValues(t, 2400, recomposed.Lines[0].Amount, "130,000 tokens, 30,000 above the limit: 3 × 8.00 EUR")
		require.Len(t, outboxPayloads(t, "INSTANCE_INVOICE_RELEASED"), 1)
	})

	t.Run("AVoidInvoiceRecomposed_GetsOneReplacement", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		id := activation(t)
		require.Equal(t, "RecomposeInvoice.InvalidStatus", problemCode(t, fiber.StatusConflict, "POST",
			"/api/invoices/"+id.String()+"/recompose", nil))
		act(t, id, "void", map[string]any{"reason": "terms changed"}, fiber.StatusOK)

		replacement := act(t, id, "recompose", nil, fiber.StatusCreated)
		require.NotEqual(t, id, replacement.ID)
		require.Equal(t, id, *replacement.ReplacesInvoiceID)
		require.Equal(t, invoices.StatusManual, replacement.Status)
		require.EqualValues(t, 2900, replacement.Total)
		require.Equal(t, replacement.ID, *getInvoice(t, id).ReplacedByInvoiceID)

		problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t,
			call(t, "POST", "/api/invoices/"+id.String()+"/recompose", nil), fiber.StatusConflict)
		require.Equal(t, "RecomposeInvoice.AlreadyReplaced", problem.Code)
		require.Len(t, problem.Errors, 1)
	})

	t.Run("TheClose_ReleasesAHoldWhoseJournalMended", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		id, s := heldRenewal(t)
		unit := uow.NewUnitOfWork(testDb.DbPool)
		closer := closing.New(access.Deps{
			UserProvider: nil, Uof: unit, Gate: gate.New(true, services.AlwaysEntitled{}),
			Catalogue: billablecatalogue.New(unit), Usage: billableusage.New(testDb.DbPool, unit),
		}, 0)

		released, err := closer.RecheckHeld(t.Context(), 10)
		require.NoError(t, err)
		require.Zero(t, released)

		mendJournal(t, s)
		released, err = closer.RecheckHeld(t.Context(), 10)
		require.NoError(t, err)
		require.Equal(t, 1, released)
		invoice := getInvoice(t, id)
		require.Equal(t, invoices.StatusManual, invoice.Status)
		require.Equal(t, closing.AutoReleaseReason, *invoice.Hold.ReleaseReason)
		require.Nil(t, invoice.Hold.ReleasedBy)
		events := outboxPayloads(t, "INSTANCE_INVOICE_RELEASED")
		require.Len(t, events, 1)
		require.Equal(t, "system", events[0]["releasedBy"])
	})
}
