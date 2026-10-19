package listconversionrules

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/conversionrules"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type (
	Filter = conversionrules.Filter
	Deps   struct {
		UserProvider currentuser.Provider
		Queries      *db.Queries
	}
)
type UseCase struct{ deps Deps }

func NewUseCase(deps Deps) *UseCase { return &UseCase{deps: deps} }
func (h *UseCase) Execute(ctx context.Context, slug string, filter Filter) ([]*schema.ConversionRule, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	status := schema.ConversionRuleActive
	if filter.Status != nil {
		status = *filter.Status
	}
	if status != schema.ConversionRuleActive && status != schema.ConversionRuleArchived {
		return nil, apierrors.UnprocessableEntity("ListConversionRules.InvalidStatus", "invalid rule status")
	}
	license, err := conversionrules.LicenseID(ctx, h.deps.Queries, user.OrganizationID, slug, "ListConversionRules")
	if err != nil {
		return nil, err
	}
	dbStatus := db.CreditConversionRuleStatus(status)
	rows, err := h.deps.Queries.ListConversionRules(ctx, db.ListConversionRulesParams{OrganizationID: user.OrganizationID, LicenseIds: []uuid.UUID{license}, RuleID: nil, Status: &dbStatus, EntitlementSlug: filter.EntitlementSlug, ModelSlug: filter.ModelSlug})
	if err != nil {
		return nil, err
	}
	result := make([]*schema.ConversionRule, 0, len(rows))
	for _, row := range rows {
		result = append(result, conversionrules.Present(row))
	}
	return result, nil
}
