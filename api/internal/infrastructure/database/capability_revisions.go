package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/google/uuid"
)

// CapabilityRevisionPlan is explicit deployment policy for the existing
// migrate-up runner. Core never derives commercial editions from license names.
// The database connection already selects the installation; the tenant and
// family ids must also match that installation before any contract is copied.
type CapabilityRevisionPlan struct {
	OrganizationID uuid.UUID                  `json:"organizationId"`
	Families       []CapabilityRevisionFamily `json:"families"`
}

type CapabilityRevisionFamily struct {
	FamilyID uuid.UUID `json:"familyId"`
	Vouchers *bool     `json:"vouchers"`
	Addons   *bool     `json:"addons"`
}

// ParseCapabilityRevisionPlan accepts no implicit true/false or guessed ids.
// Empty input disables this data transition, including on ordinary OSS installs.
func ParseCapabilityRevisionPlan(raw string) (*CapabilityRevisionPlan, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.DisallowUnknownFields()
	var plan *CapabilityRevisionPlan
	if err := decoder.Decode(&plan); err != nil {
		return nil, errors.New("invalid license capability revision policy")
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return nil, errors.New("license capability revision policy must be one JSON object")
	}
	if plan == nil {
		return nil, errors.New("license capability revision policy must be an object")
	}
	if err := plan.validate(); err != nil {
		return nil, err
	}
	return plan, nil
}

func (p CapabilityRevisionPlan) validate() error {
	if p.OrganizationID == uuid.Nil || len(p.Families) == 0 || len(p.Families) > 100 {
		return errors.New("license capability revision policy requires a tenant and 1–100 explicit families")
	}
	seen := map[uuid.UUID]bool{}
	for _, family := range p.Families {
		if family.FamilyID == uuid.Nil || seen[family.FamilyID] || family.Vouchers == nil || family.Addons == nil {
			return errors.New("license capability revision families require unique ids and both explicit Boolean values")
		}
		seen[family.FamilyID] = true
	}
	return nil
}

// runCapabilityRevisions is part of migrate-up, after Goose installs the SQL
// definitions. It deliberately runs again on restart even when the schema is
// current: a missing policy must not be recorded as an applied data transition,
// and a failed bounded batch must resume rather than abandon remaining clients.
// Lineage and complete equivalent price mappings are committed with each revision.
func runCapabilityRevisions(ctx context.Context, db *sql.DB, plan CapabilityRevisionPlan) error {
	if err := plan.validate(); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, 15*time.Minute)
	defer cancel()
	// All selected identities are checked before the first data write.
	var exists bool
	if err := db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM organization WHERE id = $1 AND deleted_at IS NULL)`, plan.OrganizationID).Scan(&exists); err != nil {
		return fmt.Errorf("verify capability revision tenant: %w", err)
	}
	if !exists {
		return errors.New("capability revision tenant is missing or deleted in this installation")
	}
	for _, family := range plan.Families {
		if err := db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM license_family WHERE id = $1 AND organization_id = $2)`, family.FamilyID, plan.OrganizationID).Scan(&exists); err != nil {
			return fmt.Errorf("verify capability revision family: %w", err)
		}
		if !exists {
			return errors.New("capability revision family does not belong to the selected tenant")
		}
	}
	// Bootstrap must preflight frozen historical grants before catalog writes.
	// Supply missing BOOLEAN definitions here to avoid a bootstrap/migration
	// ordering cycle; existing definitions and their metadata are never replaced.
	if err := capabilityRevisionTransaction(ctx, db, func(tx *sql.Tx) error {
		var invalid bool
		if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM entitlement WHERE organization_id = $1 AND slug IN ('vouchers','addons') AND type <> 'BOOLEAN')`, plan.OrganizationID).Scan(&invalid); err != nil {
			return err
		}
		if invalid {
			return errors.New("capability revision definitions must be BOOLEAN; existing definitions cannot be replaced")
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO entitlement (name, slug, description, type, organization_id) VALUES
			('Vouchers','vouchers','Whether new vouchers and redemptions are permitted.','BOOLEAN',$1),
			('Add-ons','addons','Whether new add-ons and attachments are permitted.','BOOLEAN',$1)
			ON CONFLICT (organization_id, slug) DO NOTHING`, plan.OrganizationID); err != nil {
			return err
		}
		var definitions int
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM entitlement WHERE organization_id = $1 AND slug IN ('vouchers','addons') AND type = 'BOOLEAN'`, plan.OrganizationID).Scan(&definitions); err != nil {
			return err
		}
		if definitions != 2 {
			return errors.New("capability revision requires both BOOLEAN definitions in the selected tenant")
		}
		return nil
	}); err != nil {
		return fmt.Errorf("prepare capability revision definitions: %w", err)
	}

	for _, family := range plan.Families {
		rows, err := db.QueryContext(ctx, `SELECT l.id FROM license l WHERE l.family_id = $1 AND l.organization_id = $2
			AND (l.lifecycle_state <> 'ARCHIVED' OR EXISTS(SELECT 1 FROM instance i WHERE i.license_id = l.id)
				OR EXISTS(SELECT 1 FROM instance_billing ib JOIN license_price lp ON lp.id = ib.base_license_price_id OR lp.id = ib.scheduled_license_price_id
					WHERE lp.license_id = l.id OR ib.pending_license_id = l.id)
				OR EXISTS(SELECT 1 FROM checkout_session cs JOIN license_price lp ON lp.id = cs.license_price_id
					WHERE lp.license_id = l.id AND cs.status IN ('OPEN','AWAITING_PAYMENT')))
			ORDER BY l.is_default, (l.lifecycle_state = 'PUBLISHED'), l.version LIMIT 1001`, family.FamilyID, plan.OrganizationID)
		if err != nil {
			return fmt.Errorf("inventory capability revision sources: %w", err)
		}
		var sources []uuid.UUID
		for rows.Next() {
			var id uuid.UUID
			if err := rows.Scan(&id); err != nil {
				_ = rows.Close()
				return err
			}
			sources = append(sources, id)
		}
		readErr := rows.Err()
		closeErr := rows.Close()
		if readErr != nil || closeErr != nil {
			return errors.Join(readErr, closeErr)
		}
		if len(sources) == 0 || len(sources) > 1000 {
			return errors.New("capability revision family has no supported sources or exceeds the bounded catalogue budget")
		}
		// The current/default source is last, so its equivalent successor remains
		// current even when historical sources have different economic terms.
		for _, source := range sources {
			var target uuid.UUID
			if err := capabilityRevisionTransaction(ctx, db, func(tx *sql.Tx) error {
				return tx.QueryRowContext(ctx, `SELECT prepare_license_capability_revision($1,$2,$3,$4)`, plan.OrganizationID, source, *family.Vouchers, *family.Addons).Scan(&target)
			}); err != nil {
				return fmt.Errorf("prepare capability revision: %w", err)
			}
			if target == source {
				continue // already has both exact stored capability values
			}
			for {
				var changed int
				if err := capabilityRevisionTransaction(ctx, db, func(tx *sql.Tx) error {
					return tx.QueryRowContext(ctx, `SELECT apply_license_capability_revision_batch($1,$2)`, plan.OrganizationID, source).Scan(&changed)
				}); err != nil {
					return fmt.Errorf("apply capability revision batch (restart migrate-up to resume): %w", err)
				}
				if changed == 0 {
					break
				}
			}
		}
	}
	return nil
}

func capabilityRevisionTransaction(ctx context.Context, db *sql.DB, apply func(*sql.Tx) error) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '30s'`); err != nil {
		return err
	}
	if err := apply(tx); err != nil {
		return err
	}
	return tx.Commit()
}
