package getlicensevalidation

import "github.com/kaitencloud/kaiten/api/pkg/scope"

// RequiredScope is shared by the registrar and the facade enforcement point.
var RequiredScope = scope.Read(scope.Instances)
