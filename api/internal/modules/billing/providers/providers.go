// Package providers is how billing reaches the payment providers that issue
// its invoices: resolving the one an invoice or a subscription routes to,
// bounding each call, ensuring the provider's customer, describing an invoice
// to it, and mapping its failures to the API's answers.
//
// Calls never run inside a transaction: callers persist their intent, call,
// then persist the result in a transaction of their own.
package providers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// DefaultTimeout bounds a provider call when the configuration says nothing.
const DefaultTimeout = 30 * time.Second

// Connect resolves the provider an invoice or a subscription routes to.
// provider.ErrNotConnected when the organization has not connected it.
func Connect(ctx context.Context, registry provider.Registry, organizationID uuid.UUID, kind db.BillingProviderKind) (*provider.Connection, error) {
	if registry == nil {
		return nil, provider.ErrNotConnected
	}
	return registry.Resolve(ctx, organizationID, provider.Kind(kind))
}

// Bound is ctx limited to one provider call.
func Bound(ctx context.Context, timeout time.Duration) (context.Context, context.CancelFunc) {
	if timeout <= 0 {
		timeout = DefaultTimeout
	}
	return context.WithTimeout(ctx, timeout)
}

// APIError is a provider failure as a synchronous use case answers it.
func APIError(operation string, err error) error {
	switch {
	case errors.Is(err, provider.ErrNotConnected):
		return kaitenerrors.UnprocessableEntity(operation+".ProviderNotConnected", "the payment provider is not connected for this organization")
	case errors.Is(err, provider.ErrUnsupported):
		return kaitenerrors.UnprocessableEntity(operation+".CapabilityUnsupported", "the payment provider does not support this operation")
	}
	var providerErr *provider.Error
	if !errors.As(err, &providerErr) {
		return kaitenerrors.Unavailable(operation+".ProviderUnavailable", "the payment provider could not be reached; retry in a moment")
	}
	switch providerErr.Class {
	case provider.ClassNotConnected:
		return kaitenerrors.UnprocessableEntity(operation+".ProviderNotConnected",
			"the payment provider refused the organization's credentials: "+providerErr.Message)
	case provider.ClassRejected:
		return kaitenerrors.UnprocessableEntityWithErrors(operation+".ProviderRejected", "the payment provider refused the request: "+providerErr.Message,
			&kaitenerrors.ErrorDetail{Message: "provider error", Location: "provider", Value: map[string]string{
				"providerCode": providerErr.Code, "providerParam": providerErr.Param, "providerRequestId": providerErr.RequestID,
			}})
	case provider.ClassCustomerMissing:
		return kaitenerrors.Conflict(operation+".ProviderCustomerMissing",
			"the payment provider's customer is gone while invoices of it are open there")
	case provider.ClassParametersChanged:
		return kaitenerrors.Internal(operation+".ProviderConflict", "the payment provider refused a repeated request whose parameters changed")
	default:
		return kaitenerrors.Unavailable(operation+".ProviderUnavailable", "the payment provider could not be reached; retry in a moment")
	}
}

// Customer is what billing tells a provider about a customer.
type Customer struct {
	ID    uuid.UUID
	Name  string
	Email string
}

// EnsureCustomer makes sure the provider knows the customer, and records its
// id in customer_billing. Idempotent: the provider's customer is created
// once, and only its e-mail is updated afterwards.
func EnsureCustomer(ctx context.Context, q *db.Queries, conn *provider.Connection, organizationID uuid.UUID, customer Customer, timeout time.Duration, now time.Time) (string, error) {
	kind := db.BillingProviderKind(conn.Adapter.Kind())
	existing, err := q.GetCustomerBilling(ctx, db.GetCustomerBillingParams{
		OrganizationID: organizationID, CustomerID: customer.ID, ProviderKind: kind,
	})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	callCtx, cancel := Bound(ctx, timeout)
	defer cancel()
	record, err := conn.Adapter.EnsureCustomer(callCtx, conn.Ref, provider.Customer{
		CustomerID: customer.ID, ExternalID: existing.ExternalCustomerID, Name: customer.Name, Email: customer.Email,
		Metadata: map[string]string{"kaiten_customer_id": customer.ID.String(), "kaiten_organization_id": organizationID.String()},
	})
	if err != nil {
		return "", err
	}
	var webURL *string
	if record.WebURL != "" {
		webURL = &record.WebURL
	}
	if err := q.UpsertCustomerBilling(ctx, db.UpsertCustomerBillingParams{
		CustomerID: customer.ID, OrganizationID: organizationID, ProviderKind: kind,
		ExternalCustomerID: record.ExternalID, WebUrl: webURL, Now: invoices.Timestamp(now),
	}); err != nil {
		return "", err
	}
	return record.ExternalID, nil
}

// Normalize describes a stored invoice to its provider, with the lines it
// holds; daysUntilDue applies to SEND_INVOICE. DISCOUNT lines are not lines
// there: each of their allocations is a provider discount
// (Discounts), borne by its target line (NormalizedLine.Discounts, with the
// provider's id once recorded on the DISCOUNT line), so that no line is ever
// negative (CR-001).
func Normalize(row db.InstanceInvoice, externalCustomerID string, daysUntilDue *int32) (provider.NormalizedInvoice, []rating.InvoiceLine, error) {
	var lines []rating.InvoiceLine
	if err := json.Unmarshal(row.Lines, &lines); err != nil {
		return provider.NormalizedInvoice{}, nil, fmt.Errorf("decode lines of invoice %s: %w", row.ID, err)
	}
	normalized := provider.NormalizedInvoice{
		KaitenInvoiceID: row.ID, ExternalCustomerID: externalCustomerID, Kind: string(row.Kind),
		BoundaryAt: row.BoundaryAt.Time.UTC(), Currency: row.Currency, CollectionMethod: string(row.CollectionMethod),
		DaysUntilDue: nil, Lines: make([]provider.NormalizedLine, 0, len(lines)), Discounts: nil, TotalMinor: row.TotalMinor,
		Metadata: map[string]string{
			"kaiten_invoice_id": row.ID.String(), "kaiten_organization_id": row.OrganizationID.String(),
			"kaiten_instance_billing_id": row.InstanceBillingID.String(), "kind": string(row.Kind),
			"boundary_at": row.BoundaryAt.Time.UTC().Format(time.RFC3339),
		},
	}
	if row.CollectionMethod == db.CollectionMethodSENDINVOICE {
		normalized.DaysUntilDue = daysUntilDue
	}
	borne := map[int][]provider.LineDiscount{}
	for _, line := range lines {
		if line.ID == nil {
			return provider.NormalizedInvoice{}, nil, fmt.Errorf("line %d of invoice %s has no id", line.Seq, row.ID)
		}
		if line.Type != rating.LineDiscount || line.Discount == nil {
			continue
		}
		var voucher uuid.UUID
		if line.VoucherID != nil {
			voucher = *line.VoucherID
		}
		for i, a := range line.Discount.Allocations {
			normalized.Discounts = append(normalized.Discounts, provider.NormalizedDiscount{
				LineID: *line.ID, Seq: line.Seq, TargetSeq: a.TargetSeq, AmountMinor: a.Amount, Label: line.Label, VoucherID: voucher,
			})
			external := ""
			if line.Provider != nil && i < len(line.Provider.CouponIDs) {
				external = line.Provider.CouponIDs[i]
			}
			borne[a.TargetSeq] = append(borne[a.TargetSeq], provider.LineDiscount{Seq: line.Seq, ExternalID: external, AmountMinor: a.Amount})
		}
	}
	for _, line := range lines {
		if line.Type == rating.LineDiscount {
			continue
		}
		normalized.Lines = append(normalized.Lines, provider.NormalizedLine{
			LineID: *line.ID, Seq: line.Seq, AmountMinor: line.Amount, Description: line.Label + " — " + line.Description,
			ServiceFrom: line.ServiceFrom, ServiceTo: line.ServiceTo, Discounts: borne[line.Seq], Recreation: 0,
		})
	}
	return normalized, lines, nil
}

// UnallocatedDiscount is a DISCOUNT line composed before allocations
// existed: it cannot reach a provider without being negative, so the push
// refuses it, and a void and recompose gives it its allocations.
func UnallocatedDiscount(lines []rating.InvoiceLine) error {
	for _, line := range lines {
		if line.Type == rating.LineDiscount && line.Amount != 0 && (line.Discount == nil || len(line.Discount.Allocations) == 0) {
			return &provider.Error{
				Class: provider.ClassRejected, Code: "discount_unallocated", Param: "", RequestID: "",
				Message: fmt.Sprintf("DISCOUNT line %d has no allocations; void and recompose the invoice", line.Seq),
			}
		}
	}
	return nil
}

// RequirePaymentMethod refuses automatic collection for a customer without
// an ACTIVE payment method in the provider: nothing could be charged
// (<operation>.PaymentMethodRequired).
func RequirePaymentMethod(ctx context.Context, q *db.Queries, organizationID, customerID uuid.UUID, kind db.BillingProviderKind, operation string) error {
	row, err := q.GetCustomerBilling(ctx, db.GetCustomerBillingParams{OrganizationID: organizationID, CustomerID: customerID, ProviderKind: kind})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if err == nil && row.PaymentMethodStatus == db.PaymentMethodStatusACTIVE {
		return nil
	}
	return kaitenerrors.UnprocessableEntity(operation+".PaymentMethodRequired",
		"the customer has no usable payment method to charge: save one through a payment-method session first")
}

// IsNotFound reports a provider failure saying the object asked for does not
// exist (an unknown session, a deleted draft).
func IsNotFound(err error) bool {
	var providerErr *provider.Error
	return errors.As(err, &providerErr) && providerErr.Class == provider.ClassNotFound
}
