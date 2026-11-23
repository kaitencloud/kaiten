package createrelease

import (
	"github.com/google/uuid"
)

type Command struct {
	Version      string      `json:"version"`
	Slug         *string     `json:"slug,omitempty"`
	Description  *string     `json:"description,omitempty"`
	ReleaseNote  *string     `json:"releaseNote,omitempty"`
	ComponentIDs []uuid.UUID `json:"componentIds,omitempty"`
}
