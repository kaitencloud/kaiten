package slugutil

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

var nonAlphanumeric = regexp.MustCompile(`[^a-z0-9]+`)

// spelledOut covers the letters that have no decomposed form, so dropping
// accents leaves them untouched. The rules match generateSlug in the app
// (app/src/functionals/slug), which previews the slug a form will send.
var spelledOut = strings.NewReplacer(
	"æ", "ae",
	"ð", "d",
	"đ", "d",
	"ı", "i",
	"ł", "l",
	"ø", "o",
	"œ", "oe",
	"ß", "ss",
	"þ", "th",
)

var apostrophes = strings.NewReplacer("'", "", "’", "")

// Generate creates a URL-friendly slug from a string: accents are dropped
// ("café" becomes "cafe"), apostrophes are removed, and any other run of
// characters becomes one hyphen.
func Generate(s string) string {
	s = strings.ToLower(s)
	s = stripMarks(s)
	s = spelledOut.Replace(s)
	s = apostrophes.Replace(s)
	s = nonAlphanumeric.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	return s
}

// stripMarks decomposes letters and drops the combining marks, so "é" becomes
// "e". The chain is built per call because a transformer holds state.
func stripMarks(s string) string {
	t := transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.M)))
	out, _, err := transform.String(t, s)
	if err != nil {
		return s
	}
	return out
}

// GenerateUnique generates a slug with a 6-char random hex suffix.
//
// The suffix makes a collision improbable (~16.7M possibilities per base),
// but this does NOT guarantee uniqueness the way a database UNIQUE
// constraint does -- it is a probabilistic reduction of collision risk, not
// an atomic check against what's already stored. Two concurrent calls with
// the same input can theoretically draw the same suffix, and nothing here
// consults the database to rule that out. Callers that persist the result
// into a uniquely-constrained column MUST treat a database-detected
// conflict as expected and retry with a freshly generated slug -- see
// Retry -- rather than assume this function already made that impossible.
//
// A name with nothing to keep (empty, or only non-Latin letters) gets the
// suffix alone, which is still a valid slug.
func GenerateUnique(s string) (string, error) {
	base := Generate(s)
	b := make([]byte, 3)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("slugutil: failed to generate random suffix: %w", err)
	}
	suffix := hex.EncodeToString(b)
	if base == "" {
		return suffix, nil
	}
	return base + "-" + suffix, nil
}

// WithSuffix appends "-suffix" to base, trimming base if the result would
// exceed maxLength.
//
// It exists for slugs the server derives from another slug rather than from a
// name -- a license version's "{familySlug}-v{n}", where the suffix is the part
// that makes the result unique and the base is the part that makes it
// recognisable. When both cannot fit, the base gives way: a slug that lost
// characters from a long family name still addresses the right row, while one
// that lost its version number addresses the wrong one (or collides).
//
// Unlike GenerateUnique there is no random component, because the caller is
// deriving from something it already knows to be unique in context. Any trailing
// hyphens left by the trim are removed, so the result stays a valid slug.
func WithSuffix(base, suffix string) string {
	tail := "-" + suffix
	if len(base)+len(tail) > maxLength {
		base = strings.TrimRight(base[:maxLength-len(tail)], "-")
	}
	return base + tail
}

// slugPattern matches valid slugs: lowercase alphanumeric + hyphens, no leading/trailing hyphen.
var slugPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*[a-z0-9]$`)

const (
	minLength = 2
	maxLength = 100
)

// Requirements describes the slug format in prose, for embedding directly
// in user-facing validation error messages. Every create-flow handler
// builds its own apierrors.Error (each has its own error code), so it
// still forms the message itself -- typically via InvalidReason.
const Requirements = "must match ^[a-z0-9][a-z0-9-]*[a-z0-9]$ and be 2–100 characters"

// InvalidReason formats the standard "why this slug was rejected" message
// used across create-flow handlers, so the wording lives in one place
// instead of being retyped (and occasionally drifting) at each call site.
func InvalidReason(s string) string {
	return fmt.Sprintf("Slug %q is invalid: %s", s, Requirements)
}

// Validate returns true if s is a valid slug: lowercase alphanumeric + hyphens,
// no leading/trailing hyphen, 2–100 chars.
func Validate(s string) bool {
	return len(s) >= minLength && len(s) <= maxLength && slugPattern.MatchString(s)
}
