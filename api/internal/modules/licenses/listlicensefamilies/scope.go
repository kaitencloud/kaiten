package listlicensefamilies

import "github.com/kaitencloud/kaiten/api/pkg/scope"

// RequiredScope is the scope a caller must hold to reach this operation. It is
// declared here rather than at the registrar call so that the transport which
// publishes it and the facade which enforces it name one value, and cannot drift
// apart the way an argument written twice can.
//
// The same scope as reading licenses: a family is a grouping of licenses the
// caller can already read one by one, so it grants no access reading the
// versions would not.
var RequiredScope = scope.Read(scope.Licenses)
