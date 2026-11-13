// Package platformflags reads platform-owned flags through Kaiten's existing
// repository and evaluator, without starting workers or reporting usage.
package platformflags

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/openfeature"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/evaluator"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/ofrep/evaluateflag"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	"github.com/kaitencloud/kaiten/api/pkg/dogfoodingctx"
)

const evaluationTimeout = 5 * time.Second

var errUnavailable = errors.New("platform feature flag is unavailable")

type flagRepository interface {
	GetFeatureFlag(context.Context, string, uuid.UUID) (*schema.FeatureFlag, error)
}

// Reader's source is trusted driver wiring, never an operation's target tenant.
// It has no positive-result cache: every operation reads the current flag.
type Reader struct {
	repository flagRepository
	source     uuid.UUID
}

// New selects the local platform authority. A driver with a remote authority
// must not use this reader as a fallback when remote evaluation fails.
func New(pool *pgxpool.Pool, source uuid.UUID) *Reader {
	r := &Reader{repository: nil, source: source}
	if pool != nil && source != uuid.Nil {
		r.repository = evaluateflag.NewQueryRepository(db.New(pool))
	}
	return r
}

// BooleanValue evaluates only trusted organization-ID facts. It deliberately
// does not enrich customer/instance entitlements, which could recursively ask
// this same rollout flag for permission to read AI facts.
func (r *Reader) BooleanValue(ctx context.Context, organizationID uuid.UUID, key string) (bool, error) {
	if r == nil || r.repository == nil || r.source == uuid.Nil || organizationID == uuid.Nil || key == "" {
		return false, errUnavailable
	}
	ctx, cancel := context.WithTimeout(ctx, evaluationTimeout)
	defer cancel()
	if err := ctx.Err(); err != nil {
		return false, err
	}
	flag, err := r.repository.GetFeatureFlag(ctx, key, r.source)
	if err != nil {
		return false, err
	}
	if flag == nil || !flag.Enabled || flag.Type != "boolean" || flag.Slug != key || flag.DefaultVariant == nil || flag.DefaultVariant.Value == nil {
		return false, errUnavailable
	}
	for _, targeting := range flag.Targetings {
		if targeting == nil {
			return false, errUnavailable
		}
	}
	// Evaluator owns mutable per-evaluation CEL state; do not share one across
	// concurrent operations or add a second implementation of targeting rules.
	details, err := evaluator.NewEvaluator().Evaluate(ctx, *flag, openfeature.EvaluationContext{
		TargetingKey: organizationID.String(),
		Inputs:       dogfoodingctx.BuildContext(organizationID),
	})
	if err != nil {
		return false, err
	}
	if err := ctx.Err(); err != nil {
		return false, err
	}
	if details.ErrorCode != nil || details.Reason == nil || *details.Reason == openfeature.ReasonError || *details.Reason == openfeature.ReasonDisabled {
		return false, errUnavailable
	}
	if details.FlagMetadata != nil {
		if _, broken := (*details.FlagMetadata)[evaluator.BrokenRulesMetadataKey]; broken {
			return false, errUnavailable
		}
	}
	value, ok := details.Value.(bool)
	if !ok {
		return false, errUnavailable
	}
	return value, nil
}
