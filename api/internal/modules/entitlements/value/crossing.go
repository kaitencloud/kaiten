package value

// WarningBoundary computes the usage value at which the early-warning
// threshold fires for a given cap and percent (e.g. threshold=1000,
// percent=80 yields 800). Callers must independently check that the cap is
// not unlimited and that percent is non-zero before treating the boundary as
// meaningful -- this function does not encode either sentinel.
func WarningBoundary(threshold float64, percent int32) float64 {
	return threshold * float64(percent) / 100
}

// Crossed reports whether a boundary was just crossed by a usage update:
// the previous value was strictly below the boundary and the updated value
// has reached or passed it. This is the shared crossing semantics for both
// the early-warning threshold and the entitlement cap -- a signal fires once
// per crossing, not on every report while usage remains at or above the
// boundary.
func Crossed(previous, updated, boundary float64) bool {
	return previous < boundary && updated >= boundary
}
