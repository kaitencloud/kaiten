package publishlicense

import (
	"context"
	"fmt"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/lifecycletransition"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
)

// transition is DRAFT to PUBLISHED: a version being prepared goes on sale.
var transition = lifecycletransition.Transition{
	Operation:      "PublishLicense",
	From:           schema.Draft,
	To:             schema.Published,
	Event:          events.LicensePublished,
	WrongStateCode: "PublishLicense.NotADraft",
	WrongState: func(slug string, current schema.LifecycleState) string {
		if current == schema.Archived {
			return fmt.Sprintf("License %q is archived; unarchive it to put it back on sale", slug)
		}
		return fmt.Sprintf("License %q is already published", slug)
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
