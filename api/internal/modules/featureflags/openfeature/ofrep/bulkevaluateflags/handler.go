package bulkevaluateflags

import (
	"context"
	"sync"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/openfeature"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	customertargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/customers/targetingfacts"
	deploymentzonetargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/targetingfacts"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/evaluator"
	ffevents "github.com/kaitencloud/kaiten/api/internal/modules/featureflags/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/ofrep"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	instancetargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/instances/targetingfacts"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/pkg/dogfoodingctx"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container. CustomerFacts, InstanceFacts, and
// DeploymentZoneFacts are each the owning module's own public read port --
// this handler never imports another module's generated db package
// directly.
type Deps struct {
	UserProvider  currentuser.Provider
	Queries       *db.Queries
	UsageReporter services.UsageReporter
	// PlatformOrgID is the organization kaiten runs itself on
	// (config.Config.Metered.ResolvePlatformOrgID). A caller authenticated as it is
	// making a platform-internal evaluation; uuid.Nil means none is
	// configured, and then no caller is.
	PlatformOrgID       uuid.UUID
	CustomerFacts       customertargetingfacts.Port
	InstanceFacts       instancetargetingfacts.Port
	DeploymentZoneFacts deploymentzonetargetingfacts.Port
}

type UseCase struct {
	deps       Deps
	repository *QueryRepository
	publisher  ffevents.EvaluationPublisher
}

func NewUseCase(deps Deps, publisher ffevents.EvaluationPublisher) *UseCase {
	return &UseCase{
		deps:       deps,
		repository: NewQueryRepository(deps.Queries),
		publisher:  publisher,
	}
}

// FlagEvaluation pairs a flag's key (slug) with its resolution details so the
// endpoint can include the key in each ofrep response item.
type FlagEvaluation struct {
	Key    string
	Detail openfeature.ResolutionDetails
}

func (h *UseCase) Execute(ctx context.Context, ofrepContext ofrep.Context) []FlagEvaluation {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return []FlagEvaluation{}
	}

	// kaiten checking its own flags is neither metered nor audited. Read off the
	// caller, never off ofrepContext: a marker in the request body would let
	// anyone holding read:feature_flags exempt itself from both billing and the
	// audit trail by sending it.
	internal := dogfoodingctx.IsInternal(user.OrganizationID, h.deps.PlatformOrgID)

	if !internal {
		h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.FeatureFlagEvaluatedEntitlementSlug)
	}

	evaluationContext := ofrepContext.ToEvaluationContext()
	// __kaiten.* is the only namespace a rule may act on — reset it first so
	// nothing a caller put there in its own request body survives, then let
	// each Enrich* call populate the facts it owns.
	ofrep.ResetKaitenFacts(&evaluationContext)
	// Facts the caller cannot forge. Without this the context is a verbatim copy
	// of the request body, so a rule on `plan` judges the client on a value the
	// client supplied.
	ofrep.EnrichWithServerFacts(ctx, h.deps.CustomerFacts, user.OrganizationID, &evaluationContext)
	// Which instance, if any, is asking — read from the caller-supplied
	// kaiten.instanceSlug/kaiten.instanceId input, never from targetingKey
	// (already claimed above for customer-slug resolution).
	ofrep.EnrichWithInstanceFacts(ctx, h.deps.InstanceFacts, h.deps.CustomerFacts, h.deps.DeploymentZoneFacts, user.OrganizationID, &evaluationContext)

	var flags []schema.FeatureFlag
	rawFlags, hasFlags := ofrepContext["flags"]
	flagSlugs, isSlugsArray := rawFlags.([]string)

	if hasFlags && isSlugsArray {
		flags, err = h.repository.GetFeatureFlagsBySlugs(ctx, flagSlugs, user.OrganizationID)
		if err != nil {
			return []FlagEvaluation{}
		}
	} else {
		flags, err = h.repository.GetAllFeatureFlags(ctx, user.OrganizationID)
		if err != nil {
			return []FlagEvaluation{}
		}
	}

	results := make([]FlagEvaluation, len(flags))
	var wg sync.WaitGroup
	var mu sync.Mutex

	for i, flag := range flags {
		wg.Add(1)
		go func(index int, f schema.FeatureFlag) {
			defer wg.Done()

			flagEvaluator := evaluator.NewEvaluator()

			resolutionDetail, err := flagEvaluator.Evaluate(ctx, f, evaluationContext)
			if err != nil {
				resolutionDetail = openfeature.ResolutionDetails{
					Value:        nil,
					Variant:      nil,
					Reason:       ptr.To(openfeature.ReasonError),
					FlagMetadata: nil,
					ErrorCode:    ptr.To(openfeature.ErrorCodeProviderFatal),
					ErrorMessage: ptr.To("error during bulk evaluation"),
				}
			}

			if h.publisher != nil && !internal {
				h.publisher.Publish(ffevents.FlagEvaluationAudit{
					OrganizationID:    user.OrganizationID,
					FlagSlug:          f.Slug,
					FlagID:            f.ID,
					ResolutionDetails: resolutionDetail,
				})
			}

			mu.Lock()
			results[index] = FlagEvaluation{Key: f.Slug, Detail: resolutionDetail}
			mu.Unlock()
		}(i, flag)
	}

	wg.Wait()

	return results
}
