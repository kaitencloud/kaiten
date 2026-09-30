package createlicense

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/familydefault"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/familyevents"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider  currentuser.Provider
	UsageReporter services.UsageReporter
	Uof           *uow.UnitOfWork
}

type UseCase struct {
	deps     Deps
	repo     *CommandRepository
	outbox   *outbox.ScopedRepository
	families *familyevents.Recorder
}

func NewUseCase(deps Deps) *UseCase {
	outboxRepository := outbox.NewScopedRepository(deps.Uof)
	return &UseCase{
		deps:     deps,
		repo:     NewCommandRepository(deps.Uof).WithClearedDefaults(familydefault.Announce(outboxRepository)),
		outbox:   outboxRepository,
		families: familyevents.NewRecorder(deps.Uof, outboxRepository),
	}
}

// Execute validates the license's caller-supplied slug (if any) and its
// lifecycle state, enforces the creation entitlement when the license opens a
// new family, and persists the license, as one flow: dogfooding.EnforceAndPersist
// skips persistence entirely if the organization is over its limit, and
// compensates with a Decrement call if persistence -- including its
// slug-conflict retries -- fails after usage was already incremented.
//
// The licenses quota counts products, not versions. A version
// joins a family the organization already has, so it is persisted without
// being metered: counting it would make every revision, draft and withdrawn
// version cost a license, and an organization at its limit could not revise
// any of its products. deletelicense decrements to match, only when the
// version it deletes takes its family with it.
func (h *UseCase) Execute(ctx context.Context, command *Command) (*schema.License, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	if command.Slug != nil {
		if _, err := slugutil.New(*command.Slug); err != nil {
			return nil, kaitenerrors.Validation("CreateLicense.InvalidSlug", slugutil.InvalidReason(*command.Slug))
		}
	}

	// ARCHIVED means withdrawn from sale, and archive-license is the one way
	// there: it moves a PUBLISHED version and records LICENSE_ARCHIVED. A
	// version created archived would read as withdrawn without ever
	// having been on sale, and would leave only a LICENSE_CREATED behind.
	// Refused here rather than in the repository, so the API and the seeder --
	// the two callers of this use case -- both keep to it, while tests can still
	// stage an archived row through the repository. Compared the way the
	// repository normalizes the state.
	if strings.EqualFold(string(command.LifecycleState), string(schema.Archived)) {
		return nil, kaitenerrors.UnprocessableEntity("CreateLicense.LifecycleStateNotSettable",
			"a license is created DRAFT or PUBLISHED; it becomes ARCHIVED through archive-license, which withdraws a published version from sale")
	}

	persist := func(ctx context.Context) (*schema.License, error) {
		attempt := func(slug string) (*schema.License, error) {
			return h.persistLicense(ctx, user.OrganizationID, command, &slug)
		}

		if command.Slug != nil {
			return attempt(*command.Slug)
		}

		// A new version of an existing family takes {familySlug}-v{n}, which
		// the repository derives under the family's row lock -- the only
		// place n is known. So there is nothing to generate here, and
		// nothing to retry either: the derived slug is unique within a
		// family that is serialized. It can still collide with a row
		// outside the family (a license elsewhere that happens to hold that
		// slug), and only then does this fall back to a generated one.
		if !command.opensFamily() {
			license, err := h.persistLicense(ctx, user.OrganizationID, command, nil)
			if err == nil || !errors.Is(err, slugutil.ErrConflict) {
				return license, err
			}
		}

		// No caller-supplied slug: derive one from the name, retrying with a
		// freshly generated slug whenever the database detects a conflict on
		// it -- slugutil.GenerateUnique's random suffix makes a
		// collision unlikely but not impossible.
		return slugutil.Retry(
			slugutil.DefaultMaxAttempts,
			func() (string, error) { return slugutil.GenerateUnique(command.Name) },
			attempt,
		)
	}

	if !command.opensFamily() {
		return persist(ctx)
	}

	return dogfooding.EnforceAndPersist(ctx, h.deps.UsageReporter, user.OrganizationID, dogfooding.LicenseEntitlementSlug,
		"CreateLicense.EntitlementLimitReached",
		"License creation limit reached for this organization: the limit counts license families, not their versions",
		nil, persist)
}

// persistLicense writes the license in one transaction with its outbox event,
// with those of the versions it took the family's default from, and with its
// family's: LICENSE_FAMILY_CREATED when the license opened the family, or
// LICENSE_FAMILY_UPDATED when joining it changed the version it serves.
// A nil slug means the repository derives it, which only the family-targeted
// path does; every other caller has already settled on one.
func (h *UseCase) persistLicense(ctx context.Context, orgID uuid.UUID, command *Command, slug *string) (*schema.License, error) {
	command.Slug = slug

	var license *schema.License

	err := h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		createdLicense, family, err := h.repo.create(ctx, command, orgID)
		if err != nil {
			return err
		}

		license = createdLicense

		// The family first when this version opened it: the product exists
		// before the version that names it.
		if family.opened {
			if err := h.families.Created(ctx, orgID, family.before.FamilyID); err != nil {
				return err
			}
		}

		event := outbox.NewOutboxMessage(
			orgID,
			events.LicenseCreated.Name,
			events.LicenseCreated.Type,
			createdLicense,
			nil,
		)
		if err := h.outbox.CreateOutboxEvent(ctx, event); err != nil {
			return err
		}

		if family.opened {
			return nil
		}
		return h.families.Moved(ctx, orgID, family.before)
	})
	if err != nil {
		return nil, err
	}

	return license, nil
}
