// Package putauthorization implements its Core user operation.
package putauthorization

import "github.com/kaitencloud/kaiten/api/pkg/scope"

var RequiredScope = scope.Write(scope.Users)
