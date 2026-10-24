// Package targetingfacts is the customers module's public read port for
// feature-flag targeting: resolving a customer by (org, slug), and the
// licence/entitlement facts a targeting rule judges a customer's instance
// against. Consumed by featureflags/openfeature/ofrep instead of reaching
// into this module's own generated db package directly.
package targetingfacts

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/effectivelookup"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
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
	done := effectivelookup.Time(ctx, effectivelookup.ReaderOFREP)
	defer done()
	rows, err := p.queries.GetTargetingFactsByCustomerSlug(ctx, db.GetTargetingFactsByCustomerSlugParams{
		OrganizationID: organizationID,
		CustomerSlug:   customerSlug,
	})
	if err != nil {
		return nil, err
	}

	facts := make([]TargetingFact, len(rows))
	for i, row := range rows {
		usage, err := currentUsage(row)
		if err != nil {
			return nil, err
		}
		facts[i] = TargetingFact{
			LicenseSlug:       row.LicenseSlug,
			LicenseFamilySlug: row.LicenseFamilySlug,
			LicenseType:       string(row.LicenseType),
			EntitlementSlug:   row.EntitlementSlug,
			LimitValue:        row.LimitValue,
			UsageValue:        usage,
		}
	}
	return facts, nil
}

// currentUsage is the usage of the current window, read lazily as every
// gauge read is (§6.1 rule 2, V31-57): a periodic counter whose stored window
// is not the current one -- it ended, or the configuration changed -- reads
// as the new window's, 0, until the next report rolls it over. A lifetime
// counter, or a value that is no usage, is the one stored.
func currentUsage(row db.GetTargetingFactsByCustomerSlugRow) ([]byte, error) {
	if row.ResetPeriod == nil || row.ResetAnchor == nil || len(row.UsageValue) == 0 {
		return row.UsageValue, nil
	}
	stored, err := entitlementvalue.ParseNumberUsageValue(row.UsageValue)
	if err != nil {
		return row.UsageValue, nil //nolint:nilerr // not a NUMBER usage: nothing to resolve
	}
	var storedStart *time.Time
	if row.UsagePeriodStart.Valid {
		start := row.UsagePeriodStart.Time.UTC()
		storedStart = &start
	}
	window, _, err := period.ResolveCurrent(row.Now.Time.UTC(), storedStart, period.ResetPeriod(*row.ResetPeriod),
		period.ResetAnchor(*row.ResetAnchor), row.StartLicenseDate.Time.UTC())
	if err != nil {
		return nil, err
	}
	return json.Marshal(entitlementvalue.ResolveCurrentWindowUsage(stored, storedStart, window))
}
