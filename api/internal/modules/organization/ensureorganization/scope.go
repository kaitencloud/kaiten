package ensureorganization

import "github.com/kaitencloud/kaiten/api/pkg/scope"

// RequiredScope is the scope a caller must hold to reach this operation. It is
// declared here rather than at the registrar call so that the transport which
// publishes it and the facade which enforces it name one value, and cannot drift
// apart the way an argument written twice can.
//
// write:organizations and not create:organizations, because there is no such
// action: the operation is an upsert, and a caller that may create a tenant is the
// same caller that may converge on one that is already there.
var RequiredScope = scope.Write(scope.Organizations)
