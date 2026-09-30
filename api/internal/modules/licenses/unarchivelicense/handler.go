package unarchivelicense

import (
	"context"
	"fmt"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/lifecycletransition"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
)

// transition is ARCHIVED to PUBLISHED: a withdrawn version goes back on sale.
var transition = lifecycletransition.Transition{
	Operation:      "UnarchiveLicense",
	From:           schema.Archived,
	To:             schema.Published,
	Event:          events.LicenseUnarchived,
	WrongStateCode: "UnarchiveLicense.NotArchived",
	WrongState: func(slug string, current schema.LifecycleState) string {
		if current == schema.Draft {
			return fmt.Sprintf("License %q is a draft; publish it instead", slug)
		}
		return fmt.Sprintf("License %q is not archived", slug)
	},
}

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps = lifecycletransition.Deps

type UseCase struct {
	transition *lifecycletransition.UseCase
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{transition: lifecycletransition.NewUseCase(deps, transition)}
}

func (h *UseCase) Execute(ctx context.Context, slug string) (*schema.License, error) {
	return h.transition.Execute(ctx, slug)
}
