package publishaddon

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/events"
)

var transition = catalogue.Transition{
	Operation:      "PublishAddon",
	From:           catalogue.Draft,
	To:             catalogue.Published,
	Event:          events.AddonPublished,
	WrongStateCode: "PublishAddon.NotADraft",
}

type UseCase struct {
	deps   catalogue.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps catalogue.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute moves the version from Draft to Published.
func (u *UseCase) Execute(ctx context.Context, slug string) (*catalogue.Addon, error) {
	return transition.Move(ctx, u.deps, u.outbox, slug)
}
