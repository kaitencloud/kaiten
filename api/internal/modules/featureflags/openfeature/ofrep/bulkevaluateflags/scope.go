package bulkevaluateflags

import "github.com/kaitencloud/kaiten/api/pkg/scope"

// RequiredScope is the scope a caller must hold to reach this operation. The facade
// method behind the route enforces it, and endpoint_openapi.go projects it onto the
// hand-written huma.Operation's security requirement -- this operation is not
// registered through kaitenhuma.RegisterScoped (see registerOpenAPI's comment), so
// the single declaration here is what keeps the enforced and published scopes from
// drifting.
//
// It is exported, and in this file, for the same reason as every other operation's:
// the facade that enforces it names the same value the transport publishes.
var RequiredScope = scope.Read(scope.FeatureFlags)
