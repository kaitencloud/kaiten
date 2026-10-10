package rating

import (
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/shared/nullable"
)

// InvoiceLine is one invoice line as the API returns it. It explains itself: its
// amount is recomputable from its quantity and unit amount, and a metered
// line's quantity from its measured quantity and sale-unit factor.
//
// The schema is open on purpose: ADDON and DISCOUNT lines, and the members they
// carry, arrive in later releases, and a generated client must not break on them.
type InvoiceLine struct {
	_ struct{} `additionalProperties:"true"`

	ID                *uuid.UUID           `json:"id,omitempty" doc:"The line's identifier, stable for the invoice's life; absent on a preview"`
	Seq               int                  `json:"seq" doc:"Position on the invoice, from 1"`
	Type              LineType             `json:"type" enum:"BASE,ADDON,USAGE,OVERAGE,DISCOUNT" doc:"BASE: the subscription's FLAT_FEE price. ADDON: an add-on's FLAT_FEE price times the quantity held at the boundary. USAGE: a USAGE_BASED price's metered usage. OVERAGE: an OVERAGE price's usage above the licence's limit. DISCOUNT: a PRICE voucher's discount, negative."`
	BillingModel      *string              `json:"billingModel" enum:"FLAT_FEE,USAGE_BASED,OVERAGE" doc:"The price's billing model; absent on a DISCOUNT line"`
	BillingTiming     *string              `json:"billingTiming" enum:"ADVANCE,ARREARS" doc:"ADVANCE lines bill the period that starts at the boundary, ARREARS lines the one that ends there; absent on a DISCOUNT line"`
	LicensePriceID    *uuid.UUID           `json:"licensePriceId" doc:"The licence price the line bills; null on an ADDON line"`
	AddonPriceID      *uuid.UUID           `json:"addonPriceId" doc:"The add-on price an ADDON line bills"`
	AddonID           *uuid.UUID           `json:"addonId" doc:"The add-on version an ADDON line bills"`
	InstanceAddonID   *uuid.UUID           `json:"instanceAddonId" doc:"The instance's attachment an ADDON line bills"`
	VoucherID         *uuid.UUID           `json:"voucherId" doc:"The voucher a DISCOUNT line applies"`
	InstanceVoucherID *uuid.UUID           `json:"instanceVoucherId" doc:"The redemption a DISCOUNT line applies"`
	EntitlementID     *uuid.UUID           `json:"entitlementId" doc:"The metered entitlement, on USAGE and OVERAGE lines"`
	EntitlementSlug   *string              `json:"entitlementSlug" doc:"Its slug, as it was when the line was composed"`
	Label             string               `json:"label" doc:"The price's display label, else a derived one" example:"Tokens — overage"`
	Description       string               `json:"description" doc:"The arithmetic of the line" example:"3.05 × 8.00 EUR (per 10k tokens); 130,500 used; 30,500 above the applied limit (100,000)"`
	ServiceFrom       time.Time            `json:"serviceFrom" doc:"Start of the period the line bills (inclusive)"`
	ServiceTo         time.Time            `json:"serviceTo" doc:"End of the period the line bills (exclusive)"`
	Quantity          string               `json:"quantity" doc:"In sale units, a decimal string: 1 on a BASE line, the quantity held on an ADDON line" example:"3.05"`
	UnitAmountDecimal *string              `json:"unitAmountDecimal" doc:"The price's unit amount in minor units; absent on a DISCOUNT line" example:"800"`
	Amount            int64                `json:"amount" doc:"round_half_up(quantity × unitAmountDecimal), in minor units; negative on a DISCOUNT line" example:"2440"`
	Metering          *InvoiceLineMetering `json:"metering" doc:"How a USAGE or OVERAGE line's quantity was measured"`
	Overage           *InvoiceLineOverage  `json:"overage" doc:"The arithmetic of an OVERAGE line"`
	Discount          *InvoiceLineDiscount `json:"discount" doc:"How a DISCOUNT line was computed"`
	Provider          *InvoiceLineProvider `json:"provider" doc:"The line in the payment provider, once pushed"`
	Capped            bool                 `json:"capped,omitempty" doc:"Set on a preview line whose sample exceeded what the licence accepts: reports above that are rejected, so the excess is not billed"`

	displayOrder int32
}

// TransformSchema publishes InvoiceLine's absent members as null (§13.15).
func (InvoiceLine) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, InvoiceLine{})
}

// InvoiceLineProvider is a line as its payment provider holds it.
type InvoiceLineProvider struct {
	ExternalLineID string `json:"externalLineId,omitempty" doc:"The provider's id of the line; absent on a DISCOUNT line, which the provider holds as discounts on its targets"`
	Amount         *int64 `json:"amount,omitempty" doc:"The provider's amount, read back for reconciliation"`
	// CouponIDs are recorded in allocation order as each is created.
	CouponIDs []string `json:"couponIds,omitempty" doc:"On a DISCOUNT line: the provider's discount (a Stripe coupon) of each allocation, in the allocations' order"`
}

// InvoiceLineMetering is how a metered line's quantity was measured.
type InvoiceLineMetering struct {
	SaleUnitFactor          string `json:"saleUnitFactor" doc:"Measured units in one sale unit" example:"10000"`
	MeasuredQuantity        string `json:"measuredQuantity" doc:"In measured units: the usage for a USAGE line, the overage for an OVERAGE line" example:"30500"`
	Windows                 int    `json:"windows" doc:"Reset windows the period spans" example:"1"`
	NegativeSegmentsFloored int    `json:"negativeSegmentsFloored" doc:"Windows whose net movement was negative and counted as 0" example:"0"`
	// Ledger is absent on a preview from sample usage, which has no rows.
	Ledger *InvoiceLineLedger `json:"ledger" doc:"The usage journal rows the line was measured from"`
}

// TransformSchema publishes InvoiceLineMetering's absent members as null (§13.15).
func (InvoiceLineMetering) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, InvoiceLineMetering{})
}

// InvoiceLineLedger identifies the usage journal rows a metered line was
// measured from: with them, the line can be recomputed.
type InvoiceLineLedger struct {
	InstanceID *uuid.UUID `json:"instanceId" doc:"The instance whose reports these are: with the line's entitlement, the pair the journal is kept by. It outlives the instance"`
	FirstSeq   *int64     `json:"firstSeq" doc:"First report of the period, null when it has none"`
	LastSeq    *int64     `json:"lastSeq" doc:"Last report of the period, null when it has none"`
	Rows       int64      `json:"rows" doc:"Reports in the period"`
	SumDelta   string     `json:"sumDelta" doc:"Sum of the reports' movements, before any floor"`
	SumOverage *string    `json:"sumOverage" doc:"Sum of their movements above the limit, before any floor"`
}

// TransformSchema publishes InvoiceLineLedger's absent members as null (§13.15).
func (InvoiceLineLedger) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, InvoiceLineLedger{})
}

// InvoiceLineOverage is the arithmetic of an OVERAGE line.
type InvoiceLineOverage struct {
	UsageMeasured   string         `json:"usageMeasured" doc:"Usage in measured units" example:"130500"`
	OverageMeasured string         `json:"overageMeasured" doc:"Usage above the applied limit" example:"30500"`
	Limits          []OverageLimit `json:"limits" nullable:"false" doc:"The limits applied, in the order they first applied"`
}

// TransformSchema publishes InvoiceLineOverage's absent members as null (§13.15).
func (InvoiceLineOverage) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, InvoiceLineOverage{})
}

// OverageLimit is one limit an overage was measured against.
type OverageLimit struct {
	LimitValue     *string `json:"limitValue" doc:"The limit, null when unlimited" example:"100000"`
	OveragePercent int32   `json:"overagePercent" doc:"Usage accepted above the limit, as a percent of it" example:"50"`
	Rows           int     `json:"rows" doc:"Usage reports measured against it; 0 for a sample"`
}

// TransformSchema publishes OverageLimit's absent members as null (§13.15).
func (OverageLimit) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, OverageLimit{})
}

// InvoicePreview is an invoice that was composed but not issued: what a
// boundary would bill on the given inputs. Nothing is written to compose it.
type InvoicePreview struct {
	Status        string        `json:"status" enum:"PREVIEW" doc:"Always PREVIEW"`
	Kind          Kind          `json:"kind" enum:"ACTIVATION,RENEWAL,FINAL" doc:"The boundary previewed"`
	AsOf          time.Time     `json:"asOf" doc:"When the preview was composed"`
	BoundaryAt    time.Time     `json:"boundaryAt" doc:"The boundary the invoice bills"`
	ServiceFrom   *time.Time    `json:"serviceFrom,omitempty" doc:"Earliest start of the lines' service periods; absent without lines"`
	ServiceTo     *time.Time    `json:"serviceTo,omitempty" doc:"Latest end of the lines' service periods; absent without lines"`
	LicenseSlug   string        `json:"licenseSlug" doc:"The licence version previewed"`
	Currency      string        `json:"currency" doc:"ISO 4217 code" example:"EUR"`
	Subtotal      int64         `json:"subtotal" doc:"Sum of the lines, in minor units"`
	DiscountTotal int64         `json:"discountTotal" doc:"Sum of the discounts, in minor units"`
	Total         int64         `json:"total" doc:"subtotal − discountTotal, in minor units"`
	Lines         []InvoiceLine `json:"lines" nullable:"false"`
	WouldHold     []InvoiceHold `json:"wouldHold" nullable:"false" doc:"Meters whose usage journal fails a consistency check, which would hold the invoice. Always empty for a sample."`
}

// InvoiceHold is a meter that would hold an invoice.
type InvoiceHold struct {
	EntitlementID uuid.UUID `json:"entitlementId"`
	Invariant     string    `json:"invariant" doc:"The check that failed"`
}

// Preview wraps a composition as an InvoicePreview.
func Preview(kind Kind, asOf, boundary time.Time, licenseSlug string, currency string, c Composition) InvoicePreview {
	preview := InvoicePreview{
		Status:        "PREVIEW",
		Kind:          kind,
		AsOf:          asOf,
		BoundaryAt:    boundary,
		ServiceFrom:   nil,
		ServiceTo:     nil,
		LicenseSlug:   licenseSlug,
		Currency:      currency,
		Subtotal:      c.Subtotal,
		DiscountTotal: c.DiscountTotal,
		Total:         c.Total,
		Lines:         c.Lines,
		WouldHold:     []InvoiceHold{},
	}
	if preview.Lines == nil {
		preview.Lines = []InvoiceLine{}
	}
	for i := range c.Lines {
		from, to := c.Lines[i].ServiceFrom, c.Lines[i].ServiceTo
		if preview.ServiceFrom == nil || from.Before(*preview.ServiceFrom) {
			preview.ServiceFrom = &from
		}
		if preview.ServiceTo == nil || to.After(*preview.ServiceTo) {
			preview.ServiceTo = &to
		}
	}
	return preview
}
