package gettargetingcontext

import "github.com/kaitencloud/kaiten/api/pkg/scope"

// RequiredScope is the scope a caller must hold to reach this operation. It is
// declared here rather than at the registrar call so that the transport which
// publishes it and the facade which enforces it name one value, and cannot drift
// apart the way an argument written twice can.
//
// A read, even though the schema exists to help write a rule: it describes the
// shape of a flag's targeting, and the entitlement slugs it carries are already
// legible to anyone who can read a flag — they are written in the targeting
// rules themselves. Requiring a write scope would refuse the descriptions to a
// reader looking at a rule they are allowed to see.
var RequiredScope = scope.Read(scope.FeatureFlags)
