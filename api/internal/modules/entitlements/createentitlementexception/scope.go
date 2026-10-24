package createentitlementexception

import "github.com/kaitencloud/kaiten/api/pkg/scope"

// RequiredScope is the scope a caller must hold to reach this operation: an
// exception is instance state, never gated by billing (§13.16).
var RequiredScope = scope.Write(scope.Instances)
