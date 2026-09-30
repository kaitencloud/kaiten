package associateentitlementwithlicense

type Command struct {
	EntitlementSlug string         `json:"entitlementSlug"`
	Value           map[string]any `json:"value"`
	// LimitCapExceededOveragePercent overrides the default derived from Value
	// (see entitlementvalue.DefaultLimitCapExceededOveragePercent) when set:
	// -1 only when Value's numeric limit is unlimited, 0 for a hard limit, or
	// a positive percentage for a soft limit. Only meaningful when Value is
	// numeric.
	LimitCapExceededOveragePercent *int32 `json:"limitCapExceededOveragePercent,omitempty"`
}
