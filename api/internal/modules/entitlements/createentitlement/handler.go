package createentitlement

import (
	"context"
	"slices"
	"strings"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	entitlementEvents "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider  currentuser.Provider
	UsageReporter services.UsageReporter
	Uof           *uow.UnitOfWork
}

type UseCase struct {
	deps   Deps
	repo   *CommandRepository
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:   deps,
		repo:   NewCommandRepository(deps.Uof),
		outbox: outbox.NewScopedRepository(deps.Uof),
	}
}

// Execute validates and resolves the entitlement's fields, enforces the
// creation entitlement, and persists the entitlement, as one flow:
// dogfooding.EnforceAndPersist skips persistence entirely if the
// organization is over its limit, and compensates with a Decrement call if
// persistence -- including its slug-conflict retries -- fails after usage
// was already incremented.
func (h *UseCase) Execute(ctx context.Context, request *Command) (*schema.Entitlement, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	resolvedAggregationMethod := request.AggregationMethod
	if schema.IsNumberFamily(request.Type) {
		if resolvedAggregationMethod == nil {
			resolvedAggregationMethod = ptr.To(schema.Sum)
		}
	} else {
		resolvedAggregationMethod = nil
	}

	if err := schema.ValidateTypeConfiguration(request.Type, resolvedAggregationMethod); err != nil {
		return nil, kaitenerrors.Validation("CreateEntitlement.InvalidTypeConfiguration", err.Error())
	}

	if err := schema.ValidateUnitsConfiguration(
		request.Type,
		request.UnitSingular, request.UnitPlural,
		request.SaleUnitSingular, request.SaleUnitPlural, request.SaleUnitFactor,
	); err != nil {
		return nil, kaitenerrors.Validation("CreateEntitlement.InvalidUnitsConfiguration", err.Error())
	}

	if err := schema.ValidateWarningThresholdConfiguration(
		request.Type, request.WarningThresholdPercent,
	); err != nil {
		return nil, kaitenerrors.Validation("CreateEntitlement.InvalidEnforcementPolicyConfiguration", err.Error())
	}

	// Default anchor when enabling a reset period without specifying one.
	resolvedResetAnchor := request.ResetAnchor
	if request.ResetPeriod != nil && resolvedResetAnchor == nil {
		calendar := period.Calendar
		resolvedResetAnchor = &calendar
	}
	if err := schema.ValidateResetConfiguration(
		request.Type, resolvedAggregationMethod, request.ResetPeriod, resolvedResetAnchor,
	); err != nil {
		return nil, kaitenerrors.Validation("CreateEntitlement.InvalidResetConfiguration", err.Error())
	}

	if request.Icon != nil {
		if err := schema.ValidateIcon(*request.Icon); err != nil {
			return nil, kaitenerrors.Validation("CreateEntitlement.InvalidIcon", err.Error())
		}
	}

	if request.Slug != nil {
		if _, err := slugutil.New(*request.Slug); err != nil {
			return nil, kaitenerrors.Validation("CreateEntitlement.InvalidSlug", slugutil.InvalidReason(*request.Slug))
		}
	}

	// Absent means not user facing: exposing an entitlement publicly is opt-in.
	resolvedUserFacing := false
	if request.UserFacing != nil {
		resolvedUserFacing = *request.UserFacing
	}

	// Absent display order sorts first (0), matching the column default.
	var resolvedDisplayOrder int32
	if request.DisplayOrder != nil {
		resolvedDisplayOrder = *request.DisplayOrder
	}

	// Absent warning threshold disables the early-warning signal (0), matching the
	// column default and preserving pre-existing behavior.
	var resolvedWarningThresholdPercent int32
	if request.WarningThresholdPercent != nil {
		resolvedWarningThresholdPercent = *request.WarningThresholdPercent
	}

	input := CreateEntitlementInput{
		Name:                    request.Name,
		Description:             request.Description,
		Type:                    request.Type,
		AggregationMethod:       resolvedAggregationMethod,
		Icon:                    request.Icon,
		UnitSingular:            request.UnitSingular,
		UnitPlural:              request.UnitPlural,
		SaleUnitSingular:        request.SaleUnitSingular,
		SaleUnitPlural:          request.SaleUnitPlural,
		SaleUnitFactor:          request.SaleUnitFactor,
		UserFacing:              resolvedUserFacing,
		DisplayOrder:            resolvedDisplayOrder,
		WarningThresholdPercent: resolvedWarningThresholdPercent,
		ResetPeriod:             request.ResetPeriod,
		ResetAnchor:             resolvedResetAnchor,
	}

	return dogfooding.EnforceAndPersist(ctx, h.deps.UsageReporter, user.OrganizationID, dogfooding.EntitlementEntitlementSlug,
		"CreateEntitlement.EntitlementLimitReached", "Entitlement creation limit reached for this organization", nil,
		func(ctx context.Context) (*schema.Entitlement, error) {
			attempt := func(slug string) (*schema.Entitlement, error) {
				input.Slug = slug
				return h.persistEntitlement(ctx, user.OrganizationID, input, request.GroupSlugs)
			}

			if request.Slug != nil {
				return attempt(*request.Slug)
			}

			// No caller-supplied slug: derive one from the name, retrying with
			// a freshly generated slug whenever the database detects a
			// conflict on it -- slugutil.GenerateUnique's random suffix
			// makes a collision unlikely but not impossible.
			return slugutil.Retry(
				slugutil.DefaultMaxAttempts,
				func() (string, error) { return slugutil.GenerateUnique(request.Name) },
				attempt,
			)
		})
}

func (h *UseCase) persistEntitlement(ctx context.Context, orgID uuid.UUID, input CreateEntitlementInput, groupSlugs []string) (*schema.Entitlement, error) {
	var entitlement *schema.Entitlement

	err := h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		createdEntitlement, err := h.repo.CreateEntitlement(ctx, input, orgID)
		if err != nil {
			return err
		}

		for _, groupSlug := range normalizeGroupSlugs(groupSlugs) {
			if err := h.repo.AddEntitlementToGroup(ctx, groupSlug, createdEntitlement.Slug, orgID); err != nil {
				return err
			}
		}

		entitlement, err = h.repo.GetEntitlement(ctx, createdEntitlement.Slug, orgID)
		if err != nil {
			return err
		}

		event := outbox.NewOutboxMessage(
			orgID,
			entitlementEvents.EntitlementCreated.Name,
			entitlementEvents.EntitlementCreated.Type,
			entitlement,
			nil,
		)

		return h.outbox.CreateOutboxEvent(ctx, event)
	})
	if err != nil {
		return nil, err
	}

	return entitlement, nil
}

func normalizeGroupSlugs(groupSlugs []string) []string {
	if len(groupSlugs) == 0 {
		return nil
	}

	normalized := make([]string, 0, len(groupSlugs))
	seen := make(map[string]struct{}, len(groupSlugs))

	for _, groupSlug := range groupSlugs {
		trimmed := strings.TrimSpace(groupSlug)
		if trimmed == "" {
			continue
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}

		seen[trimmed] = struct{}{}
		normalized = append(normalized, trimmed)
	}

	slices.Sort(normalized)

	return normalized
}
