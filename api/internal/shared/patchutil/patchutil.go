// Package patchutil provides small, pure, generic helpers for the recurring
// "patch/merge" shape used across the update use cases in this codebase:
// given a current persisted value and a partial patch (represented as a
// pointer, where nil conventionally means "not provided"), resolve the
// value that should be persisted and decide whether it actually changed.
//
// These are intentionally minimal, behavior-preserving building blocks, not
// a patch framework. Call sites that need validation, trimming, or
// clear-vs-leave-alone-vs-set semantics on a field (several do -- see e.g.
// upsertintegration's normalizeOptionalField) apply
// that logic themselves around these calls; ResolveOptional and
// ResolveOptionalPointer only capture the mechanical "keep current unless a
// patch value was supplied" part, so that logic doesn't need to be
// hand-rolled at every call site.
package patchutil

// ResolveOptional returns the patched value when patch is non-nil (the
// field was provided in the patch), otherwise it returns current unchanged
// (the field was not provided, so it is left as-is).
//
// Use this for a field whose own persisted type is T and whose patch
// representation is *T, used purely as a provided/not-provided wrapper --
// not for a field that is itself optional in the domain model (for that,
// see ResolveOptionalPointer). ResolveOptional does not support "provided
// as an explicit clear": if a field can be explicitly cleared back to a
// zero value via some sentinel in the incoming patch (e.g. an empty
// string), normalize the patch value to reflect that *before* calling
// ResolveOptional, while still gating on the original, pre-normalization
// pointer to distinguish "not provided" from "provided as empty".
func ResolveOptional[T any](current T, patch *T) T {
	if patch != nil {
		return *patch
	}
	return current
}

// ResolveOptionalPointer resolves a field whose own persisted type is
// already an optional pointer *T (nil meaning "no value"), where the patch
// uses that very same pointer type to double as the provided/not-provided
// flag: a nil patch means "not provided, leave untouched", and a non-nil
// patch means "set to exactly this value" verbatim (no dereferencing, no
// transformation applied here).
//
// Because nil is reserved for "not provided", a field resolved this way
// cannot be explicitly cleared back to nil through the patch -- that would
// require a distinct signal (e.g. a double pointer), which none of the
// current call sites need. If a future call site needs that distinction,
// it should not force this helper; it needs a different shape.
func ResolveOptionalPointer[T any](current, patch *T) *T {
	if patch != nil {
		return patch
	}
	return current
}

// PointersEqual reports whether two pointers are value-equal: true if both
// are nil, or both are non-nil and point to equal values; false if exactly
// one is nil, or both are non-nil but point to different values.
//
// Unlike comparing the pointers themselves (a == b), this is not fooled by
// two distinct pointers holding equal values -- e.g. two *string patch
// values produced by separate normalization calls that happen to agree.
func PointersEqual[T comparable](a, b *T) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

// Changed reports whether resolved differs from current, for a genuinely
// comparable value type. It is a thin, named wrapper around !=, meant to
// make patch call sites read as intent ("did this field change?") rather
// than a bare inequality.
//
// Changed is for comparable value types (strings, UUIDs, numbers, bools,
// ...) compared by ==. It is deliberately not used for time.Time (compare
// with Time.Equal instead -- == can disagree for equal instants that carry
// different monotonic readings or locations) or for maps/slices (compare
// with reflect.DeepEqual instead, since they are not comparable). For
// pointer fields, use PointersEqual, not Changed, so that two distinct
// pointers to equal values are correctly treated as unchanged.
func Changed[T comparable](current, resolved T) bool {
	return current != resolved
}
