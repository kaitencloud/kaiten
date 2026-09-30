package createdeploymentzone

import "github.com/google/uuid"

type Command struct {
	Name        string                 `json:"name"`
	Type        string                 `json:"type"`
	Metadata    map[string]interface{} `json:"metadata"`
	Description string                 `json:"description"`
	ReleaseID   *uuid.UUID             `json:"releaseId,omitempty"`
	Slug        *string                `json:"slug,omitempty"`
}
