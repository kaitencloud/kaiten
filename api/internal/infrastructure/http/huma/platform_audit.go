package huma

import (
	"log/slog"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/platform/platformidentity"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

// AuditPlatformAction records that something with state-changing intent was
// attempted on the Platform API, by whom, against what, and how it ended.
//
// Structural logging rather than an audit_trail row, because the Platform API's
// most consequential operations cannot write one: audit_trail.organization_id
// and outbox_events.organization_id are NOT NULL with an FK to organization,
// and delete-organization hard-deletes the row the FK would point at,
// delete-membership emits nothing, and delete-users is global with no
// organization to attribute to.
//
// Installed by the two platform registrars, not per handler, which is why it
// can be trusted: there is no way onto the surface that skips it.
//
// It decides nothing and reads ctx.Status() after next(), so it records a
// refusal whoever made it produced -- the wrong credential class answered by
// caller.Platform, a missing scope by the facade method. A middleware
// inspecting the request instead would see neither. It never touches the
// request, never fails it, and reads no body.
func AuditPlatformAction() func(huma.Context, func(huma.Context)) {
	return func(ctx huma.Context, next func(huma.Context)) {
		// Deferred, so an operation that panics still leaves a record. The
		// status will read 0 in that case, which is itself the signal.
		defer logPlatformAction(ctx)
		next(ctx)
	}
}

// logPlatformAction writes the record. Reads only, and only from what the request
// already carries.
func logPlatformAction(ctx huma.Context) {
	if !isStateChanging(ctx.Method()) {
		// Reads are deliberately not recorded. GET /platform/me is what an SDK
		// token source calls to introspect itself, so logging it would bury the
		// operations that changed something under the ones that could not. A
		// refused read has no effect to attribute; a refused write does.
		return
	}

	attributes := []any{
		"credential_kind", observedCredentialKind(ctx),
		"operation", operationID(ctx),
		"method", ctx.Method(),
		"status", ctx.Status(),
	}

	if caller, ok := principal.FromContext(ctx.Context()); ok && caller.IsPlatform() {
		// The actor is the platform identity, and PlatformTokenID says which of
		// its credentials was used -- the field an operator acts on, since
		// revoking that credential also revokes everything it minted.
		attributes = append(attributes,
			"actor", platformidentity.ExternalID,
			"platform_token_id", caller.PlatformTokenID)
	}

	// The RAW path parameter, deliberately, not targetorg.FromContext: the target
	// is resolved by the application, in a context derived below this middleware
	// and never handed back up to it. The raw value is also the more honest thing
	// to record -- an audit line should say what was asked for, including when the
	// answer was "no such organization" or "that is not a uuid". For a request that
	// succeeded the two are the same string.
	if target := ctx.Param(TargetOrganizationParam); target != "" {
		attributes = append(attributes, "target_organization", target)
	}

	const message = "platform credential attempted a state-changing operation"

	// One message, two levels: an outcome at or above 400 is a refusal, and a
	// refused mutation on this surface is worth surfacing above the routine
	// stream of successful ones.
	if ctx.Status() >= http.StatusBadRequest {
		slog.WarnContext(ctx.Context(), message, attributes...)
		return
	}
	slog.InfoContext(ctx.Context(), message, attributes...)
}

// observedCredentialKind reports which class of credential the request actually
// arrived with, which is not always KindPlatform: this middleware runs ahead of the
// handler that resolves a caller, so it also describes the attempts that were about
// to be rejected.
//
// principal.Kind's own string is the label, because every kind is named. The two
// cases it cannot spell are the ones that are not a kind: no principal at all,
// and a principal nobody assigned one to -- both of which this reports as
// something a reader can act on rather than as an empty field.
func observedCredentialKind(ctx huma.Context) string {
	caller, ok := principal.FromContext(ctx.Context())
	if !ok {
		return "none"
	}
	if caller.Kind == principal.KindUnset {
		return "unset"
	}
	return string(caller.Kind)
}

// isStateChanging reports whether a method is one whose success changes
// something. HEAD and OPTIONS are absent along with GET; no platform operation
// uses them, and adding one would not make it a mutation.
func isStateChanging(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	default:
		return false
	}
}

// operationID names the operation for the record. huma populates
// huma.Context.Operation for every registered operation, so the fallback is
// unreachable through the router; it exists so a hand-driven Context in a test
// produces a log line rather than a nil dereference.
func operationID(ctx huma.Context) string {
	if op := ctx.Operation(); op != nil {
		return op.OperationID
	}
	return "unknown"
}
