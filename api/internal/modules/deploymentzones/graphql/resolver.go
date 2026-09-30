package graphql

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
	deploymentzoneschema "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// ErrMissingIdentity is returned when identity is not in context.
var ErrMissingIdentity = errors.New("missing identity in context")

// GetDeploymentZones returns a cursor-paginated page of deployment zones for
// the current organization -- the GraphQL twin of GET /deployment-zones.
func GetDeploymentZones(ctx context.Context, queries *db.Queries, limit int32, cursor *string) (*deploymentzoneschema.DeploymentZonePage, error) {
	i, ok := principal.FromContext(ctx)
	if !ok {
		return nil, ErrMissingIdentity
	}

	l := pagination.ClampLimit(limit)

	var cursorCreatedAt *time.Time
	var cursorID *uuid.UUID
	if cursor != nil {
		key, err := pagination.Decode[pagination.CreatedAtCursor](*cursor)
		if err != nil {
			// Bad input, not a server fault -- typed so presentError keeps the
			// message, under the code GET /deployment-zones already reports.
			return nil, apierrors.Wrap(err, apierrors.KindValidation, "DeploymentZones.InvalidCursor", "invalid cursor")
		}
		cursorCreatedAt = &key.CreatedAt
		cursorID = &key.ID
	}

	rows, err := queries.GetDeploymentZonesByCursor(ctx, db.GetDeploymentZonesByCursorParams{
		OrganizationID:  i.OrganizationID,
		CursorCreatedAt: pgtime.TimePtrToPgTimestamp(cursorCreatedAt),
		CursorID:        cursorID,
		LimitPlusOne:    l + 1,
	})
	if err != nil {
		return nil, err
	}

	zones := make([]deploymentzoneschema.DeploymentZone, 0, len(rows))
	for _, row := range rows {
		zone, err := toDeploymentZoneSchemaFromCursorRow(row)
		if err != nil {
			return nil, err
		}
		zones = append(zones, zone)
	}

	page, err := pagination.BuildPage(zones, l, func(z deploymentzoneschema.DeploymentZone) pagination.CreatedAtCursor {
		return pagination.CreatedAtCursor{CreatedAt: z.CreatedAt, ID: z.ID}
	})
	if err != nil {
		return nil, err
	}

	return &deploymentzoneschema.DeploymentZonePage{Items: page.Items, NextCursor: page.NextCursor, HasMore: page.HasMore}, nil
}

// GetDeploymentZone returns a single deployment zone by ID or slug. A zone the
// organization does not have resolves to nil, not an error, matching
// Query.release.
func GetDeploymentZone(ctx context.Context, queries *db.Queries, id *uuid.UUID, slug *string) (*deploymentzoneschema.DeploymentZone, error) {
	i, ok := principal.FromContext(ctx)
	if !ok {
		return nil, ErrMissingIdentity
	}

	switch {
	case id != nil:
		row, err := queries.GetOneDeploymentZone(ctx, db.GetOneDeploymentZoneParams{
			OrganizationID:   i.OrganizationID,
			DeploymentZoneID: *id,
		})
		if err != nil {
			return nil, ignoreNoRows(err)
		}
		zone, err := toDeploymentZoneSchemaFromOneRow(row)
		if err != nil {
			return nil, err
		}
		return &zone, nil
	case slug != nil:
		row, err := queries.GetOneDeploymentZoneBySlug(ctx, db.GetOneDeploymentZoneBySlugParams{
			OrganizationID: i.OrganizationID,
			Slug:           *slug,
		})
		if err != nil {
			return nil, ignoreNoRows(err)
		}
		zone, err := toDeploymentZoneSchemaFromBySlugRow(row)
		if err != nil {
			return nil, err
		}
		return &zone, nil
	default:
		return nil, nil
	}
}

func ignoreNoRows(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	return err
}

// decodeMetadata mirrors the REST repositories: an unreadable metadata blob
// is a stored-data problem, so it surfaces rather than being swallowed.
func decodeMetadata(raw []byte) (map[string]interface{}, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	var metadata map[string]interface{}
	if err := json.Unmarshal(raw, &metadata); err != nil {
		return nil, err
	}
	return metadata, nil
}

func toDeploymentZoneSchemaFromCursorRow(row db.GetDeploymentZonesByCursorRow) (deploymentzoneschema.DeploymentZone, error) {
	metadata, err := decodeMetadata(row.Metadata)
	if err != nil {
		return deploymentzoneschema.DeploymentZone{}, err
	}
	return deploymentzoneschema.DeploymentZone{
		ID:          row.ID,
		Name:        row.Name,
		Slug:        row.Slug,
		Type:        row.Type,
		Metadata:    metadata,
		Description: row.Description,
		ReleaseID:   nullableUUID(row.ReleaseID),
		CreatedBy:   shared.User{ID: row.CreatedByID, Name: row.CreatedByName},
		CreatedAt:   row.CreatedAt.Time,
		UpdatedBy:   shared.User{ID: row.UpdatedByID, Name: row.UpdatedByName},
		UpdatedAt:   row.UpdatedAt.Time,
	}, nil
}

func toDeploymentZoneSchemaFromOneRow(row db.GetOneDeploymentZoneRow) (deploymentzoneschema.DeploymentZone, error) {
	metadata, err := decodeMetadata(row.Metadata)
	if err != nil {
		return deploymentzoneschema.DeploymentZone{}, err
	}
	return deploymentzoneschema.DeploymentZone{
		ID:          row.ID,
		Name:        row.Name,
		Slug:        row.Slug,
		Type:        row.Type,
		Metadata:    metadata,
		Description: row.Description,
		ReleaseID:   nullableUUID(row.ReleaseID),
		CreatedBy:   shared.User{ID: row.CreatedByID, Name: row.CreatedByName},
		CreatedAt:   row.CreatedAt.Time,
		UpdatedBy:   shared.User{ID: row.UpdatedByID, Name: row.UpdatedByName},
		UpdatedAt:   row.UpdatedAt.Time,
	}, nil
}

func toDeploymentZoneSchemaFromBySlugRow(row db.GetOneDeploymentZoneBySlugRow) (deploymentzoneschema.DeploymentZone, error) {
	metadata, err := decodeMetadata(row.Metadata)
	if err != nil {
		return deploymentzoneschema.DeploymentZone{}, err
	}
	return deploymentzoneschema.DeploymentZone{
		ID:          row.ID,
		Name:        row.Name,
		Slug:        row.Slug,
		Type:        row.Type,
		Metadata:    metadata,
		Description: row.Description,
		ReleaseID:   nullableUUID(row.ReleaseID),
		CreatedBy:   shared.User{ID: row.CreatedByID, Name: row.CreatedByName},
		CreatedAt:   row.CreatedAt.Time,
		UpdatedBy:   shared.User{ID: row.UpdatedByID, Name: row.UpdatedByName},
		UpdatedAt:   row.UpdatedAt.Time,
	}, nil
}

// LoadDeploymentZone loads a deployment zone using the dataloader.
func LoadDeploymentZone(ctx context.Context, id uuid.UUID) (*deploymentzoneschema.DeploymentZone, error) {
	loader, err := GetDeploymentZoneLoader(ctx)
	if err != nil {
		return nil, err
	}

	thunk := loader.Load(ctx, id)
	row, err := thunk()
	if err != nil {
		return nil, err
	}

	result, err := toDeploymentZoneSchema(row)
	if err != nil {
		return nil, err
	}

	return &result, nil
}
