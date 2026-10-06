package archivelicense

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/lifecycletransition"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
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
	// A version a subscription is scheduled to move to stays on sale until
	// the move: the close must never meet an archived target.
	Guard: func(ctx context.Context, queries *db.Queries, organizationID uuid.UUID, slug string) error {
		target, err := queries.VersionIsPlanChangeTarget(ctx, db.VersionIsPlanChangeTargetParams{OrganizationID: organizationID, LicenseSlug: slug})
		if err != nil {
			return err
		}
		if target {
			return kaitenerrors.Conflict("ArchiveLicense.PlanChangeTarget",
				fmt.Sprintf("License %q is the target of a scheduled plan change; cancel the change first", slug))
		}
		return nil
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
