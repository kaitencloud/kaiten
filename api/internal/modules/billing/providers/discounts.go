package providers

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/metric"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
)

var cleanupFailures = sync.OnceValue(func() metric.Int64Counter {
	counter, err := otel.GetMeterProvider().Meter("kaiten.billing").Int64Counter(
		"kaiten.billing.coupon_cleanup_failures",
		metric.WithDescription("Provider discounts (Stripe coupons) of a finalized or removed invoice that could not be deleted; a leftover is harmless, being redeemed already"),
		metric.WithUnit("{coupon}"),
	)
	if err != nil {
		slog.Error("could not create the coupon clean-up metric", "error", err)
	}
	return counter
})

// ReleaseDiscounts deletes the provider discounts a push created for an
// invoice's DISCOUNT lines, best effort, once the invoice is finalized or its
// provider copy removed: never while it is a draft, review mode included
// (CR-001 §4 rules 5 and 6). A failure is logged and counted; the invoice is
// not affected.
func ReleaseDiscounts(ctx context.Context, conn *provider.Connection, invoiceID uuid.UUID, lines []rating.InvoiceLine, timeout time.Duration) {
	for _, line := range lines {
		if line.Type != rating.LineDiscount || line.Provider == nil {
			continue
		}
		for _, id := range line.Provider.CouponIDs {
			callCtx, cancel := Bound(ctx, timeout)
			err := conn.Adapter.DeleteDiscount(callCtx, conn.Ref, id)
			cancel()
			if err == nil {
				continue
			}
			slog.WarnContext(ctx, "could not delete a provider discount of an invoice", "invoice_id", invoiceID,
				"discount_id", id, "error", err)
			if counter := cleanupFailures(); counter != nil {
				counter.Add(ctx, 1)
			}
		}
	}
}
