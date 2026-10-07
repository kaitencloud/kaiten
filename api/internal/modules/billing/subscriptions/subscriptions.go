// Package subscriptions is what the use cases that read or write an
// instance's subscription share: its API shape, its terms, and its periods.
package subscriptions

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/settings"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
)

// Statuses, as the API spells them.
const (
	StatusTrial    = "TRIAL"
	StatusActive   = "ACTIVE"
	StatusPastDue  = "PAST_DUE"
	StatusCanceled = "CANCELED"
)

// Live reports whether a status is a subscription that bills: TRIAL, ACTIVE
// or PAST_DUE.
func Live(status db.InstanceBillingStatus) bool {
	return status == db.InstanceBillingStatusTRIAL || status == db.InstanceBillingStatusACTIVE ||
		status == db.InstanceBillingStatusPASTDUE
}

// InstanceBilling is an instance's subscription as the API returns it.
type InstanceBilling struct {
	ID                       uuid.UUID        `json:"id"`
	InstanceSlug             string           `json:"instanceSlug" doc:"As it was at the subscription's last write"`
	InstanceName             string           `json:"instanceName"`
	CustomerSlug             string           `json:"customerSlug"`
	CustomerName             string           `json:"customerName"`
	Status                   string           `json:"status" enum:"TRIAL,ACTIVE,PAST_DUE,CANCELED"`
	ProviderKind             string           `json:"providerKind" enum:"NOOP,STRIPE" doc:"Who collects its invoices. NOOP: the organization itself, through the handoff queue"`
	CollectionMethod         string           `json:"collectionMethod" enum:"SEND_INVOICE,CHARGE_AUTOMATICALLY" doc:"Effective: the subscription's own, else the organization's default"`
	CollectionMethodOverride *string          `json:"collectionMethodOverride,omitempty" doc:"The subscription's own collection method; absent when it takes the organization's"`
	DaysUntilDue             int32            `json:"daysUntilDue" doc:"Effective: the subscription's own, else the organization's default"`
	DaysUntilDueOverride     *int32           `json:"daysUntilDueOverride,omitempty" doc:"The subscription's own payment terms; absent when it takes the organization's"`
	BasePrice                prices.Price     `json:"basePrice" doc:"The FLAT_FEE price the subscription is pinned to, deprecated or not"`
	BillingPeriod            string           `json:"billingPeriod" enum:"MONTHLY,QUARTERLY,SEMI_ANNUAL,ANNUAL"`
	Currency                 string           `json:"currency" example:"EUR"`
	AnchorAt                 time.Time        `json:"anchorAt" doc:"The instant its periods are counted from"`
	StartedAt                time.Time        `json:"startedAt" doc:"When billing started: usage before it is never billed"`
	CurrentPeriodStart       time.Time        `json:"currentPeriodStart"`
	CurrentPeriodEnd         time.Time        `json:"currentPeriodEnd" doc:"The next boundary: the period closes, and its invoice is composed, after it"`
	TrialEndsAt              *time.Time       `json:"trialEndsAt,omitempty" doc:"When the trial ends, or ended: usage before it is never billed"`
	ScheduledChange          *ScheduledChange `json:"scheduledChange,omitempty" doc:"A plan change waiting for the next boundary"`
	CancelAtPeriodEnd        bool             `json:"cancelAtPeriodEnd"`
	CancelRequestedAt        *time.Time       `json:"cancelRequestedAt,omitempty"`
	CanceledAt               *time.Time       `json:"canceledAt,omitempty"`
	CancellationReason       *string          `json:"cancellationReason,omitempty"`
	PastDueSince             *time.Time       `json:"pastDueSince,omitempty"`
	CreatedAt                time.Time        `json:"createdAt"`
	UpdatedAt                time.Time        `json:"updatedAt"`
}

// ScheduledChange is a plan change waiting for the next boundary.
type ScheduledChange struct {
	Price       prices.Price `json:"price" doc:"The FLAT_FEE price the subscription moves to"`
	ScheduledAt time.Time    `json:"scheduledAt"`
	EffectiveAt time.Time    `json:"effectiveAt" doc:"The boundary it applies at: the current period's end"`
}

// Terms resolves how the subscription's next invoice is collected: its own
// terms, else the organization's defaults.
func Terms(row db.InstanceBilling, defaults settings.BillingSettings) invoices.Terms {
	terms := invoices.Terms{CollectionMethod: defaults.DefaultCollectionMethod, DaysUntilDue: defaults.DefaultDaysUntilDue}
	if row.CollectionMethod != nil {
		terms.CollectionMethod = string(*row.CollectionMethod)
	}
	if row.DaysUntilDue != nil {
		terms.DaysUntilDue = *row.DaysUntilDue
	}
	return terms
}

// Build is a subscription row as the API returns it, with its effective
// terms and the price it is pinned to.
func Build(ctx context.Context, q *db.Queries, catalogue ports.CatalogueSource, row db.InstanceBilling) (*InstanceBilling, error) {
	defaults, err := settings.Read(ctx, q, row.OrganizationID)
	if err != nil {
		return nil, err
	}
	base, err := catalogue.Price(ctx, row.OrganizationID, row.BaseLicensePriceID)
	if err != nil {
		return nil, err
	}
	if base == nil {
		return nil, fmt.Errorf("subscription %s is pinned to price %s, which does not exist", row.ID, row.BaseLicensePriceID)
	}
	terms := Terms(row, defaults)
	out := &InstanceBilling{
		ID:                       row.ID,
		InstanceSlug:             row.InstanceSlug,
		InstanceName:             row.InstanceName,
		CustomerSlug:             row.CustomerSlug,
		CustomerName:             row.CustomerName,
		Status:                   string(row.Status),
		ProviderKind:             string(row.ProviderKind),
		CollectionMethod:         terms.CollectionMethod,
		CollectionMethodOverride: nil,
		DaysUntilDue:             terms.DaysUntilDue,
		DaysUntilDueOverride:     row.DaysUntilDue,
		BasePrice:                base.Price,
		BillingPeriod:            string(row.BillingPeriod),
		Currency:                 row.Currency,
		AnchorAt:                 row.AnchorAt.Time.UTC(),
		StartedAt:                row.StartedAt.Time.UTC(),
		CurrentPeriodStart:       row.CurrentPeriodStart.Time.UTC(),
		CurrentPeriodEnd:         row.CurrentPeriodEnd.Time.UTC(),
		TrialEndsAt:              invoices.TimePtr(row.TrialEndsAt),
		ScheduledChange:          nil,
		CancelAtPeriodEnd:        row.CancelAtPeriodEnd,
		CancelRequestedAt:        invoices.TimePtr(row.CancelRequestedAt),
		CanceledAt:               invoices.TimePtr(row.CanceledAt),
		CancellationReason:       row.CancellationReason,
		PastDueSince:             invoices.TimePtr(row.PastDueSince),
		CreatedAt:                row.CreatedAt.Time.UTC(),
		UpdatedAt:                row.UpdatedAt.Time.UTC(),
	}
	if row.CollectionMethod != nil {
		method := string(*row.CollectionMethod)
		out.CollectionMethodOverride = &method
	}
	if row.ScheduledLicensePriceID != nil {
		target, err := catalogue.Price(ctx, row.OrganizationID, *row.ScheduledLicensePriceID)
		if err != nil {
			return nil, err
		}
		if target != nil {
			out.ScheduledChange = &ScheduledChange{
				Price: target.Price, ScheduledAt: row.ScheduledAt.Time.UTC(), EffectiveAt: row.CurrentPeriodEnd.Time.UTC(),
			}
		}
	}
	return out, nil
}
