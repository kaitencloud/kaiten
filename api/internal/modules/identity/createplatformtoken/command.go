package createplatformtoken

import "time"

// Command is the platform credential to issue.
//
// Carrying no struct tags is deliberate: nothing serializes this type, and this
// operation has no wire contract it could describe. See the package comment for
// why it can never have one.
type Command struct {
	// Name is the operator's label for the credential, and the handle every later
	// operation addresses it by -- listing shows it, revocation names it. Unique
	// among *active* platform credentials, so reusing the name of a retired one is
	// allowed and reusing a live one is refused (or replaces it; see Replace).
	Name string

	// Scopes is the authority the credential carries, already parsed and validated
	// by whoever assembled this command. Not re-validated here -- see the package
	// comment.
	Scopes []string

	// ExpiresAt bounds the credential in time. Nil mints a non-expiring one, whose
	// only bound is revocation; that is a deliberate option rather than an
	// oversight, because the bootstrap credential exists before anything is running
	// that could rotate it.
	//
	// An absolute instant rather than a TTL, and a *time.Time rather than the
	// column's pgtype.Timestamp: the caller has already decided *when*, and the
	// persistence spelling of "no expiry" stops at this package's boundary.
	ExpiresAt *time.Time

	// Replace retires the active credential of this name, if there is one, in the
	// same transaction that writes the successor. Without it a live name is a
	// conflict.
	//
	// This is rotation expressed as one operation: the alternative is revoke-then-
	// create, which leaves a window with no credential of that name at all, and
	// leaves an operator whose second command fails holding neither the old
	// credential nor a new one.
	Replace bool
}
