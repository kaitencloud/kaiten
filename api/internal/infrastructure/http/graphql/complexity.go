package graphql

import (
	"math"
	"time"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/generated"
	instancesGraphql "github.com/kaitencloud/kaiten/api/internal/modules/instances/graphql"
	metadatafieldsdb "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// This file is the cost model complexityLimit is read against, and the reason
// that limit means anything at all.
const (
	// assumedFanout is what one unbounded nested list is charged, in rows.
	// DefaultLimit is the honest floor: a relation with no limit returns at
	// least as much as a full default page, usually far more. It is a cost
	// model, not a promise -- the number only has to be big enough to make a
	// cycle superlinear, and small enough that one page of real data stays
	// affordable.
	assumedFanout = int(pagination.DefaultLimit)

	// maxComplexity saturates a multiplication rather than letting it wrap.
	// This matters more than it looks: gqlgen honours a custom complexity
	// only when it comes back >= 1 (see complexity.fieldComplexity), so an
	// overflow to a negative number would silently drop the multiplier and
	// fall back to the cheap structural default -- handing back the exact
	// hole this file closes, to whoever can make the arithmetic overflow.
	// gqlgen guards its own additions this way (complexity.safeAdd); it does
	// not guard ours.
	maxComplexity = math.MaxInt
)

// newComplexityRoot builds the per-field cost functions gqlgen consults.
//
// Membership is decided by one question: can the field answer with more than
// one row? That covers the list types and the page envelopes wrapping one, and
// TestEveryListFieldIsChargedForItsFanOut asks it of the schema rather than of
// this file, so a multi-row field added later cannot quietly opt out.
func newComplexityRoot() generated.ComplexityRoot {
	var root generated.ComplexityRoot

	// -- Root list fields: the caller names its own fan-out via `limit`. --

	root.Query.Customers = func(childComplexity int, _ *string, limit *int, _ *string) int {
		return fanOut(pageSize(limit), childComplexity)
	}
	root.Query.Instances = func(childComplexity int, _ *string, limit *int, _ *string) int {
		return fanOut(pageSize(limit), childComplexity)
	}
	root.Query.Licenses = func(childComplexity int, limit *int, _ *string) int {
		return fanOut(pageSize(limit), childComplexity)
	}
	root.Query.Releases = func(childComplexity int, limit *int, _ *string) int {
		return fanOut(pageSize(limit), childComplexity)
	}
	root.Query.Components = func(childComplexity int, limit *int, _ *string) int {
		return fanOut(pageSize(limit), childComplexity)
	}
	root.Query.DeploymentZones = func(childComplexity int, limit *int, _ *string) int {
		return fanOut(pageSize(limit), childComplexity)
	}
	root.Query.Entitlements = func(childComplexity int, limit *int, _ *string) int {
		return fanOut(pageSize(limit), childComplexity)
	}
	root.Query.AuditTrails = func(
		childComplexity int, _ string, _ *string, _ *time.Time, _ *time.Time, limit *int, _ *string,
	) int {
		return fanOut(pageSize(limit), childComplexity)
	}
	root.Query.OrganizationAuditTrails = func(
		childComplexity int, _ *string, _ *time.Time, _ *time.Time, limit *int, _ *string,
	) int {
		return fanOut(organizationAuditTrailPageSize(limit), childComplexity)
	}
	// Instance.auditTrails is the one nested field that already pages itself,
	// so it prices like a root one.
	root.Instance.AuditTrails = func(
		childComplexity int, _ *string, _ *time.Time, _ *time.Time, limit *int, _ *string,
	) int {
		return fanOut(pageSize(limit), childComplexity)
	}

	root.Query.MetadataFields = func(
		childComplexity int, _ metadatafieldsdb.MetadataFieldResourceType, _ *bool,
		limit *int, _ *string,
	) int {
		return fanOut(pageSize(limit), childComplexity)
	}

	// -- Unbounded lists: charged the whole relation, because that is what
	// they can return. --

	// None of these takes an argument, so they share one function rather than
	// nine copies of it. The day one of them gains a `limit` it leaves this
	// block for the one above.
	unbounded := func(childComplexity int) int {
		return fanOut(assumedFanout, childComplexity)
	}

	root.Customer.Instances = unbounded
	root.License.Instances = unbounded
	root.License.Entitlements = unbounded
	// A family's version history: bounded in practice by how many times a
	// vendor has published the product, which is not a bound the schema states.
	root.LicenseFamilyView.Versions = unbounded
	root.Release.Components = unbounded
	root.Release.DeploymentZones = unbounded
	root.Release.Instances = unbounded
	root.Release.Deployments = unbounded
	root.Instance.EntitlementUsage = unbounded
	root.Entitlement.EntitlementGroups = unbounded

	return root
}

// pageSize is ClampLimit for the cost model: the number of rows the resolver
// will actually serve for this `limit`.
//
// It reimplements the clamp rather than calling pagination.ClampLimit because
// the value here is an untrusted, already-parsed GraphQL Int and ClampLimit
// takes an int32: converting first would truncate, and a caller asking for
// 4294967297 rows would be charged for one. Clamping before any narrowing
// keeps the charge monotonic in what was asked for.
func pageSize(limit *int) int {
	return clampPage(limit, int(pagination.DefaultLimit), int(pagination.MaxLimit))
}

// organizationAuditTrailPageSize is pageSize for the organization's audit
// feed, whose resolver pages wider than pagination's bounds.
func organizationAuditTrailPageSize(limit *int) int {
	return clampPage(limit,
		int(instancesGraphql.OrganizationAuditTrailDefaultLimit),
		int(instancesGraphql.OrganizationAuditTrailMaxLimit))
}

func clampPage(limit *int, defaultRows, maxRows int) int {
	if limit == nil || *limit <= 0 {
		return defaultRows
	}
	if *limit > maxRows {
		return maxRows
	}
	return *limit
}

// fanOut charges rows copies of a single row's cost, saturating instead of
// overflowing (see maxComplexity).
//
// A childComplexity of zero means a list of scalars, which gqlgen walks
// without descending: it still costs one point per row to produce, so the
// floor is rows rather than 1.
func fanOut(rows, childComplexity int) int {
	if rows < 1 {
		rows = 1
	}
	if childComplexity < 1 {
		childComplexity = 1
	}
	if childComplexity > maxComplexity/rows {
		return maxComplexity
	}
	return rows * childComplexity
}
