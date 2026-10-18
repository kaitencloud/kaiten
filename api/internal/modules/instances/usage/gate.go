package usage

// Gate decides whether a gated report is admitted: the counter it would
// leave (after) plus what is already set aside for in-flight operations
// (reserved) must stay within the grant's Maximum. A hard grant makes the
// maximum the threshold itself, so one comparison covers both the cap and
// the bounded overage. An unlimited grant admits everything.
func Gate(l Limit, after, reserved float64) bool {
	if l.Unlimited() {
		return true
	}
	return after+reserved <= l.Maximum()
}
