package archiveaddon

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/events"
)

var transition = catalogue.Transition{
	Operation:      "ArchiveAddon",
	From:           catalogue.Published,
	To:             catalogue.Archived,
	Event:          events.AddonArchived,
	WrongStateCode: "ArchiveAddon.NotPublished",
}

type UseCase struct {
	deps   catalogue.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps catalogue.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute moves the version from Published to Archived.
func (u *UseCase) Execute(ctx context.Context, slug string) (*catalogue.Addon, error) {
	return transition.Move(ctx, u.deps, u.outbox, slug)
}
