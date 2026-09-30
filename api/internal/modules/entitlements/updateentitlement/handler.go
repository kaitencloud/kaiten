package updateentitlement

import (
	"context"
	"slices"
	"strings"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	entitlementEvents "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider  currentuser.Provider
	Uof           *uow.UnitOfWork
	UsageReporter services.UsageReporter
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

func (h *UseCase) Execute(ctx context.Context, command *Command, slug string) error {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}

	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		currentEntitlement, err := h.repo.GetEntitlement(ctx, slug, user.OrganizationID)
		if err != nil {
			return err
		}

		if command.Type != nil && currentEntitlement.Type != nil && *command.Type != *currentEntitlement.Type {
			return kaitenerrors.Validation("UpdateEntitlement.ImmutableType", "type is immutable and cannot be changed after creation")
		}
		if command.AggregationMethod != nil {
			if currentEntitlement.AggregationMethod == nil || *command.AggregationMethod != *currentEntitlement.AggregationMethod {
				return kaitenerrors.Validation("UpdateEntitlement.ImmutableAggregationMethod", "aggregationMethod is immutable and cannot be changed after creation")
			}
		}
		// Unlike Type/AggregationMethod above, reset_period/reset_anchor are
		// optional even for NUMBER entitlements (nil = lifetime counter), so an
		// omitted field can't be caught by a "required field" validation the
		// way a missing aggregationMethod is. Once configured (current != nil),
		// this PUT must echo back the exact same value -- omitting it is an
		// attempted removal, not a reset to null, and is rejected the same as
		// an attempted change. Before configured, any value (including nil, to
		// stay lifetime) is allowed.
		if currentEntitlement.ResetPeriod != nil {
			if command.ResetPeriod == nil || *command.ResetPeriod != *currentEntitlement.ResetPeriod {
				return kaitenerrors.Validation("UpdateEntitlement.ImmutableResetPeriod", "resetPeriod is immutable once configured and cannot be changed or removed")
			}
		}
		if currentEntitlement.ResetAnchor != nil {
			if command.ResetAnchor == nil || *command.ResetAnchor != *currentEntitlement.ResetAnchor {
				return kaitenerrors.Validation("UpdateEntitlement.ImmutableResetAnchor", "resetAnchor is immutable once configured and cannot be changed or removed")
			}
		}

		currentType := schema.Boolean
		if currentEntitlement.Type != nil {
			currentType = *currentEntitlement.Type
		}
		if err := schema.ValidateTypeConfiguration(currentType, currentEntitlement.AggregationMethod); err != nil {
			return kaitenerrors.Validation("UpdateEntitlement.InvalidTypeConfiguration", err.Error())
		}

		if command.Icon != nil {
			if err := schema.ValidateIcon(*command.Icon); err != nil {
				return kaitenerrors.Validation("UpdateEntitlement.InvalidIcon", err.Error())
			}
		}

		if err := schema.ValidateUnitsConfiguration(
			currentType,
			command.UnitSingular, command.UnitPlural,
			command.SaleUnitSingular, command.SaleUnitPlural, command.SaleUnitFactor,
		); err != nil {
			return kaitenerrors.Validation("UpdateEntitlement.InvalidUnitsConfiguration", err.Error())
		}

		if err := schema.ValidateWarningThresholdConfiguration(
			currentType, command.WarningThresholdPercent,
		); err != nil {
			return kaitenerrors.Validation("UpdateEntitlement.InvalidEnforcementPolicyConfiguration", err.Error())
		}

		// Default anchor when enabling a reset period without specifying one.
		// When reset_period is already configured, the immutability check above
		// already guarantees command.ResetAnchor equals the stored value, so
		// this is a no-op in that case.
		resolvedResetAnchor := command.ResetAnchor
		if command.ResetPeriod != nil && resolvedResetAnchor == nil {
			calendar := period.Calendar
			resolvedResetAnchor = &calendar
		}
		if err := schema.ValidateResetConfiguration(
			currentType, currentEntitlement.AggregationMethod, command.ResetPeriod, resolvedResetAnchor,
		); err != nil {
			return kaitenerrors.Validation("UpdateEntitlement.InvalidResetConfiguration", err.Error())
		}

		// PUT is full-replace: an absent userFacing means not user facing.
		resolvedUserFacing := false
		if command.UserFacing != nil {
			resolvedUserFacing = *command.UserFacing
		}

		// PUT is full-replace: an absent display order resets it to 0.
		var resolvedDisplayOrder int32
		if command.DisplayOrder != nil {
			resolvedDisplayOrder = *command.DisplayOrder
		}

		// PUT is full-replace: an absent warning threshold resets it to 0 (disabled).
		var resolvedWarningThresholdPercent int32
		if command.WarningThresholdPercent != nil {
			resolvedWarningThresholdPercent = *command.WarningThresholdPercent
		}

		_, err = h.repo.UpdateEntitlement(ctx, UpdateEntitlementInput{
			Name:                    command.Name,
			Description:             command.Description,
			Type:                    currentType,
			Icon:                    command.Icon,
			UnitSingular:            command.UnitSingular,
			UnitPlural:              command.UnitPlural,
			SaleUnitSingular:        command.SaleUnitSingular,
			SaleUnitPlural:          command.SaleUnitPlural,
			SaleUnitFactor:          command.SaleUnitFactor,
			UserFacing:              resolvedUserFacing,
			DisplayOrder:            resolvedDisplayOrder,
			WarningThresholdPercent: resolvedWarningThresholdPercent,
			ResetPeriod:             command.ResetPeriod,
			ResetAnchor:             resolvedResetAnchor,
		}, slug, user.OrganizationID)
		if err != nil {
			return err
		}

		if command.GroupSlugs != nil {
			targetGroupSlugs := normalizeGroupSlugs(command.GroupSlugs)
			currentGroupSlugs := make([]string, 0, len(currentEntitlement.EntitlementGroups))

			for _, group := range currentEntitlement.EntitlementGroups {
				if group == nil {
					continue
				}
				currentGroupSlugs = append(currentGroupSlugs, group.Slug)
			}

			currentGroupSlugs = normalizeGroupSlugs(currentGroupSlugs)

			for _, groupSlug := range targetGroupSlugs {
				if slices.Contains(currentGroupSlugs, groupSlug) {
					continue
				}
				if err := h.repo.AddEntitlementToGroup(ctx, groupSlug, slug, user.OrganizationID); err != nil {
					return err
				}
			}

			for _, groupSlug := range currentGroupSlugs {
				if slices.Contains(targetGroupSlugs, groupSlug) {
					continue
				}
				if err := h.repo.RemoveEntitlementFromGroup(ctx, groupSlug, slug, user.OrganizationID); err != nil {
					return err
				}
			}
		}

		updatedEntitlement, err := h.repo.GetEntitlement(ctx, slug, user.OrganizationID)
		if err != nil {
			return err
		}

		event := outbox.NewOutboxMessage(
			user.OrganizationID,
			entitlementEvents.EntitlementUpdated.Name,
			entitlementEvents.EntitlementUpdated.Type,
			updatedEntitlement,
			nil,
		)

		return h.outbox.CreateOutboxEvent(ctx, event)
	})
	if err != nil {
		return err
	}

	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.EntitlementUpdatedEntitlementSlug)

	return nil
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
