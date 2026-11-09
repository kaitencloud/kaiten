package getsummary

import "github.com/kaitencloud/kaiten/api/pkg/scope"

// The operation needs all three scopes below, which every row of the home is
// made of: endpoint.go publishes them and the facade requires them, through
// these same names. The blocks about other modules are gated on their own read
// scopes (see Visibility), so no new scope module, and nothing to add to an
// identity provider's JWT template.
var (
	// RequiredScope is the operation's own scope: the summary is about the
	// organization's customers first.
	RequiredScope = scope.Read(scope.Customers)
	// InstancesRequiredScope covers the instance on every meter and report.
	InstancesRequiredScope = scope.Read(scope.Instances)
	// LicensesRequiredScope covers the License named on them.
	LicensesRequiredScope = scope.Read(scope.Licenses)
)
