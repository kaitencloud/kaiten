package lifecycle

import (
	"context"
	"errors"
	"log/slog"
	"math"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/telemetry"
)

// TrialWillEndAt is when a trial ending at trialEndsAt announces its end: the
// family's lead before it (V32-07). It may fall before the trial's start
// when the trial is shorter than the lead.
func TrialWillEndAt(trialEndsAt time.Time, reminderDays int32) time.Time {
	return trialEndsAt.Add(-time.Duration(reminderDays) * 24 * time.Hour)
}

// TrialPreviewer previews the invoice a subscription's next boundary issues,
// in the transaction ctx carries, writing nothing: the closing module's
// upcoming-invoice composer.
type TrialPreviewer interface {
	Preview(ctx context.Context, sub db.InstanceBilling, operation string) (*rating.InvoicePreview, error)
}

// TrialAnnouncer emits com.kaiten.instance.billing.v1.trial_will_end, with
// its whole payload (§15.2 rule 9).
type TrialAnnouncer struct {
	outbox    *outbox.ScopedRepository
	catalogue ports.CatalogueSource
	previewer TrialPreviewer
}

// NewTrialAnnouncer builds the announcer; previewer may be nil (no charge).
func NewTrialAnnouncer(uof *uow.UnitOfWork, catalogue ports.CatalogueSource, previewer TrialPreviewer) *TrialAnnouncer {
	return &TrialAnnouncer{outbox: outbox.NewScopedRepository(uof), catalogue: catalogue, previewer: previewer}
}

// Announce emits the event for a TRIAL whose reminder is due, once: the
// marker is set in the transaction ctx carries, and a trial already
// announced, or no longer in TRIAL, emits nothing (§9.2 rule 7). Every member
// is read in that transaction. Whether it emitted.
func (a *TrialAnnouncer) Announce(ctx context.Context, q *db.Queries, row db.InstanceBilling, now time.Time) (bool, error) {
	marked, err := q.MarkTrialReminderSent(ctx, db.MarkTrialReminderSentParams{Now: invoices.Timestamp(now), ID: row.ID})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	payload, err := a.payload(ctx, q, marked, now)
	if err != nil {
		return false, err
	}
	var headers outbox.AuditHeaders
	if marked.InstanceID != nil {
		headers.InstanceID = marked.InstanceID
	}
	return true, a.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
		marked.OrganizationID, events.InstanceBillingTrialWillEnd.Name, events.InstanceBillingTrialWillEnd.Type, payload, headers))
}

func (a *TrialAnnouncer) payload(ctx context.Context, q *db.Queries, row db.InstanceBilling, now time.Time) (subscriptions.TrialWillEnd, error) {
	billing, err := subscriptions.Build(ctx, q, a.catalogue, row)
	if err != nil {
		return subscriptions.TrialWillEnd{}, err
	}
	out := subscriptions.TrialWillEnd{
		InstanceBilling: *billing,
		Customer:        subscriptions.TrialCustomer{Slug: row.CustomerSlug, Name: row.CustomerName, BillingEmail: nil},
		Instance:        subscriptions.TrialInstance{Slug: row.InstanceSlug, Name: row.InstanceName},
		LicenseName:     "", FamilySlug: "", DaysLeft: 0, Charge: nil, PaymentMethod: nil,
	}
	if row.CustomerID != nil {
		customer, err := q.GetBillingCustomer(ctx, db.GetBillingCustomerParams{OrganizationID: row.OrganizationID, ID: *row.CustomerID})
		if err != nil {
			return out, err
		}
		out.Customer = subscriptions.TrialCustomer{Slug: customer.Slug, Name: customer.Name, BillingEmail: customer.BillingEmail}
		method, err := q.GetCustomerBilling(ctx, db.GetCustomerBillingParams{
			OrganizationID: row.OrganizationID, CustomerID: *row.CustomerID, ProviderKind: row.ProviderKind,
		})
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return out, err
		}
		if err == nil && method.PaymentMethodStatus == db.PaymentMethodStatusACTIVE {
			out.PaymentMethod = &subscriptions.TrialPaymentMethod{
				Brand: method.PaymentMethodBrand, Last4: method.PaymentMethodLast4,
				ExpMonth: smallint(method.PaymentMethodExpMonth), ExpYear: smallint(method.PaymentMethodExpYear),
			}
		}
	}
	base, err := a.catalogue.Price(ctx, row.OrganizationID, row.BaseLicensePriceID)
	if err != nil {
		return out, err
	}
	if base != nil {
		license, err := q.GetBillingLicense(ctx, db.GetBillingLicenseParams{OrganizationID: row.OrganizationID, ID: base.LicenseID})
		if err != nil {
			return out, err
		}
		out.LicenseName, out.FamilySlug = license.Name, license.FamilySlug
	}
	if row.TrialEndsAt.Valid {
		if left := row.TrialEndsAt.Time.Sub(now); left > 0 {
			out.DaysLeft = int(math.Ceil(left.Hours() / 24))
		}
	}
	if a.previewer != nil {
		preview, err := a.previewer.Preview(ctx, row, "")
		if err != nil {
			return out, err
		}
		if preview != nil && preview.Kind == rating.KindActivation && preview.Total > 0 {
			out.Charge = &subscriptions.TrialCharge{Amount: preview.Total, Currency: row.Currency, BillingPeriod: string(row.BillingPeriod)}
		}
	}
	return out, nil
}

func smallint(v *int16) *int {
	if v == nil {
		return nil
	}
	n := int(*v)
	return &n
}

// TrialReminders is billing-lifecycle step (e): trial_will_end for every
// trial whose trial_will_end_at has passed.
type TrialReminders struct {
	uof       *uow.UnitOfWork
	announcer *TrialAnnouncer
}

func NewTrialReminders(uof *uow.UnitOfWork, announcer *TrialAnnouncer) *TrialReminders {
	return &TrialReminders{uof: uof, announcer: announcer}
}

// Pass announces up to limit due reminders, each in its own transaction: one
// that fails is logged and left for the next pass.
func (r *TrialReminders) Pass(ctx context.Context, limit int) (announced int, err error) {
	q := db.New(r.uof.DBTX(ctx))
	now, err := Now(ctx, q)
	if err != nil {
		return 0, err
	}
	due, err := q.ListDueTrialReminders(ctx, db.ListDueTrialRemindersParams{
		Now: timestamp(now), PageSize: int32(limit), //nolint:gosec // bounded by the batch size
	})
	if err != nil {
		return 0, err
	}
	for _, row := range due {
		sent := false
		err := r.uof.Transact(ctx, func(ctx context.Context) error {
			var err error
			sent, err = r.announcer.Announce(ctx, db.New(r.uof.DBTX(ctx)), row, now)
			return err
		})
		if err != nil {
			slog.ErrorContext(ctx, "trial reminder failed", "instance_billing_id", row.ID, "error", err)
			telemetry.ItemFailed(ctx, telemetry.JobLifecycle, strings.HasPrefix(err.Error(), "panic "))
			continue
		}
		if sent {
			announced++
		}
	}
	return announced, nil
}
