// Package platformflags reads platform-owned flags through Kaiten's existing
// repository and evaluator, without starting workers or reporting usage.
package platformflags

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/openfeature"
	customertargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/customers/targetingfacts"
	deploymentzonetargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/targetingfacts"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/evaluator"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/ofrep"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/ofrep/evaluateflag"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	instancetargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/instances/targetingfacts"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/pkg/dogfoodingctx"
)

const evaluationTimeout = 5 * time.Second

var errUnavailable = errors.New("platform feature flag is unavailable")

type flagRepository interface {
	GetFeatureFlag(context.Context, string, uuid.UUID) (*schema.FeatureFlag, error)
}

// Reader's source is trusted driver wiring, never an operation's target tenant.
// It holds no cache of its own and reads the current flag on every call; the
// server wraps it in aiusage.CachedFlags, which bounds how often that happens.
type Reader struct {
	repository flagRepository
	source     uuid.UUID
	// The fact ports a rollout rule may read, each the owning module's own
	// public read port. Nil ports enrich nothing, which reads as off for a
	// rule that needs them -- never as on.
	instances       instancetargetingfacts.Port
	customers       customertargetingfacts.Port
	deploymentZones deploymentzonetargetingfacts.Port
}

// New selects the local platform authority. A driver with a remote authority
// must not use this reader as a fallback when remote evaluation fails.
func New(pool *pgxpool.Pool, source uuid.UUID) *Reader {
	r := &Reader{repository: nil, source: source}
	if pool != nil && source != uuid.Nil {
		r.repository = evaluateflag.NewQueryRepository(db.New(pool))
		r.instances = instancetargetingfacts.New(pool)
		r.deploymentZones = deploymentzonetargetingfacts.New(pool)
		// A closed AI policy, deliberately: these facts decide the AI rollout,
		// so reading them must not depend on it. The customer port is the one
		// of the three that takes a policy at all.
		r.customers = customertargetingfacts.New(pool, aiusage.Policy{})
	}
	return r
}

// BooleanValue evaluates a rollout flag for one organization, against the same
// facts the OFREP path would give a rule about it, minus the ones whose own
// reads this flag gates.
//
// What a rule here may read: targetingKey and organizationId, both the
// evaluated organization's id, and the registry facts of its tracked instance
// -- `__kaiten.instance.metadata.aiCredits == true` -- with its customer and
// deployment zone. What it may not: `__kaiten.entitlements` and
// `__kaiten.license`, whose ports take an AI policy and would recursively ask
// this same flag for permission to read AI facts. A rule reading them is
// refused as broken rather than answered with half the context.
//
// The facts come from the SOURCE organization, not the evaluated one: the
// platform catalogue holds one instance per tracked organization, slugged with
// that organization's id, which is the convention dogfoodingctx writes.
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
	evaluationContext := openfeature.EvaluationContext{
		TargetingKey: organizationID.String(),
		Inputs:       dogfoodingctx.BuildContext(organizationID),
	}
	// ResetKaitenFacts first, unconditionally, the same discipline the OFREP
	// handlers follow: the facts namespace belongs to the server, and nothing a
	// caller put in the context it built may survive into a rule that judges it.
	ofrep.ResetKaitenFacts(&evaluationContext)
	ofrep.EnrichWithInstanceFacts(ctx, r.instances, r.customers, r.deploymentZones, r.source, &evaluationContext)

	// Evaluator owns mutable per-evaluation CEL state; do not share one across
	// concurrent operations or add a second implementation of targeting rules.
	details, err := evaluator.NewEvaluator().Evaluate(ctx, *flag, evaluationContext)
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
		if broken, found := (*details.FlagMetadata)[evaluator.BrokenRulesMetadataKey]; found {
			// A broken rule refuses the whole flag, so say which one and why:
			// the usual cause is a rule reading a fact this path does not
			// provide, and the symptom is a rollout that silently stays off.
			slog.WarnContext(ctx, "platform flag has a rule that could not run, so it reads as off",
				"flag", key, "organization_id", organizationID, "broken_rules", broken)
			return false, errUnavailable
		}
	}
	value, ok := details.Value.(bool)
	if !ok {
		return false, errUnavailable
	}
	return value, nil
}
