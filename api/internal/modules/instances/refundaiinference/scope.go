package refundaiinference

import "github.com/kaitencloud/kaiten/api/pkg/scope"

// RequiredScope is the scope a caller must hold to reach this operation: the
// one a usage report takes, since a refund is a report.
var RequiredScope = scope.Write(scope.Instances)
