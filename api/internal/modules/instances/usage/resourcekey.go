package usage

import (
	"net/url"
	"regexp"
)

// resourceKeyPattern is a resource key's alphabet and length: the alphabet of an
// Idempotency-Key, 1 to 128 characters. The database holds the same check
// (entitlement_resource_usage_resource_key_check).
var resourceKeyPattern = regexp.MustCompile(`^[A-Za-z0-9._:-]{1,128}$`)

// ValidResourceKey reports whether key may name a resource of an entitlement
// that counts per resource: 1 to 128 characters of [A-Za-z0-9._:-], matched
// exactly and case-sensitively -- Stigg and stigg are two resources. "." and ".."
// are in the alphabet and are no keys: a dot segment is normalized away by HTTP
// clients and proxies before it reaches /resources/{resourceKey}, so such a
// resource could not be addressed.
//
// It is checked by the handlers rather than as a schema pattern, so that a bad
// key answers the documented <Operation>.InvalidResourceKey and not Huma's
// generic 422.
func ValidResourceKey(key string) bool {
	return key != "." && key != ".." && resourceKeyPattern.MatchString(key)
}

// DecodeResourceKey is the resource key a path segment names. The router hands a
// handler the segment as the client wrote it, percent-escapes included, and a
// browser client writes "comp:123" as comp%3A123 (encodeURIComponent): the key
// is the segment decoded once. A segment that does not decode is returned as it
// is, and fails ValidResourceKey, as does a "%" that survives decoding: the
// alphabet has none.
func DecodeResourceKey(segment string) string {
	if decoded, err := url.PathUnescape(segment); err == nil {
		return decoded
	}
	return segment
}
