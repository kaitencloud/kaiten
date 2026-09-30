package testtargetingrule

import "github.com/kaitencloud/kaiten/api/pkg/scope"

// RequiredScope is the scope a caller must hold to reach this operation. It is
// declared here rather than at the registrar call so that the transport which
// publishes it and the facade which enforces it name one value, and cannot drift
// apart the way an argument written twice can.
//
// A write, like the lint: this is a rehearsal of a rule being authored, and
// nobody who cannot write a flag needs to rehearse one. It also reads the same
// enriched facts an evaluation reads, which a bare reader has no business
// pulling for arbitrary contexts.
var RequiredScope = scope.Write(scope.FeatureFlags)
