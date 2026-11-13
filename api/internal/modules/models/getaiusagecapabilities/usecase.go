// Package getaiusagecapabilities reads the current trusted platform rollout flag.
// It grants no permission to consume a pool.
package getaiusagecapabilities

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

type (
	Capabilities struct {
		Enabled bool `json:"enabled"`
	}
	UseCase struct{ Policy aiusage.Policy }
)

func (u UseCase) Read(ctx context.Context, organizationID uuid.UUID) Capabilities {
	ctx = u.Policy.Resolve(ctx, organizationID)
	return Capabilities{Enabled: u.Policy.Enabled(ctx)}
}
