package feed

import (
	"context"
	"encoding/json"
	"slices"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/infrastructure/db"
)

// payloadIDs are the payload keys that name an object by id alone. They are
// spelled the same in every event that carries them -- the deployment record,
// the instance, the license entitlement -- so one decoder serves every row.
type payloadIDs struct {
	DeploymentZoneID string `json:"deploymentZoneId"`
	ReleaseID        string `json:"releaseId"`
	LicenseID        string `json:"licenseId"`
}

// named is what one row names, before anything is looked up.
type named struct {
	instance       *uuid.UUID
	deploymentZone *uuid.UUID
	release        *uuid.UUID
	license        *uuid.UUID
}

func namedBy(row db.ListNotificationsRow) named {
	var ids payloadIDs
	_ = json.Unmarshal(row.Payload, &ids)

	return named{
		instance:       row.InstanceID,
		deploymentZone: parseID(ids.DeploymentZoneID),
		release:        parseID(ids.ReleaseID),
		license:        parseID(ids.LicenseID),
	}
}

// parseID is lenient on purpose: a payload is whatever its producer wrote, and a
// value that is not an id names nothing anyone can resolve -- which the renderer
// already knows how to say -- rather than a reason to fail the page.
func parseID(raw string) *uuid.UUID {
	id, err := uuid.Parse(raw)
	if err != nil || id == uuid.Nil {
		return nil
	}

	return &id
}

// resolved is every object one page names that still exists, keyed by id.
type resolved struct {
	instances       map[uuid.UUID]catalogue.Ref
	deploymentZones map[uuid.UUID]catalogue.Ref
	releases        map[uuid.UUID]catalogue.Ref
	licenses        map[uuid.UUID]catalogue.Ref
}

// resolve looks up what a page of rows names: one query per kind of object
// rather than one per row, and none for a kind the page does not name.
func resolve(ctx context.Context, reader Reader, organizationID uuid.UUID, rows []named) (resolved, error) {
	var instanceIDs, zoneIDs, releaseIDs, licenseIDs []uuid.UUID
	for _, row := range rows {
		instanceIDs = appendID(instanceIDs, row.instance)
		zoneIDs = appendID(zoneIDs, row.deploymentZone)
		releaseIDs = appendID(releaseIDs, row.release)
		licenseIDs = appendID(licenseIDs, row.license)
	}

	instances, err := lookup(instanceIDs,
		func(ids []uuid.UUID) ([]db.ResolveInstancesRow, error) {
			return reader.ResolveInstances(ctx, db.ResolveInstancesParams{OrganizationID: organizationID, Ids: ids})
		},
		func(row db.ResolveInstancesRow) (uuid.UUID, catalogue.Ref) {
			return row.ID, catalogue.Ref{Slug: row.Slug, Name: row.Name}
		})
	if err != nil {
		return resolved{}, err
	}

	zones, err := lookup(zoneIDs,
		func(ids []uuid.UUID) ([]db.ResolveDeploymentZonesRow, error) {
			return reader.ResolveDeploymentZones(ctx, db.ResolveDeploymentZonesParams{OrganizationID: organizationID, Ids: ids})
		},
		func(row db.ResolveDeploymentZonesRow) (uuid.UUID, catalogue.Ref) {
			return row.ID, catalogue.Ref{Slug: row.Slug, Name: row.Name}
		})
	if err != nil {
		return resolved{}, err
	}

	releases, err := lookup(releaseIDs,
		func(ids []uuid.UUID) ([]db.ResolveReleasesRow, error) {
			return reader.ResolveReleases(ctx, db.ResolveReleasesParams{OrganizationID: organizationID, Ids: ids})
		},
		func(row db.ResolveReleasesRow) (uuid.UUID, catalogue.Ref) {
			return row.ID, catalogue.Ref{Slug: row.Slug, Name: row.Version}
		})
	if err != nil {
		return resolved{}, err
	}

	licenses, err := lookup(licenseIDs,
		func(ids []uuid.UUID) ([]db.ResolveLicensesRow, error) {
			return reader.ResolveLicenses(ctx, db.ResolveLicensesParams{OrganizationID: organizationID, Ids: ids})
		},
		func(row db.ResolveLicensesRow) (uuid.UUID, catalogue.Ref) {
			return row.ID, catalogue.Ref{Slug: row.Slug, Name: row.Name}
		})
	if err != nil {
		return resolved{}, err
	}

	return resolved{instances: instances, deploymentZones: zones, releases: releases, licenses: licenses}, nil
}

// refs is what the renderer of one row is given. An id with no match is left
// nil: the object was deleted, and the renderer links to its list instead.
func (r resolved) refs(row named) catalogue.Refs {
	return catalogue.Refs{
		Instance:       find(r.instances, row.instance),
		DeploymentZone: find(r.deploymentZones, row.deploymentZone),
		Release:        find(r.releases, row.release),
		License:        find(r.licenses, row.license),
	}
}

func lookup[Row any](
	ids []uuid.UUID,
	query func([]uuid.UUID) ([]Row, error),
	toRef func(Row) (uuid.UUID, catalogue.Ref),
) (map[uuid.UUID]catalogue.Ref, error) {
	if len(ids) == 0 {
		return nil, nil
	}

	rows, err := query(ids)
	if err != nil {
		return nil, err
	}

	found := make(map[uuid.UUID]catalogue.Ref, len(rows))
	for _, row := range rows {
		id, ref := toRef(row)
		found[id] = ref
	}

	return found, nil
}

func find(found map[uuid.UUID]catalogue.Ref, id *uuid.UUID) *catalogue.Ref {
	if id == nil {
		return nil
	}

	ref, ok := found[*id]
	if !ok {
		return nil
	}

	return &ref
}

func appendID(ids []uuid.UUID, id *uuid.UUID) []uuid.UUID {
	if id == nil || slices.Contains(ids, *id) {
		return ids
	}

	return append(ids, *id)
}
