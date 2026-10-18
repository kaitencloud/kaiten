package reportentitlementusagemetric

// kind is one value type a report can carry. It plans the report from the
// state loaded under the lock and returns what to write; it never writes
// itself. A new value type is a new kind in its own file: no other kind's
// path changes.
type kind interface {
	plan(st *State, cmd *Command) (*Effect, error)
}

// kindFor dispatches on the value the report carries, before anything kind
// specific -- a deduplication included -- reads the request.
func kindFor(*Command) kind {
	return numberKind{}
}
