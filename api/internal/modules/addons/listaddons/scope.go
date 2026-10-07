package listaddons

import "github.com/kaitencloud/kaiten/api/pkg/scope"

// RequiredScope is the scope a caller must hold to reach this operation.
var RequiredScope = scope.Read(scope.Addons)
