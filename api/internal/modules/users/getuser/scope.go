// Package getuser implements its Core user operation.
package getuser

import "github.com/kaitencloud/kaiten/api/pkg/scope"

var RequiredScope = scope.Read(scope.Users)
