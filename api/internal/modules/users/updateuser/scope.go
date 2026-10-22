// Package updateuser implements its Core user operation.
package updateuser

import "github.com/kaitencloud/kaiten/api/pkg/scope"

var RequiredScope = scope.Write(scope.Users)
