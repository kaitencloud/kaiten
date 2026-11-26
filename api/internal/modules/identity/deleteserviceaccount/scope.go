package deleteserviceaccount

import "github.com/kaitencloud/kaiten/api/pkg/scope"

// RequiredScope is the scope a caller must hold to reach this operation. It is
// declared here rather than at the registrar call so that the transport which
// publishes it and the facade which enforces it name one value, and cannot drift
// apart the way an argument written twice can.
//
// write:tokens, as for creating and renaming an account and revoking one of its
// tokens: deleting the account is revoking every token it holds at once.
var RequiredScope = scope.Write(scope.Tokens)
