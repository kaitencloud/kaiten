package listorganizationtokens

import "github.com/kaitencloud/kaiten/api/pkg/scope"

// RequiredScope is the scope a caller must hold to reach this operation. It is
// declared here rather than at the registrar call so that the transport which
// publishes it and the facade which enforces it name one value, and cannot drift
// apart the way an argument written twice can.
//
// read:tokens, not write:tokens. Minting and revoking are write; naming what you
// already hold is not, and a credential that only needs to find a slug before
// revoking should not have to be able to mint on the way there. write:tokens
// implies read:tokens in kaiten's own check, so a caller that can revoke can
// always list first.
var RequiredScope = scope.Read(scope.Tokens)
