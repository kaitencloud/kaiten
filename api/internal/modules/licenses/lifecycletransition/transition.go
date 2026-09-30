// Package lifecycletransition moves one license version from one lifecycle
// state to another. publishlicense, archivelicense and
// unarchivelicense each describe one Transition and publish it as an
// operation; the rules they share -- lock the version, check where it stands,
// move it, record the event -- live here once.
package lifecycletransition

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/familyevents"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Transition is one edge of the lifecycle graph. There is no edge back to
// DRAFT: a version that has been offered cannot become one that never was.
type Transition struct {
	// Operation prefixes the error codes, e.g. "PublishLicense".
	Operation string
	From      schema.LifecycleState
	To        schema.LifecycleState
	// Event is recorded in the outbox when the version moves.
	Event events.Metadata
	// WrongStateCode and WrongState report a version that is not in From:
	// the code a client branches on, and a message saying what applies
	// instead.
	WrongStateCode string
	WrongState     func(slug string, current schema.LifecycleState) string
}

// Deps lists exactly what a transition needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider  currentuser.Provider
	Uof           *uow.UnitOfWork
	UsageReporter services.UsageReporter
}

// UseCase applies one Transition for the current user. Each operation package
// wraps it in a UseCase of its own, so the facade names the operation it runs.
type UseCase struct {
	deps       Deps
	transition Transition
	repo       *Repository
	outbox     *outbox.ScopedRepository
	families   *familyevents.Recorder
}

func NewUseCase(deps Deps, transition Transition) *UseCase {
	outboxRepository := outbox.NewScopedRepository(deps.Uof)
	return &UseCase{
		deps:       deps,
		transition: transition,
		repo:       NewRepository(deps.Uof),
		outbox:     outboxRepository,
		families:   familyevents.NewRecorder(deps.Uof, outboxRepository),
	}
}

func (h *UseCase) Execute(ctx context.Context, slug string) (*schema.License, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	var moved *schema.License
	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		license, family, err := h.repo.apply(ctx, h.transition, slug, user.ID, user.OrganizationID)
		if err != nil {
			return err
		}
		moved = license

		err = h.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
			user.OrganizationID,
			h.transition.Event.Name,
			h.transition.Event.Type,
			license,
			nil,
		))
		if err != nil {
			return err
		}

		// A version put on sale, or withdrawn, can be the one its family
		// serves from now on, or the one it stops serving.
		return h.families.Moved(ctx, user.OrganizationID, family)
	})
	if err != nil {
		return nil, err
	}

	// A lifecycle move is an update of the license, and billed as one.
	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.LicenseUpdatedEntitlementSlug)

	return moved, nil
}

type Repository struct {
	uof *uow.UnitOfWork
}

func NewRepository(uof *uow.UnitOfWork) *Repository {
	return &Repository{uof: uof}
}

// Apply moves the version to t.To, provided it stands at t.From. It records no
// event: the use case does, through apply, which also reports what the
// family served before the move.
func (r *Repository) Apply(
	ctx context.Context, t Transition, slug string, userID, organizationID uuid.UUID,
) (*schema.License, error) {
	license, _, err := r.apply(ctx, t, slug, userID, organizationID)
	return license, err
}

// apply is Apply, returning as well what the version's family served before
// the move.
//
// The family's row is locked first, as every other version write locks it
// before touching a version, so the version the family serves is read before
// and after the move without another write moving it in between -- and the
// lock order stays family, then version, which is what keeps these writes from
// deadlocking one another.
//
// The version's row is then locked (FOR NO KEY UPDATE) before its state is
// read, so the check and the move see the same row: a concurrent transition
// waits and then finds the state this one left, and an instance being assigned
// the version (whose trigger locks it FOR SHARE) is serialized with an archive.
func (r *Repository) apply(
	ctx context.Context, t Transition, slug string, userID, organizationID uuid.UUID,
) (*schema.License, familyevents.Before, error) {
	queries := db.New(r.uof.DBTX(ctx))

	familyID, err := queries.LockLicenseFamilyOfLicense(ctx, db.LockLicenseFamilyOfLicenseParams{
		OrganizationID: organizationID,
		Slug:           slug,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, familyevents.Before{}, notFound(t, slug)
		}
		return nil, familyevents.Before{}, err
	}
	before, err := familyevents.Read(ctx, queries, organizationID, familyID)
	if err != nil {
		return nil, familyevents.Before{}, err
	}

	current, err := queries.LockLicenseLifecycleStateBySlug(ctx, db.LockLicenseLifecycleStateBySlugParams{
		OrganizationID: organizationID,
		Slug:           slug,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, familyevents.Before{}, notFound(t, slug)
		}
		return nil, familyevents.Before{}, err
	}
	if schema.LifecycleState(current) != t.From {
		return nil, familyevents.Before{}, kaitenerrors.Conflict(t.WrongStateCode, t.WrongState(slug, schema.LifecycleState(current)))
	}

	row, err := queries.TransitionLicenseLifecycleState(ctx, db.TransitionLicenseLifecycleStateParams{
		OrganizationID: organizationID,
		UserID:         userID,
		Slug:           slug,
		FromState:      db.LicenseLifecycleState(t.From),
		ToState:        db.LicenseLifecycleState(t.To),
	})
	if err != nil {
		// No row despite the lock: the membership join refused the caller,
		// which is reported the way EditLicense reports it.
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, familyevents.Before{}, notFound(t, slug)
		}
		// Only a transition away from PUBLISHED can break the constraint, and
		// only one is defined: archiving the family's default.
		if kaitenerrors.IsCheckViolationOnConstraint(err, dbmap.DefaultMustBePublishedConstraint) {
			return nil, familyevents.Before{}, kaitenerrors.Conflict(t.Operation+".DefaultMustBePublished",
				fmt.Sprintf("License %q is its family's default, and a default must stay PUBLISHED; make another published version the default, or unset it, first", slug))
		}
		return nil, familyevents.Before{}, err
	}

	license, err := dbmap.ToLicense(&row)
	if err != nil {
		return nil, familyevents.Before{}, err
	}
	return license, before, nil
}

func notFound(t Transition, slug string) error {
	return kaitenerrors.NotFound(t.Operation+".NotFound", fmt.Sprintf("License with slug %q not found", slug))
}
