// Package flaggrants is the vouchers module's read port for the flag
// evaluator (§7.4 rule 6, V32-03 c): the flag variants an instance's
// redemptions grant at the request's instant. The featureflags module reads
// it instead of the vouchers module's infrastructure.
package flaggrants

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
)

// Grant is one flag variant a redemption grants.
type Grant struct {
	FlagID       uuid.UUID
	Variant      string
	VoucherID    uuid.UUID
	RedemptionID uuid.UUID
}

// Port is the read surface the flag evaluator needs from the vouchers module.
type Port interface {
	// ForInstance is the instance's grants in their window, the latest
	// redemption first, read in one query with the instant read once. A
	// redeemed grant applies whatever the billing state (INV-24).
	ForInstance(ctx context.Context, organizationID, instanceID uuid.UUID) ([]Grant, error)
}

type port struct {
	queries *db.Queries
}

// New builds a Port bound to the pool: reads never join a caller's
// transaction.
func New(pool *pgxpool.Pool) Port {
	return &port{queries: db.New(pool)}
}

func (p *port) ForInstance(ctx context.Context, organizationID, instanceID uuid.UUID) ([]Grant, error) {
	rows, err := p.queries.ListActiveFlagGrants(ctx, db.ListActiveFlagGrantsParams{OrganizationID: organizationID, InstanceID: instanceID})
	if err != nil {
		return nil, err
	}
	grants := make([]Grant, len(rows))
	for i, row := range rows {
		grants[i] = Grant{FlagID: row.FlagID, Variant: row.Variant, VoucherID: row.VoucherID, RedemptionID: row.RedemptionID}
	}
	return grants, nil
}
