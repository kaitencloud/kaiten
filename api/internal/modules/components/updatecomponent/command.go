package updatecomponent

type Command struct {
	Name        string  `json:"name"`
	Version     string  `json:"version"`
	Slug        *string `json:"slug,omitempty"`
	Description *string `json:"description,omitempty"`
}
