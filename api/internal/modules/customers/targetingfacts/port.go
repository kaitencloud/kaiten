// Package targetingfacts is the customers module's public read port for
// feature-flag targeting: resolving a customer by (org, slug), and the
// licence/entitlement facts a targeting rule judges a customer's instance
// against. Consumed by featureflags/openfeature/ofrep instead of reaching
// into this module's own generated db package directly.
package targetingfacts

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
)

// Customer is the subset of customer fields a targeting rule can reference.
type Customer struct {
	ID                 uuid.UUID
	Name               string
	Slug               string
	ExternalCustomerID *string
	Domain             *string
}

// TargetingFact is one licence-or-entitlement row for a customer's targeting
// key: the customer's licence and its family (repeated once per row) plus, when
// EntitlementSlug is set, one entitlement's recorded limit/usage on it.
type TargetingFact struct {
	LicenseSlug       string
	LicenseFamilySlug string
	LicenseType       string
	EntitlementSlug   *string
	LimitValue        []byte
	UsageValue        []byte
}

// Port is the read surface featureflags needs from the customers module.
type Port interface {
	GetOneCustomerBySlug(ctx context.Context, organizationID uuid.UUID, slug string) (*Customer, error)
	GetTargetingFactsByCustomerSlug(ctx context.Context, organizationID uuid.UUID, customerSlug string) ([]TargetingFact, error)
}

type port struct {
	queries *db.Queries
}

// New builds a Port bound to the given pool. Reads never need to join a
// caller's transaction, so this binds to the pool directly rather than
// taking a uow.DBTX.
func New(pool *pgxpool.Pool) Port {
	return &port{queries: db.New(pool)}
}

func (p *port) GetOneCustomerBySlug(ctx context.Context, organizationID uuid.UUID, slug string) (*Customer, error) {
	row, err := p.queries.GetOneCustomer(ctx, db.GetOneCustomerParams{OrganizationID: organizationID, Slug: slug})
	if err != nil {
		return nil, err
	}
	return &Customer{
		ID:                 row.ID,
		Name:               row.Name,
		Slug:               row.Slug,
		ExternalCustomerID: row.ExternalCustomerID,
		Domain:             row.Domain,
	}, nil
}

func (p *port) GetTargetingFactsByCustomerSlug(ctx context.Context, organizationID uuid.UUID, customerSlug string) ([]TargetingFact, error) {
	rows, err := p.queries.GetTargetingFactsByCustomerSlug(ctx, db.GetTargetingFactsByCustomerSlugParams{
		OrganizationID: organizationID,
		CustomerSlug:   customerSlug,
	})
	if err != nil {
		return nil, err
	}

	facts := make([]TargetingFact, len(rows))
	for i, row := range rows {
		facts[i] = TargetingFact{
			LicenseSlug:       row.LicenseSlug,
			LicenseFamilySlug: row.LicenseFamilySlug,
			LicenseType:       string(row.LicenseType),
			EntitlementSlug:   row.EntitlementSlug,
			LimitValue:        row.LimitValue,
			UsageValue:        row.UsageValue,
		}
	}
	return facts, nil
}
