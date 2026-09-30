package addentitlementtogroup

// Command represents the input for adding an entitlement to a group.
type Command struct {
	EntitlementSlug string `json:"entitlementSlug"`
}
