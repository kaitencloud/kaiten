package checkout

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/shared/ratelimit"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// The limits of §14.3 when nothing is configured (proposed, §24 #83).
const (
	defaultStartsPer10m   = 10
	defaultStartsPerHour  = 30
	defaultConfirmsPer10m = 30
	defaultPerKeyPerHour  = 1000
)

// Limits bound one anonymous checkout operation, per replica (§14.3): per
// client address, as the gateway reports it, and per publishable key. Each
// call that reaches it counts.
type Limits struct {
	address []*ratelimit.Keyed[string]
	keys    *ratelimit.Keyed[uuid.UUID]
}

func orDefault(configured, fallback int) int {
	if configured <= 0 {
		return fallback
	}
	return configured
}

// StartLimits are the start's: per address, 10 per 10 minutes and 30 an
// hour, dryRun included; per key, 1,000 an hour.
func StartLimits(cfg config.BillingCheckoutLimits) *Limits {
	per10m, perHour := orDefault(cfg.StartsPerAddressPer10m, defaultStartsPer10m), orDefault(cfg.StartsPerAddressPerHour, defaultStartsPerHour)
	perKey := orDefault(cfg.PerKeyPerHour, defaultPerKeyPerHour)
	return &Limits{
		address: []*ratelimit.Keyed[string]{
			ratelimit.New[string](ratelimit.Every(per10m, 10*time.Minute), per10m),
			ratelimit.New[string](ratelimit.Every(perHour, time.Hour), perHour),
		},
		keys: ratelimit.New[uuid.UUID](ratelimit.Every(perKey, time.Hour), perKey),
	}
}

// ConfirmLimits are the confirm's: 30 per 10 minutes per address; 1,000 an
// hour for the key that started the session.
func ConfirmLimits(cfg config.BillingCheckoutLimits) *Limits {
	per10m, perKey := orDefault(cfg.ConfirmsPerAddressPer10m, defaultConfirmsPer10m), orDefault(cfg.PerKeyPerHour, defaultPerKeyPerHour)
	return &Limits{
		address: []*ratelimit.Keyed[string]{ratelimit.New[string](ratelimit.Every(per10m, 10*time.Minute), per10m)},
		keys:    ratelimit.New[uuid.UUID](ratelimit.Every(perKey, time.Hour), perKey),
	}
}

// Take counts one call, or refuses it with 429 <operation>.RateLimited and
// Retry-After. A call with no client address -- a gateway that does not set
// it -- is bounded by its key alone.
func (l *Limits) Take(ctx context.Context, operation string, keyID uuid.UUID, address string) error {
	if l == nil {
		return nil
	}
	now := time.Now()
	reservations := []ratelimit.Reservation{l.keys.Reserve(keyID, now)}
	if address != "" {
		for _, bucket := range l.address {
			reservations = append(reservations, bucket.Reserve(address, now))
		}
	}
	if wait, ok := ratelimit.All(reservations...); !ok {
		slog.InfoContext(ctx, "anonymous checkout rate-limited", "operation", operation, "publishable_key_id", keyID)
		return kaitenerrors.TooManyRequests(operation+".RateLimited", "too many checkout attempts: try again later", wait)
	}
	return nil
}
