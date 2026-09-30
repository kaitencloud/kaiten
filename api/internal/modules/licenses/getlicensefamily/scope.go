package getlicensefamily

import "github.com/kaitencloud/kaiten/api/pkg/scope"

// RequiredScope is the scope a caller must hold to reach this operation. It is
// declared here rather than at the registrar call so that the transport which
// publishes it and the facade which enforces it name one value, and cannot drift
// apart the way an argument written twice can.
//
// The same scope as reading a license: this resolves which license to read, and
// returns one the caller could already have fetched by its own slug.
var RequiredScope = scope.Read(scope.Licenses)
