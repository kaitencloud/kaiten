package updateentitlementgroup

// Command represents the request body for updating an entitlement group.
type Command struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
}
