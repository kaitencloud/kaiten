package huma

import (
	"context"
	"net/http"
	"slices"
	"strings"

	"github.com/danielgtaylor/huma/v2"
)

// TargetOrganizationParam is the path parameter naming the organization a
// platform operation acts *on*. One constant, because the audit middleware that
// reads it and the registration-time check that a path declares it must agree; a
// second spelling anywhere would produce a route whose audit record silently
// carries an empty string.
const TargetOrganizationParam = "orgId"

// targetOrganizationPlaceholder is how that parameter appears in an operation
// path.
const targetOrganizationPlaceholder = "{" + TargetOrganizationParam + "}"

// RegisterPlatformForOrganization is RegisterPlatform for an operation that names
// a target organization in its path. It declares the 404 that naming a
// non-existent organization produces, and asserts that the path actually declares
// the parameter.
func RegisterPlatformForOrganization[I, O any](
	api huma.API,
	op huma.Operation,
	requiredScope string,
	handler func(context.Context, *I) (*O, error),
) {
	if !strings.Contains(op.Path, targetOrganizationPlaceholder) {
		panic("kaitenhuma: operation " + op.OperationID + " is registered for a target " +
			"organization but its path " + op.Path + " declares no " +
			targetOrganizationPlaceholder)
	}

	// AuditPlatformAction, for the reason RegisterPlatform installs it: a mutation
	// refused for the wrong credential class, a missing scope, or an organization
	// that does not exist is exactly the attempt worth recording, and a middleware
	// reading the status after the chain returns sees all three wherever they were
	// decided. It reads {orgId} from the raw path, which is the only source available
	// above huma's own parameter parsing.
	op.Middlewares = append(op.Middlewares, AuditPlatformAction())
	op.Security = append(op.Security, PlatformScopeRequirement(requiredScope))
	op.Errors = withStatus(op.Errors, http.StatusNotFound)
	huma.Register(api, op, handler)
}

// assertTargetOrganizationPath is the other half of the mismatch check:
// RegisterPlatform refuses a path that declares {orgId}, because such an
// operation would receive the parameter and no middleware to resolve it, and
// would then be free to read it however it liked.
func assertTargetOrganizationPath(op huma.Operation) {
	if strings.Contains(op.Path, targetOrganizationPlaceholder) {
		panic("kaitenhuma: operation " + op.OperationID + " declares " +
			targetOrganizationPlaceholder + " in its path " + op.Path +
			" and must be registered with RegisterPlatformForOrganization")
	}
}

// withStatus adds a status to an operation's declared errors, so the middleware's
// 404 appears in the OpenAPI document rather than being an undocumented answer
// the contract never mentions.
func withStatus(statuses []int, status int) []int {
	if slices.Contains(statuses, status) {
		return statuses
	}

	return append(statuses, status)
}
