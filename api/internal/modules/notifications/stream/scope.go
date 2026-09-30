package stream

import "github.com/kaitencloud/kaiten/api/pkg/scope"

// RequiredScope is the scope a caller must hold to open a stream. Reading the
// feed live is reading the feed: the same scope listing it requires.
var RequiredScope = scope.Read(scope.Notifications)
