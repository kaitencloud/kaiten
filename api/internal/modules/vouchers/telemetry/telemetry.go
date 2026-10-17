// Package telemetry is the vouchers module's metrics (§19.1), in the house's
// OpenTelemetry names: voucher_redemptions_total in the spec is
// kaiten.vouchers.redemptions here, exported as
// kaiten_vouchers_redemptions_total.
//
// A metric that fails to register is nil and every recorder tolerates it:
// telemetry never fails a redemption.
package telemetry

import (
	"context"
	"log/slog"
	"sync"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

// Surfaces a code is validated on, as voucher_validation_rate_limited_total
// labels them.
const (
	SurfaceCore   = "core"
	SurfacePublic = "public"
)

type instruments struct {
	redemptions metric.Int64Counter
	rateLimited metric.Int64Counter
}

var get = sync.OnceValue(func() *instruments {
	meter := otel.GetMeterProvider().Meter("kaiten.vouchers")
	counter := func(name, description, unit string) metric.Int64Counter {
		c, err := meter.Int64Counter(name, metric.WithDescription(description), metric.WithUnit(unit))
		if err != nil {
			slog.Warn("failed to register a voucher metric", "metric", name, "error", err)
			return nil
		}
		return c
	}
	return &instruments{
		redemptions: counter("kaiten.vouchers.redemptions",
			"Vouchers redeemed, by type (PRICE, ENTITLEMENT_BOOST); a subscribe's redemption counts even if the subscribe then fails", "{redemption}"),
		rateLimited: counter("kaiten.vouchers.validation.rate_limited",
			"Voucher code checks refused for going too fast, by surface (core, public)", "{request}"),
	}
})

// Redeemed counts a redemption of a voucher of voucherType.
func Redeemed(ctx context.Context, voucherType string) {
	if c := get().redemptions; c != nil {
		c.Add(ctx, 1, metric.WithAttributes(attribute.String("type", voucherType)))
	}
}

// RateLimited counts a code check refused on surface for going too fast.
func RateLimited(ctx context.Context, surface string) {
	if c := get().rateLimited; c != nil {
		c.Add(ctx, 1, metric.WithAttributes(attribute.String("surface", surface)))
	}
}
