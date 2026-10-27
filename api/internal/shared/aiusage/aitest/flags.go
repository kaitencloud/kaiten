// Package aitest supplies explicit pure flag-reader opt-ins for test fixtures.
// Production wiring must use the trusted platform source, never this stub.
package aitest

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

// Flags is a stub decision, not an application configuration switch.
type Flags bool

func (f Flags) BooleanValue(_ context.Context, organizationID uuid.UUID, key string) (bool, error) {
	return organizationID != uuid.Nil && key == aiusage.FlagKey && bool(f), nil
}
