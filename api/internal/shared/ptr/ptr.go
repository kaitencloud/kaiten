package ptr

// To returns a pointer to the given value.
// Example: x := To(42) // *int pointing to 42
func To[T any](v T) *T {
	return &v
}
