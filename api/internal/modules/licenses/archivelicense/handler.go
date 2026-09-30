package archivelicense

import (
	"context"
	"fmt"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/lifecycletransition"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
)

// Transition is PUBLISHED to ARCHIVED: a version on sale is withdrawn.
// Exported so tests can archive a version the way the API does.
var Transition = lifecycletransition.Transition{
	Operation:      "ArchiveLicense",
	From:           schema.Published,
	To:             schema.Archived,
	Event:          events.LicenseArchived,
	WrongStateCode: "ArchiveLicense.NotPublished",
	WrongState: func(slug string, current schema.LifecycleState) string {
		if current == schema.Draft {
			return fmt.Sprintf("License %q is a draft and was never on sale; delete it instead", slug)
		}
		return fmt.Sprintf("License %q is already archived", slug)
	},
}

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps = lifecycletransition.Deps

type UseCase struct {
	transition *lifecycletransition.UseCase
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{transition: lifecycletransition.NewUseCase(deps, Transition)}
}

func (h *UseCase) Execute(ctx context.Context, slug string) (*schema.License, error) {
	return h.transition.Execute(ctx, slug)
}
