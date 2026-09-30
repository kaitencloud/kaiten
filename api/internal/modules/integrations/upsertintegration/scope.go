package upsertintegration

import "github.com/kaitencloud/kaiten/api/pkg/scope"

// This package backs two operations, one per integration target, and they are
// scoped by what they write rather than by the shared shape of the write. Both are
// declared here rather than at their registrar calls so that the transport which
// publishes each scope and the facade which enforces it name one value, and cannot
// drift apart the way an argument written twice can.
var (
	// CustomerRequiredScope gates upsert-customer-integration-by-external-id.
	CustomerRequiredScope = scope.Write(scope.Customers)
	// InstanceRequiredScope gates upsert-instance-integration-by-external-id.
	InstanceRequiredScope = scope.Write(scope.Instances)
)
