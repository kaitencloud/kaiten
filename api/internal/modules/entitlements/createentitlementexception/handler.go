// Package createentitlementexception sets the vendor's exception on one
// entitlement of one instance (§13.16, V32-03 a): the last layer of the view,
// from startsAt to endsAt, whether or not billing is enabled.
package createentitlementexception

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/exceptions"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "CreateEntitlementException"

// Command is an exception to set. Value is the raw JSON as sent: empty when
// absent.
type Command struct {
	EntitlementSlug string
	Kind            string
	Value           exceptions.Value
	StartsAt        *time.Time
	EndsAt          *time.Time
	Reason          string
}

type UseCase struct {
	deps   exceptions.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps exceptions.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute validates the exception against its entitlement's type, refuses a
// window that meets another unrevoked one of the pair (INV-37), and saves it
// with its .created event. The instance's lock serializes its exception
// writes, so the overlap read names the exception the constraint would refuse.
func (u *UseCase) Execute(ctx context.Context, instanceSlug string, cmd Command) (*exceptions.EntitlementException, error) {
	if strings.TrimSpace(cmd.Reason) == "" || utf8.RuneCountInString(cmd.Reason) > 500 {
		return nil, kaitenerrors.UnprocessableEntity(operation+".ReasonRequired", "an exception gives its reason, of at most 500 characters")
	}
	user, err := u.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	var created exceptions.EntitlementException
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		instance, err := exceptions.FindInstance(ctx, q, user.OrganizationID, instanceSlug, true, operation)
		if err != nil {
			return err
		}
		entitlement, err := q.GetEntitlementForException(ctx, db.GetEntitlementForExceptionParams{OrganizationID: user.OrganizationID, Slug: cmd.EntitlementSlug})
		if errors.Is(err, pgx.ErrNoRows) {
			return kaitenerrors.NotFoundf(operation+".EntitlementNotFound", "entitlement %q not found", cmd.EntitlementSlug)
		}
		if err != nil {
			return err
		}
		value, err := checkValue(entitlement.Type, cmd.Kind, cmd.Value)
		if err != nil {
			return err
		}
		now, err := exceptions.Now(ctx, q)
		if err != nil {
			return err
		}
		startsAt, endsAt := now, cmd.EndsAt
		if cmd.StartsAt != nil {
			startsAt = cmd.StartsAt.UTC().Truncate(time.Millisecond)
		}
		if endsAt != nil {
			ends := endsAt.UTC().Truncate(time.Millisecond)
			if !ends.After(startsAt) || !ends.After(now) {
				return kaitenerrors.UnprocessableEntity(operation+".InvalidWindow", "endsAt is after startsAt and after now")
			}
			endsAt = &ends
		}
		ends := pgtype.Timestamp{}
		if endsAt != nil {
			ends = exceptions.Timestamp(*endsAt)
		}
		overlapping, err := q.FindOverlappingException(ctx, db.FindOverlappingExceptionParams{
			OrganizationID: user.OrganizationID, InstanceID: instance.ID, EntitlementID: entitlement.ID,
			StartsAt: exceptions.Timestamp(startsAt), EndsAt: ends,
		})
		if err == nil {
			return overlap(&overlapping)
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		id, err := q.InsertEntitlementException(ctx, db.InsertEntitlementExceptionParams{
			OrganizationID: user.OrganizationID, InstanceID: instance.ID, EntitlementID: entitlement.ID,
			Kind: db.EntitlementExceptionKind(cmd.Kind), Value: value, StartsAt: exceptions.Timestamp(startsAt), EndsAt: ends,
			Reason: cmd.Reason, Now: exceptions.Timestamp(now), UserID: user.ID,
		})
		if err != nil {
			return constraintError(err)
		}
		list, err := exceptions.List(ctx, q, user.OrganizationID, instance, &id, false, now)
		if err != nil {
			return err
		}
		created = list[0]
		return exceptions.Emit(ctx, u.outbox, user.OrganizationID, instance.ID, events.InstanceEntitlementExceptionCreated, created)
	})
	if err != nil {
		return nil, err
	}
	return &created, nil
}

// checkValue matches the kind and the value's JSON type to the entitlement's
// type (§13.16) and returns the value to store: nil for UNLIMITED.
func checkValue(entitlementType db.EntitlementType, kind string, raw exceptions.Value) ([]byte, error) {
	number := entitlementType == db.EntitlementTypeNUMBER || entitlementType == db.EntitlementTypeNUMBERAICREDIT
	if !number && kind != exceptions.KindSet {
		return nil, kaitenerrors.UnprocessableEntityf(operation+".InvalidKind", "%s works on NUMBER and NUMBER_AI_CREDIT entitlements only", kind)
	}
	value := bytes.TrimSpace(raw)
	absent := len(value) == 0 || string(value) == "null"
	invalid := func(format string, args ...any) error {
		return kaitenerrors.UnprocessableEntityf(operation+".InvalidValue", format, args...)
	}
	switch {
	case kind == exceptions.KindUnlimited:
		if !absent {
			return nil, invalid("UNLIMITED carries no value")
		}
		return nil, nil
	case absent:
		return nil, invalid("%s carries a value", kind)
	case number:
		var n json.Number
		if err := json.Unmarshal(value, &n); err != nil {
			return nil, invalid("a %s entitlement takes a number", entitlementType)
		}
		f, err := strconv.ParseFloat(n.String(), 64)
		if err != nil {
			return nil, invalid("%s is not a number Kaiten can hold", n)
		}
		if kind == exceptions.KindAdd && f <= 0 {
			return nil, invalid("an ADD is a number above 0")
		}
		if f < 0 {
			return nil, invalid("a SET number is 0 or more; unlimited is the kind UNLIMITED")
		}
	case entitlementType == db.EntitlementTypeBOOLEAN:
		var b bool
		if err := json.Unmarshal(value, &b); err != nil {
			return nil, invalid("a BOOLEAN entitlement takes true or false")
		}
	default:
		if value[0] != '{' {
			return nil, invalid("a CONFIG entitlement takes a JSON object")
		}
	}
	return value, nil
}

// overlap is the 409 naming the exception in the way, when it is known.
func overlap(id *uuid.UUID) error {
	const message = "an unrevoked exception of this instance and entitlement overlaps the window"
	if id == nil {
		return kaitenerrors.Conflict(operation+".Overlap", message)
	}
	return kaitenerrors.ConflictWithErrors(operation+".Overlap", message, &kaitenerrors.ErrorDetail{
		Message: "the exception whose window overlaps", Location: "body", Value: map[string]any{"exceptionId": *id},
	})
}

// constraintError maps the table's guards, behind the checks above, to the
// codes they share.
func constraintError(err error) error {
	switch {
	case kaitenerrors.IsExclusionViolationOnConstraint(err, "instance_entitlement_exception_window_excl"):
		return overlap(nil)
	case kaitenerrors.IsCheckViolationOnConstraint(err, "instance_entitlement_exception_value_check"):
		return kaitenerrors.UnprocessableEntity(operation+".InvalidValue", "the value does not match the kind")
	case kaitenerrors.IsCheckViolationOnConstraint(err, "instance_entitlement_exception_window_check"):
		return kaitenerrors.UnprocessableEntity(operation+".InvalidWindow", "endsAt is after startsAt")
	case kaitenerrors.IsCheckViolationOnConstraint(err, "instance_entitlement_exception_reason_check"):
		return kaitenerrors.UnprocessableEntity(operation+".ReasonRequired", "an exception gives its reason, of at most 500 characters")
	}
	return err
}
