package slugutil

import (
	"errors"
	"fmt"
)

// ErrInvalidSlug is wrapped by the error New returns when a candidate slug
// fails the format check. It exists so callers can test for this specific
// case with errors.Is while still building their own domain-specific
// apierrors.Error -- each create-flow handler uses its own error code
// (e.g. "CreateCustomer.InvalidSlug", "CreateInstance.InvalidSlug") for the
// exact same underlying rule, and New doesn't try to pick one for them.
var ErrInvalidSlug = errors.New("slugutil: invalid slug")

// Slug is a slug value that has already been checked against the format
// Validate enforces: lowercase alphanumeric and hyphens, no leading or
// trailing hyphen, 2-100 characters. The zero value is not a valid slug --
// obtain one through New (for a caller-supplied string) so the format
// invariant is checked exactly once, at construction, instead of being
// re-validated -- or, worse, silently skipped -- as a raw string passes
// through each layer.
//
// This intentionally does not replace string at every layer: Command DTOs
// keep *string for the wire format, and repositories keep plain string
// parameters. Slug exists at the boundary where a caller-supplied or
// generated value is turned into "a slug we've validated," via String().
type Slug struct {
	value string
}

// New validates s and returns it as a Slug, or an error wrapping
// ErrInvalidSlug if s does not satisfy the slug format.
func New(s string) (Slug, error) {
	if !Validate(s) {
		return Slug{}, fmt.Errorf("%w: %q %s", ErrInvalidSlug, s, Requirements)
	}
	return Slug{value: s}, nil
}

// String returns the underlying slug string.
func (s Slug) String() string {
	return s.value
}

// IsZero reports whether s is the zero value, i.e. it was never
// constructed through New.
func (s Slug) IsZero() bool {
	return s.value == ""
}
