// Package listusers implements its Core user operation.
package listusers

import "github.com/kaitencloud/kaiten/api/pkg/scope"

var RequiredScope = scope.Read(scope.Users)
