package markread

import "github.com/kaitencloud/kaiten/api/pkg/scope"

// RequiredScope is the scope a caller must hold to reach this operation. Writing
// read state is a write, even though it changes nothing anybody else can see.
var RequiredScope = scope.Write(scope.Notifications)
