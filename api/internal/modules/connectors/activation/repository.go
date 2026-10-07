// Package activation is the organization-level half of a connector: whether one
// organization has turned it on.
//
// It is a separate store from registry for the reason it is a separate table.
// Registration says a connector EXISTS in this deployment; activation says an
// organization USES it. Conflating them is what left "is Attio on for this tenant?"
// answerable only by asking Vault whether a secret was there, which made
// availability, entitlement and activation share one 404.
package activation

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/infrastructure/db"
)

// ErrNotFound means the organization has not activated the connector. It is an
// ordinary answer rather than a failure -- most organizations have most connectors
// off -- so callers are expected to branch on it, not to propagate it.
var ErrNotFound = errors.New("connector is not activated for this organization")

// Activation is one organization's decision to use one connector.
//
// It carries no settings and no credentials. Those live in the settings store, keyed
// by the same pair, and keeping them apart is what lets this row be read to answer
// "is it on" without anybody reading a secret to find out.
type Activation struct {
	OrganizationID uuid.UUID
	ConnectorName  string
	ActivatedAt    time.Time
}

// Reader answers whether one connector is active for one organization.
type Reader interface {
	Get(ctx context.Context, organizationID uuid.UUID, connectorName string) (*Activation, error)
}

// Writer turns one connector on or off for one organization.
type Writer interface {
	// Activate is idempotent and does not move ActivatedAt on a repeat: activating
	// something already active is the same request with a different outcome, and when
	// an organization FIRST turned a connector on is worth not overwriting every time
	// its settings form is saved. inserted reports a first activation, so a caller
	// can act on the transition and not on every repeat.
	Activate(ctx context.Context, organizationID uuid.UUID, connectorName string) (activation *Activation, inserted bool, err error)

	// Deactivate reports whether a row was actually removed, so a caller can tell
	// "turned it off" from "it was already off" without a read that races the delete.
	Deactivate(ctx context.Context, organizationID uuid.UUID, connectorName string) (bool, error)
}

type Repository interface {
	Reader
	Writer
}

type QueryRepository struct {
	queries *db.Queries
}

func NewQueryRepository(queries *db.Queries) *QueryRepository {
	return &QueryRepository{queries: queries}
}

func (r *QueryRepository) Get(
	ctx context.Context, organizationID uuid.UUID, connectorName string,
) (*Activation, error) {
	if r.queries == nil {
		return nil, fmt.Errorf("connector activation repository is not configured")
	}

	row, err := r.queries.GetConnectorActivation(ctx, db.GetConnectorActivationParams{
		OrganizationID: organizationID,
		ConnectorName:  connectorName,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	return decode(row), nil
}

func (r *QueryRepository) Activate(
	ctx context.Context, organizationID uuid.UUID, connectorName string,
) (*Activation, bool, error) {
	if r.queries == nil {
		return nil, false, fmt.Errorf("connector activation repository is not configured")
	}

	row, err := r.queries.ActivateConnectorForOrganization(ctx, db.ActivateConnectorForOrganizationParams{
		OrganizationID: organizationID,
		ConnectorName:  connectorName,
	})
	if err != nil {
		return nil, false, err
	}

	return &Activation{
		OrganizationID: row.OrganizationID,
		ConnectorName:  row.ConnectorName,
		ActivatedAt:    row.ActivatedAt.Time,
	}, row.Inserted, nil
}

func (r *QueryRepository) Deactivate(
	ctx context.Context, organizationID uuid.UUID, connectorName string,
) (bool, error) {
	if r.queries == nil {
		return false, fmt.Errorf("connector activation repository is not configured")
	}

	removed, err := r.queries.DeactivateConnectorForOrganization(ctx, db.DeactivateConnectorForOrganizationParams{
		OrganizationID: organizationID,
		ConnectorName:  connectorName,
	})
	if err != nil {
		return false, err
	}

	return removed > 0, nil
}

func decode(row db.OrganizationConnector) *Activation {
	return &Activation{
		OrganizationID: row.OrganizationID,
		ConnectorName:  row.ConnectorName,
		ActivatedAt:    row.ActivatedAt.Time,
	}
}

// Checker answers activation as a boolean rather than as a row or an error.
//
// It lives here, in the package that owns ErrNotFound, so that the "not activated is
// not a failure" translation is written once. A consumer that only wants to know
// whether to do any work -- an event consumer deciding whether this organization cares
// about a delivery -- would otherwise have to remember on its own that a missing row is
// an ordinary answer, and one that forgot would turn every organization with the
// connector switched off into a redelivery loop.
type Checker struct {
	reader Reader
}

func NewChecker(reader Reader) *Checker { return &Checker{reader: reader} }

func (c *Checker) Activated(
	ctx context.Context, organizationID uuid.UUID, connectorName string,
) (bool, error) {
	if _, err := c.reader.Get(ctx, organizationID, connectorName); err != nil {
		if errors.Is(err, ErrNotFound) {
			return false, nil
		}

		return false, err
	}

	return true, nil
}
