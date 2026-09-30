package createentitlementgroup

// Command represents the input for creating an entitlement group.
type Command struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
	Slug        *string `json:"slug,omitempty"`
}
