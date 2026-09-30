// Package targetorg carries the organization a platform operation acts *on*,
// which is a different thing from the organization a request acts *as*.
//
// Those two are the same value for every credential that existed before the
// Platform API, which is exactly why they need separating now. A platform
// credential authenticates system:kaiten and carries no organization execution
// context at all; when one of its operations must act inside a tenant, that
// tenant is named in the path. Writing it into principal.OrganizationID would
// turn "act on organization X" into "be a member of organization X acting as
// system:kaiten" -- an execution context the credential was never granted, handed
// out by the very middleware meant to read a path parameter.
//
// So the target lives in its own context slot, under its own key, reachable only
// through this package's accessor. Conflating actor and target is then not an
// oversight anyone can have; it requires deliberately calling the wrong function.
//
// A platform principal's OrganizationID stays uuid.Nil for the whole request, and
// tests/integrations/platformapi asserts that across two different targets.
package targetorg

import (
	"context"

	"github.com/google/uuid"
)

// The three ways resolving a target organization fails. They live here rather
// than with whatever resolves them because the codes are part of the API
// contract -- tests/integrations/platformapi asserts against them -- and the
// resolution itself has already moved once, from huma middleware into the
// application facade. Callers name the outcome; nobody names the resolver.
const (
	// ErrCodeInvalid is returned for a target that cannot be a target: the nil
	// UUID, which ContextWithTarget has no way to represent. A path parameter
	// that is not a UUID at all never reaches resolution -- huma refuses it
	// while parsing, the same way it does for every other {uuid} in the tree.
	ErrCodeInvalid = "PlatformOrganization.InvalidID"

	// ErrCodeNotFound is returned for a well-formed id that names no
	// organization. It is deliberately the same 404 an organization the caller
	// may not see would produce.
	ErrCodeNotFound = "PlatformOrganization.NotFound"

	// ErrCodeUnavailable is returned when existence could not be determined --
	// a database failure, which is a 500 and must never be flattened into the
	// 404 above. "We could not tell" and "it does not exist" are different
	// answers, and only one of them is safe to cache or retry against.
	ErrCodeUnavailable = "PlatformOrganization.Unavailable"
)

// key is unexported and distinct from principal's, so a value stored here cannot
// be read as a principal or vice versa.
type key struct{}

// ContextWithTarget returns a Context carrying the organization the current
// operation targets.
//
// uuid.Nil is not stored: it is the zero value that "no target" already means, so
// accepting it would let a caller install a target that FromContext reports as
// present and every consumer then treats as a missing organization.
func ContextWithTarget(ctx context.Context, organizationID uuid.UUID) context.Context {
	if ctx == nil {
		return nil
	}

	if organizationID == uuid.Nil {
		return ctx
	}

	return context.WithValue(ctx, key{}, organizationID)
}

// FromContext returns the target organization, and whether one was set.
//
// The boolean is not decoration. A handler that reads a target has been routed
// under the {orgId} namespace, so a false here means the middleware that should
// have run did not -- a wiring bug to fail on, not a nil organization to proceed
// with.
func FromContext(ctx context.Context) (uuid.UUID, bool) {
	if ctx == nil {
		return uuid.Nil, false
	}

	organizationID, ok := ctx.Value(key{}).(uuid.UUID)
	if !ok {
		return uuid.Nil, false
	}

	return organizationID, true
}
