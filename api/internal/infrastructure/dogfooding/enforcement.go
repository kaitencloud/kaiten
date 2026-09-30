package dogfooding

import (
	"context"
	"errors"
	"log/slog"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// EnforcementOutcome is what the error returned by UsageReporter's
// ReportAndEnforce means for a caller that is about to create a
// limit-gated resource.
type EnforcementOutcome int

const (
	// EnforcementAllowed means ReportAndEnforce returned nil: usage was
	// durably incremented on the remote side and the caller may proceed.
	// If the caller subsequently fails to persist the resource, it must
	// undo the increment with a compensating Decrement call -- otherwise
	// the remote usage counter drifts permanently high for a resource that
	// was never created.
	EnforcementAllowed EnforcementOutcome = iota

	// EnforcementRejected means the organization is over its entitlement
	// limit -- ReportAndEnforce returned an error wrapping
	// ErrThresholdExceeded. Nothing was incremented, so the caller must
	// reject the operation without persisting anything and without
	// compensating.
	EnforcementRejected

	// EnforcementUnavailable means ReportAndEnforce failed for a reason
	// unrelated to the organization's usage -- a transient network or
	// remote error, or no reporting credential yet. The limit is unknown,
	// which is not the same as unreached: callers fail CLOSED and refuse
	// the operation.
	EnforcementUnavailable
)

// VerificationUnavailableCode is the error code EnforceCreationLimit returns
// when the entitlement limit could not be verified.
//
// One code for every gated resource, unlike the per-resource conflictCode a
// caller passes for a real over-limit rejection: the client's remedy does not
// vary by resource here. A 409 with CreateCustomer.EntitlementLimitReached
// means "buy more customers"; this means "ask again shortly", and nothing
// about which resource was being created changes that.
const VerificationUnavailableCode = "Entitlement.VerificationUnavailable"

// verificationUnavailableMessage is client-visible, so it names neither the
// remote host nor the credential -- only what could not be established and
// what to do about it.
const verificationUnavailableMessage = "Entitlement limits could not be verified. Please retry."

// ClassifyEnforcementError inspects the error returned by
// UsageReporter.ReportAndEnforce and reports what it means for the caller.
//
// This is the one piece of enforcement logic that is genuinely identical
// across every package that enforces a creation limit -- deliberately pure
// (no I/O, no logging) so it carries none of the resource-specific behavior
// each caller layers on top of the outcome: its own error code, its own
// optional rejection event, its own log fields.
func ClassifyEnforcementError(err error) EnforcementOutcome {
	if err == nil {
		return EnforcementAllowed
	}
	if errors.Is(err, ErrThresholdExceeded) {
		return EnforcementRejected
	}
	return EnforcementUnavailable
}

// EnforceCreationLimit calls reporter.ReportAndEnforce for slug and
// classifies the result into the (incremented, error) shape every create*
// handler needs, so that switch on ClassifyEnforcementError's outcome --
// previously reimplemented identically in every one of those handlers --
// lives in exactly one place.
func EnforceCreationLimit(
	ctx context.Context,
	reporter services.UsageReporter,
	orgID uuid.UUID,
	slug, conflictCode, conflictMessage string,
	onRejected func(),
) (incremented bool, err error) {
	reportErr := reporter.ReportAndEnforce(ctx, orgID, slug)
	switch ClassifyEnforcementError(reportErr) {
	case EnforcementAllowed:
		return true, nil
	case EnforcementRejected:
		if onRejected != nil {
			onRejected()
		}
		return false, kaitenerrors.Conflict(conflictCode, conflictMessage)
	default: // EnforcementUnavailable
		slog.ErrorContext(ctx, "creation limit could not be verified, refusing the operation",
			"organization_id", orgID, "entitlement_slug", slug, "error", reportErr)
		return false, kaitenerrors.Unavailable(
			VerificationUnavailableCode, verificationUnavailableMessage,
		)
	}
}

// CompensateEnforcement undoes a prior successful EnforceCreationLimit
// increment when the resource it was for fails to persist afterward.
// A no-op unless incremented is true. Best effort: a failed Decrement is
// logged, not retried or escalated -- there is no way to make this fully
// atomic without a distributed transaction, which is out of scope.
func CompensateEnforcement(ctx context.Context, reporter services.UsageReporter, incremented bool, orgID uuid.UUID, slug string) {
	if !incremented {
		return
	}

	if err := reporter.Decrement(ctx, orgID, slug); err != nil {
		slog.ErrorContext(ctx, "failed to compensate creation usage after persistence failure",
			"organization_id", orgID, "entitlement_slug", slug, "error", err)
	}
}

// EnforceAndPersist enforces the organization's creation entitlement for slug
// and, if allowed, calls persist. It is the one call a create* handler's Execute
// needs for the whole entitlement dance:
func EnforceAndPersist[T any](
	ctx context.Context,
	reporter services.UsageReporter,
	orgID uuid.UUID,
	slug, conflictCode, conflictMessage string,
	onRejected func(),
	persist func(ctx context.Context) (T, error),
) (T, error) {
	incremented, err := EnforceCreationLimit(ctx, reporter, orgID, slug, conflictCode, conflictMessage, onRejected)
	if err != nil {
		var zero T
		return zero, err
	}

	result, err := persist(ctx)
	if err != nil {
		CompensateEnforcement(ctx, reporter, incremented, orgID, slug)
		var zero T
		return zero, err
	}

	return result, nil
}
