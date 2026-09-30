package patchinstance

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/patchutil"
)

type InstanceStatusChanged struct {
	InstanceID     uuid.UUID             `json:"instance_id" format:"uuid"`
	PreviousStatus schema.InstanceStatus `json:"previous_status" enum:"HEALTHY,DEGRADED,INCIDENT,MAINTENANCE"`
	NewStatus      schema.InstanceStatus `json:"new_status" enum:"HEALTHY,DEGRADED,INCIDENT,MAINTENANCE"`
	ChangedBy      uuid.UUID             `json:"changed_by" format:"uuid"`
}

type InstanceLifecycleStageChanged struct {
	InstanceID             uuid.UUID `json:"instance_id" format:"uuid"`
	PreviousLifecycleStage *string   `json:"previous_lifecycle_stage"`
	NewLifecycleStage      *string   `json:"new_lifecycle_stage"`
	ChangedBy              uuid.UUID `json:"changed_by" format:"uuid"`
}

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider currentuser.Provider
	Uof          *uow.UnitOfWork
}

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

func (h *UseCase) Execute(ctx context.Context, command *Command, slug string) error {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}

	return h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		current, err := h.repo.GetInstance(ctx, slug, user.OrganizationID)
		if err != nil {
			return err
		}

		afterStatus, err := h.applyStatus(ctx, command, current, slug, user)
		if err != nil {
			return err
		}

		afterLifecycle, err := h.applyLifecycleStage(ctx, command, current, slug, user)
		if err != nil {
			return err
		}

		// Connectors (e.g. the Attio worker) only consume the generic updated
		// event, so any effective patch must also surface as INSTANCE_UPDATED.
		updated := afterLifecycle
		if updated == nil {
			updated = afterStatus
		}
		if updated == nil {
			return nil
		}

		updateEvent := outbox.NewOutboxMessage(
			user.OrganizationID,
			events.InstanceUpdated.Name,
			events.InstanceUpdated.Type,
			updated,
			outbox.AuditHeaders{InstanceID: &updated.ID},
		)

		return h.outbox.CreateOutboxEvent(ctx, updateEvent)
	})
}

func (h *UseCase) applyStatus(
	ctx context.Context,
	command *Command,
	current *schema.Instance,
	slug string,
	user *currentuser.User,
) (*schema.Instance, error) {
	resolvedStatus := patchutil.ResolveOptional(current.Status, command.Status)
	if !patchutil.Changed(current.Status, resolvedStatus) {
		return nil, nil
	}

	updated, err := h.repo.UpdateInstanceStatus(ctx, resolvedStatus, slug, user.ID, user.OrganizationID)
	if err != nil {
		return nil, err
	}

	payload := InstanceStatusChanged{
		InstanceID:     updated.ID,
		PreviousStatus: current.Status,
		NewStatus:      updated.Status,
		ChangedBy:      user.ID,
	}
	event := outbox.NewOutboxMessage(
		user.OrganizationID,
		events.InstanceStatusChanged.Name,
		events.InstanceStatusChanged.Type,
		payload,
		outbox.AuditHeaders{InstanceID: &updated.ID},
	)

	if err := h.outbox.CreateOutboxEvent(ctx, event); err != nil {
		return nil, err
	}

	return updated, nil
}

func (h *UseCase) applyLifecycleStage(
	ctx context.Context,
	command *Command,
	current *schema.Instance,
	slug string,
	user *currentuser.User,
) (*schema.Instance, error) {
	resolvedLifecycleStage := patchutil.ResolveOptionalPointer(current.LifecycleStage, command.LifecycleStage)
	if patchutil.PointersEqual(current.LifecycleStage, resolvedLifecycleStage) {
		return nil, nil
	}

	updated, err := h.repo.UpdateInstanceLifecycleStage(ctx, resolvedLifecycleStage, slug, user.ID, user.OrganizationID)
	if err != nil {
		return nil, err
	}

	payload := InstanceLifecycleStageChanged{
		InstanceID:             updated.ID,
		PreviousLifecycleStage: current.LifecycleStage,
		NewLifecycleStage:      updated.LifecycleStage,
		ChangedBy:              user.ID,
	}
	event := outbox.NewOutboxMessage(
		user.OrganizationID,
		events.InstanceLifecycleStageChanged.Name,
		events.InstanceLifecycleStageChanged.Type,
		payload,
		outbox.AuditHeaders{InstanceID: &updated.ID},
	)

	if err := h.outbox.CreateOutboxEvent(ctx, event); err != nil {
		return nil, err
	}

	return updated, nil
}
