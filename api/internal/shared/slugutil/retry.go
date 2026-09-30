package slugutil

import "errors"

// ErrConflict is the sentinel a create-flow repository should wrap (e.g.
// via apierrors.Wrap) when a persist attempt fails specifically because the
// candidate slug collided with another row's slug -- typically a Postgres
// UNIQUE-constraint violation on that table's (organization_id, slug)
// index (or equivalent). Retry checks for it with errors.Is to decide
// whether an auto-generated slug is worth retrying with a freshly generated
// one, as distinct from an unrelated conflict (a duplicate name+version, a
// duplicate external ID, or a user-supplied slug that was already taken)
// that regenerating a slug would never fix.
var ErrConflict = errors.New("slugutil: slug already exists")

// DefaultMaxAttempts bounds how many times Retry will regenerate and retry
// a slug after a database-detected conflict before giving up.
// GenerateUnique appends a 3-byte random suffix (~16.7M possibilities per
// base), so a genuine collision is already rare; this only guards against
// an extremely unlucky run, not a systemic problem.
const DefaultMaxAttempts = 5

// Retry calls attempt with a freshly generated slug (from generate),
// retrying with a newly generated slug up to maxAttempts total tries
// whenever attempt's error wraps ErrConflict.
//
// It exists to close the gap in GenerateUnique's uniqueness claim: the
// random suffix makes a database-level collision on an auto-generated slug
// unlikely but not impossible (see GenerateUnique's doc comment), and the
// database's UNIQUE constraint is the actual source of truth. Code that
// generated the slug itself (as opposed to persisting one an end user
// explicitly chose) should transparently retry a rare conflict rather than
// surface it as a hard failure for something outside the caller's control.
//
// If attempt's error does not wrap ErrConflict, Retry returns it
// immediately without retrying -- a validation error, a foreign-key
// violation, or a conflict on an unrelated column would never be fixed by
// generating a different slug. On exhaustion, Retry returns the last
// error unchanged (not re-wrapped), so its Kind/Code/Message survive
// intact for callers like the HTTP error translator.
func Retry[T any](maxAttempts int, generate func() (string, error), attempt func(slug string) (T, error)) (T, error) {
	var zero T
	if maxAttempts < 1 {
		maxAttempts = 1
	}

	var lastErr error
	for range maxAttempts {
		slug, err := generate()
		if err != nil {
			return zero, err
		}

		result, err := attempt(slug)
		if err == nil {
			return result, nil
		}
		if !errors.Is(err, ErrConflict) {
			return zero, err
		}
		lastErr = err
	}

	return zero, lastErr
}
