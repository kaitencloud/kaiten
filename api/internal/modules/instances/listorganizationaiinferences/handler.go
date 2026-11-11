// Package listorganizationaiinferences lists the organization's AI operations
// across instances and credit pools: the same record as the per-pool history,
// with the instance and the pool each operation belongs to.
package listorganizationaiinferences

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/aihistory"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

type Deps struct {
	AIPolicy     aiusage.Policy
	UserProvider currentuser.Provider
	Queries      *db.Queries
}

type UseCase struct{ reader aihistory.Reader }

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{reader: aihistory.Reader{AIPolicy: deps.AIPolicy, User: deps.UserProvider, Queries: deps.Queries}}
}

// Execute reads one page, newest first. It passes the AI gate before reading,
// like every AI use case; a range or cursor it cannot use answers 422.
func (u *UseCase) Execute(ctx context.Context, filter aihistory.OrganizationFilter) (schema.OrganizationAiInferencePage, error) {
	return u.reader.OrganizationInferences(ctx, filter)
}
