package createcustomer

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
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

// EntitlementLimitReachedCode is the error code EnforceCreationLimit returns
// on a threshold breach. Exported so a caller composing Execute (which
// enforces the limit internally, exactly once, as part of its own atomic
// flow -- see Execute's doc comment) can recognize this specific rejection
// and re-code it for its own API surface without guessing at or duplicating
// the string.
const EntitlementLimitReachedCode = "CreateCustomer.EntitlementLimitReached"

type UseCase struct {
	deps   Deps
	repo   *CommandRepository
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:   deps,
		repo:   NewCommandRepository(deps.Uof),
		outbox: outbox.NewScopedRepository(deps.Uof),
	}
}

// Execute resolves the customer's slug, enforces the creation entitlement,
// and persists the customer, as one atomic unit -- a caller cannot enforce
// the limit itself and then call Execute, because Execute always enforces it
// again internally (the direct HTTP endpoint has no other way to reach this
// check). A caller that needs a different error code for the rejection --
// upsertintegration is the one example today -- calls Execute directly and
// recognizes EntitlementLimitReachedCode in the returned error, rather than
// calling EnforceCreationLimit separately first, which would report usage
// twice for one logical creation.
func (h *UseCase) Execute(ctx context.Context, command *Command) (*schema.Customer, error) {
	u, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	if command.Slug != nil {
		slug, err := slugutil.New(*command.Slug)
		if err != nil {
			return nil, kaitenerrors.Validation("CreateCustomer.InvalidSlug", slugutil.InvalidReason(*command.Slug))
		}

		return h.enforceAndPersist(ctx, u.OrganizationID, slug.String(), command.Name, func(ctx context.Context) (*schema.Customer, error) {
			return h.persistCustomer(ctx, u.OrganizationID, u.ID, command, slug.String())
		})
	}

	// No caller-supplied slug: derive one from the name. GenerateUnique's
	// random suffix makes a database-level collision astronomically
	// unlikely but, per its own doc comment, not impossible -- so a rare
	// conflict is retried with a freshly generated slug (slugutil.Retry)
	// rather than surfaced as a hard failure for something outside the
	// caller's control. enforceAndPersist must enforce exactly once
	// regardless of how many slug attempts the retry loop takes below, so
	// the whole loop runs as its single persist step -- the auditSlug
	// generated here is only ever used for the rejection's audit record,
	// never persisted, since a rejection means the retry loop never runs.
	auditSlug, err := slugutil.GenerateUnique(command.Name)
	if err != nil {
		return nil, fmt.Errorf("failed to generate slug: %w", err)
	}

	return h.enforceAndPersist(ctx, u.OrganizationID, auditSlug, command.Name, func(ctx context.Context) (*schema.Customer, error) {
		return slugutil.Retry(
			slugutil.DefaultMaxAttempts,
			func() (string, error) { return slugutil.GenerateUnique(command.Name) },
			func(slug string) (*schema.Customer, error) {
				return h.persistCustomer(ctx, u.OrganizationID, u.ID, command, slug)
			},
		)
	})
}

// enforceAndPersist enforces the creation entitlement and then calls
// persist, delegating the whole enforce/persist/compensate sequence to
// dogfooding.EnforceAndPersist. persist is a parameter (rather than
// always calling h.persistCustomer directly) so this compensation wiring
// can be exercised in a unit test with a forced persistence failure,
// without a real transaction.
func (h *UseCase) enforceAndPersist(
	ctx context.Context,
	orgID uuid.UUID,
	slug, name string,
	persist func(ctx context.Context) (*schema.Customer, error),
) (*schema.Customer, error) {
	return dogfooding.EnforceAndPersist(ctx, h.deps.UsageReporter, orgID, dogfooding.CustomerEntitlementSlug,
		EntitlementLimitReachedCode, "Customer creation limit reached for this organization",
		func() { h.recordRejectedCreation(ctx, orgID, name, slug) },
		persist)
}

// EnforceCreationLimit checks the organization's customer-creation
// entitlement and, on a threshold breach, records a CustomerCreationRejected
// outbox event before returning a conflict error. Exported so any entry
// point that can create a customer -- not just this package's own Execute --
// shares the identical check and the identical rejection event, instead of
// each reimplementing (and inevitably drifting from) the same rule.
func (h *UseCase) EnforceCreationLimit(ctx context.Context, orgID uuid.UUID, slug, name string) error {
	_, err := dogfooding.EnforceCreationLimit(ctx, h.deps.UsageReporter, orgID, dogfooding.CustomerEntitlementSlug,
		EntitlementLimitReachedCode, "Customer creation limit reached for this organization",
		func() { h.recordRejectedCreation(ctx, orgID, name, slug) })
	return err
}

func (h *UseCase) recordRejectedCreation(ctx context.Context, orgID uuid.UUID, name, slug string) {
	event := outbox.NewOutboxMessage(
		orgID,
		events.CustomerCreationRejected.Name,
		events.CustomerCreationRejected.Type,
		&schema.CustomerCreationRejected{
			Name:   name,
			Slug:   slug,
			Reason: "customer creation limit reached",
		},
		nil,
	)

	err := h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		return h.outbox.CreateOutboxEvent(ctx, event)
	})
	if err != nil {
		slog.ErrorContext(ctx, "failed to record customer creation rejected event",
			"organization_id", orgID, "error", err)
	}
}

func (h *UseCase) persistCustomer(ctx context.Context, orgID, userID uuid.UUID, command *Command, slug string) (*schema.Customer, error) {
	var customer *schema.Customer

	err := h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		createdCustomer, err := h.repo.CreateCustomer(ctx, command.Name, slug, command.ExternalCustomerID, command.Domain, orgID, userID)
		if err != nil {
			return err
		}

		integrations, err := h.repo.UpsertCustomerIntegrations(ctx, orgID, createdCustomer.ID, command.Integrations)
		if err != nil {
			return err
		}
		createdCustomer.Integrations = integrations

		customer = createdCustomer

		event := outbox.NewOutboxMessage(
			orgID,
			events.CustomerCreated.Name,
			events.CustomerCreated.Type,
			createdCustomer,
			nil,
		)

		return h.outbox.CreateOutboxEvent(ctx, event)
	})
	if err != nil {
		return nil, err
	}

	return customer, nil
}
