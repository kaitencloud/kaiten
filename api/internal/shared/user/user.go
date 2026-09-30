package user

import (
	"github.com/google/uuid"
)

// User represents a lightweight user reference (id + display name).
// For optional references (revoked_by, deleted_by, etc.), use *User.
type User struct {
	ID   uuid.UUID `json:"id" doc:"ID of the user" example:"123e4567-e89b-12d3-a456-426614174000"`
	Name string    `json:"name,omitempty" doc:"Name of the user" example:"John Doe"`
}

// NewUser builds a User from nullable DB fields.
// Returns nil if id is nil (meaning no user is associated).
func NewUser(id *uuid.UUID, name *string) *User {
	if id == nil {
		return nil
	}
	nameVal := ""
	if name != nil {
		nameVal = *name
	}
	return &User{
		ID:   *id,
		Name: nameVal,
	}
}
