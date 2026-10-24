// Package conformance is the contract every provider.Adapter keeps, as a test
// suite any adapter runs against itself: NOOP, the fake provider, and each
// real provider against its own sandbox or recordings.
package conformance

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
)

// Subject is an adapter under test, with the Ref it acts with.
type Subject struct {
	Adapter provider.Adapter
	Ref     provider.Ref
}

// Run checks the contract. An adapter that does not push invoices must
// refuse every push call with provider.ErrUnsupported and void locally; one
// that pushes must be idempotent on every step and report its changes.
// contractDaysUntilDue is the contract invoice's payment terms.
var contractDaysUntilDue int32 = 30

func Run(t *testing.T, newSubject func(t *testing.T) Subject) {
	t.Helper()
	t.Run("CapabilitiesAreConsistent", func(t *testing.T) {
		s := newSubject(t)
		capabilities := s.Adapter.Capabilities()
		if capabilities.EventFeed && !capabilities.PushesInvoices {
			t.Fatalf("%s reports an event feed without pushing invoices", s.Adapter.Kind())
		}
		if s.Adapter.Kind() == "" {
			t.Fatal("an adapter names its kind")
		}
	})
	t.Run("AutomaticCollectionIsRefusedWithoutTheCapability", func(t *testing.T) {
		s := newSubject(t)
		capabilities := s.Adapter.Capabilities()
		ctx := context.Background()
		if !capabilities.PaymentMethodCapture {
			if _, err := s.Adapter.CreateSetupSession(ctx, s.Ref, provider.SetupSession{}); !errors.Is(err, provider.ErrUnsupported) {
				t.Fatalf("CreateSetupSession without the capability answered %v, not ErrUnsupported", err)
			}
		}
		if !capabilities.BillingPortal {
			if _, err := s.Adapter.CreateBillingPortalSession(ctx, s.Ref, "cus", "https://example.test"); !errors.Is(err, provider.ErrUnsupported) {
				t.Fatalf("CreateBillingPortalSession without the capability answered %v, not ErrUnsupported", err)
			}
		}
	})
	t.Run("PushContract", func(t *testing.T) {
		s := newSubject(t)
		if s.Adapter.Capabilities().PushesInvoices {
			pushContract(t, s)
		} else {
			localContract(t, s)
		}
	})
}

// localContract: a provider that does not push answers ErrUnsupported to
// every push call, and voids locally.
func localContract(t *testing.T, s Subject) {
	t.Helper()
	ctx := context.Background()
	if _, err := s.Adapter.EnsureCustomer(ctx, s.Ref, provider.Customer{}); !errors.Is(err, provider.ErrUnsupported) {
		t.Fatalf("EnsureCustomer answered %v, not ErrUnsupported", err)
	}
	if _, err := s.Adapter.CreateDraft(ctx, s.Ref, provider.NormalizedInvoice{}); !errors.Is(err, provider.ErrUnsupported) {
		t.Fatalf("CreateDraft answered %v, not ErrUnsupported", err)
	}
	if _, err := s.Adapter.GetInvoice(ctx, s.Ref, "in"); !errors.Is(err, provider.ErrUnsupported) {
		t.Fatalf("GetInvoice answered %v, not ErrUnsupported", err)
	}
	if _, _, err := s.Adapter.ListInvoiceEvents(ctx, s.Ref, "", time.Time{}); !errors.Is(err, provider.ErrUnsupported) {
		t.Fatalf("ListInvoiceEvents answered %v, not ErrUnsupported", err)
	}
	if err := s.Adapter.VoidInvoice(ctx, s.Ref, "in"); err != nil {
		t.Fatalf("a local void succeeds, got %v", err)
	}
}

// pushContract: every step is idempotent, the invoice read back is what was
// pushed, a void removes it, and the feed reports the changes.
func pushContract(t *testing.T, s Subject) {
	t.Helper()
	ctx := context.Background()
	customerID := uuid.New()
	customer := provider.Customer{CustomerID: customerID, ExternalID: "", Name: "Acme", Email: "billing@acme.test", Metadata: nil}
	first, err := s.Adapter.EnsureCustomer(ctx, s.Ref, customer)
	if err != nil {
		t.Fatalf("EnsureCustomer: %v", err)
	}
	customer.ExternalID = first.ExternalID
	again, err := s.Adapter.EnsureCustomer(ctx, s.Ref, customer)
	if err != nil || again.ExternalID != first.ExternalID {
		t.Fatalf("EnsureCustomer is idempotent: got %q (%v), want %q", again.ExternalID, err, first.ExternalID)
	}

	// A base of 29.00 bearing a 30 % discount (DISCOUNT line seq 2): the
	// discount reaches the provider as a discount on the base, never as a
	// negative line (CR-001).
	start := time.Now().UTC()
	discountLine := uuid.New()
	invoice := provider.NormalizedInvoice{
		KaitenInvoiceID: uuid.New(), ExternalCustomerID: first.ExternalID, Kind: "RENEWAL", BoundaryAt: start,
		// Billing always sends a SEND_INVOICE invoice's terms; Stripe refuses one
		// without them.
		Currency: "EUR", CollectionMethod: "SEND_INVOICE", DaysUntilDue: &contractDaysUntilDue, TotalMinor: 2030,
		Lines: []provider.NormalizedLine{
			{LineID: uuid.New(), Seq: 1, AmountMinor: 2900, Description: "Pro — base", ServiceFrom: start, ServiceTo: start.AddDate(0, 1, 0)},
		},
		Discounts: []provider.NormalizedDiscount{
			{LineID: discountLine, Seq: 2, TargetSeq: 1, AmountMinor: 870, Label: "Launch −30%", VoucherID: uuid.New()},
		},
		Metadata: nil,
	}
	draft, err := s.Adapter.CreateDraft(ctx, s.Ref, invoice)
	if err != nil {
		t.Fatalf("CreateDraft: %v", err)
	}
	if replay, err := s.Adapter.CreateDraft(ctx, s.Ref, invoice); err != nil || replay.ExternalID != draft.ExternalID {
		t.Fatalf("CreateDraft is idempotent on the Kaiten invoice: got %q (%v), want %q", replay.ExternalID, err, draft.ExternalID)
	}
	found, err := s.Adapter.FindInvoice(ctx, s.Ref, first.ExternalID, invoice.KaitenInvoiceID)
	if err != nil || found == nil || found.ExternalID != draft.ExternalID {
		t.Fatalf("FindInvoice finds the draft of a Kaiten invoice: got %+v (%v)", found, err)
	}
	discountID, err := s.Adapter.AddDiscount(ctx, s.Ref, draft.ExternalID, invoice, invoice.Discounts[0])
	if err != nil {
		t.Fatalf("AddDiscount: %v", err)
	}
	if replay, err := s.Adapter.AddDiscount(ctx, s.Ref, draft.ExternalID, invoice, invoice.Discounts[0]); err != nil || replay != discountID {
		t.Fatalf("AddDiscount is idempotent on the allocation: got %q (%v), want %q", replay, err, discountID)
	}
	conflicting := invoice.Discounts[0]
	conflicting.AmountMinor = 900
	// Refused as a conflict, or, within a key horizon, as changed parameters.
	if _, err := s.Adapter.AddDiscount(ctx, s.Ref, draft.ExternalID, invoice, conflicting); provider.ClassOf(err) != provider.ClassRejected &&
		provider.ClassOf(err) != provider.ClassParametersChanged {
		t.Fatalf("the same allocation with another amount is refused, got %v", err)
	}
	negative := provider.NormalizedLine{LineID: uuid.New(), Seq: 9, AmountMinor: -1, Description: "negative", ServiceFrom: start, ServiceTo: start}
	if _, err := s.Adapter.AddLine(ctx, s.Ref, draft.ExternalID, invoice, negative); err == nil {
		t.Fatal("a negative line is refused")
	}
	invoice.Lines[0].Discounts = []provider.LineDiscount{{Seq: 2, ExternalID: discountID, AmountMinor: 870}}
	for _, line := range invoice.Lines {
		id, err := s.Adapter.AddLine(ctx, s.Ref, draft.ExternalID, invoice, line)
		if err != nil {
			t.Fatalf("AddLine %d: %v", line.Seq, err)
		}
		if replay, err := s.Adapter.AddLine(ctx, s.Ref, draft.ExternalID, invoice, line); err != nil || replay != id {
			t.Fatalf("AddLine is idempotent on the line: got %q (%v), want %q", replay, err, id)
		}
	}
	read, err := s.Adapter.GetInvoice(ctx, s.Ref, draft.ExternalID)
	if err != nil {
		t.Fatalf("GetInvoice: %v", err)
	}
	if read.Status != provider.StatusDraft || len(read.Lines) != len(invoice.Lines) || read.TotalExcludingTax != invoice.TotalMinor ||
		read.Subtotal != invoice.TotalMinor || read.TotalDiscount != 870 {
		// The subtotal has the item-level discounts taken off already, as
		// Stripe test mode has it.
		t.Fatalf("the draft read back is what was pushed: %+v", read)
	}
	if got := read.Lines[0].Discounts; len(got) != 1 || got[0].ExternalID != discountID || got[0].AmountMinor != 870 || read.Lines[0].AmountMinor != 2900 {
		t.Fatalf("the base reads back at its gross amount, bearing the discount: %+v", read.Lines[0])
	}

	finalized, err := s.Adapter.Finalize(ctx, s.Ref, draft.ExternalID, invoice)
	if err != nil {
		t.Fatalf("Finalize: %v", err)
	}
	if finalized.Status != provider.StatusOpen || finalized.FinalizedAt == nil {
		t.Fatalf("a finalized invoice is open, with its finalization instant: %+v", finalized)
	}
	if replay, err := s.Adapter.Finalize(ctx, s.Ref, draft.ExternalID, invoice); err != nil || replay.Status != provider.StatusOpen {
		t.Fatalf("Finalize is idempotent: got %+v (%v)", replay, err)
	}
	for range 2 {
		if err := s.Adapter.DeleteDiscount(ctx, s.Ref, discountID); err != nil {
			t.Fatalf("deleting a discount once the invoice is finalized succeeds, again too: %v", err)
		}
	}
	if read, err := s.Adapter.GetInvoice(ctx, s.Ref, draft.ExternalID); err != nil || read.TotalExcludingTax != invoice.TotalMinor {
		t.Fatalf("a deleted discount stays applied to the finalized invoice: %+v (%v)", read, err)
	}

	if err := s.Adapter.VoidInvoice(ctx, s.Ref, draft.ExternalID); err != nil {
		t.Fatalf("VoidInvoice: %v", err)
	}
	if err := s.Adapter.VoidInvoice(ctx, s.Ref, draft.ExternalID); err != nil {
		t.Fatalf("voiding a void invoice again succeeds, got %v", err)
	}
	if read, err := s.Adapter.GetInvoice(ctx, s.Ref, draft.ExternalID); err != nil || read.Status != provider.StatusVoid {
		t.Fatalf("a voided invoice reads void: %+v (%v)", read, err)
	}

	other := invoice
	other.KaitenInvoiceID = uuid.New()
	otherDraft, err := s.Adapter.CreateDraft(ctx, s.Ref, other)
	if err != nil {
		t.Fatalf("CreateDraft: %v", err)
	}
	if err := s.Adapter.VoidInvoice(ctx, s.Ref, otherDraft.ExternalID); err != nil {
		t.Fatalf("voiding a draft deletes it: %v", err)
	}
	if _, err := s.Adapter.GetInvoice(ctx, s.Ref, otherDraft.ExternalID); provider.ClassOf(err) != provider.ClassNotFound {
		t.Fatalf("a deleted draft reads NOT_FOUND, got %v", err)
	}

	if s.Adapter.Capabilities().EventFeed {
		feed, next, err := s.Adapter.ListInvoiceEvents(ctx, s.Ref, "", start.Add(-time.Minute))
		if err != nil {
			t.Fatalf("ListInvoiceEvents: %v", err)
		}
		if len(feed) == 0 || next == "" {
			t.Fatalf("the feed reports the finalization and the void: %+v", feed)
		}
		if after, _, err := s.Adapter.ListInvoiceEvents(ctx, s.Ref, next, time.Time{}); err != nil || len(after) != 0 {
			t.Fatalf("the feed resumes after its cursor: %+v (%v)", after, err)
		}
	}
}
