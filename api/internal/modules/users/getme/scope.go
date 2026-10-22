// Package getme implements its Core user operation.
package getme

import "github.com/kaitencloud/kaiten/api/pkg/scope"

var RequiredScope = scope.Read(scope.Profile)
