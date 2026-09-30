package linttargetingrule

import "github.com/kaitencloud/kaiten/api/pkg/scope"

// RequiredScope is the scope a caller must hold to reach this operation. It is
// declared here rather than at the registrar call so that the transport which
// publishes it and the facade which enforces it name one value, and cannot drift
// apart the way an argument written twice can.
//
// A write, because this is the write path's own check run early: it answers
// "would you accept this rule", and nobody who cannot write a flag needs to ask.
var RequiredScope = scope.Write(scope.FeatureFlags)
