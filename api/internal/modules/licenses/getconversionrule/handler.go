package getconversionrule

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/conversionrules"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

type Deps struct {
	AIPolicy     aiusage.Policy
	UserProvider currentuser.Provider
	Queries      *db.Queries
}
type UseCase struct{ deps Deps }

func NewUseCase(deps Deps) *UseCase { return &UseCase{deps: deps} }
func (h *UseCase) Execute(ctx context.Context, slug string, id uuid.UUID) (*schema.ConversionRule, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	if err := h.deps.AIPolicy.RequireEnabled(); err != nil {
		return nil, err
	}
	license, err := conversionrules.LicenseID(ctx, h.deps.Queries, user.OrganizationID, slug, "GetConversionRule")
	if err != nil {
		return nil, err
	}
	return conversionrules.Get(ctx, h.deps.Queries, user.OrganizationID, license, id, "GetConversionRule")
}
