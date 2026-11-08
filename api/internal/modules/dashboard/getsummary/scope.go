package getsummary

import "github.com/kaitencloud/kaiten/api/pkg/scope"

// RequiredScope is the scope a caller must hold to reach this operation: the
// summary is about the organization's customers first. The blocks about other
// modules are gated on their own read scopes (see Visibility), so no new scope
// module, and nothing to add to an identity provider's JWT template.
var RequiredScope = scope.Read(scope.Customers)
