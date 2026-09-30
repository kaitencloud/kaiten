package graphql

import (
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	auditschema "github.com/kaitencloud/kaiten/api/internal/modules/audittrail/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

func toAuditTrailSchema(entry *auditschema.Entry) (*schema.AuditTrail, error) {
	var payload any
	if len(entry.Payload) > 0 {
		if err := json.Unmarshal(entry.Payload, &payload); err != nil {
			return nil, err
		}
	}
	return &schema.AuditTrail{
		ID:           entry.ID,
		InstanceID:   entry.InstanceID,
		InstanceSlug: entry.InstanceSlug,
		EventName:    entry.EventName,
		EventType:    entry.EventType,
		Timestamp:    entry.OccurredAt,
		Payload:      payload,
	}, nil
}

func toOrganizationAuditTrailSchema(entry *auditschema.OrganizationEntry) (*schema.OrganizationAuditTrail, error) {
	// Non-object payloads surface as null, mirroring the AuditTrail payload resolver.
	var payload map[string]any
	if len(entry.Payload) > 0 {
		var raw any
		if err := json.Unmarshal(entry.Payload, &raw); err != nil {
			return nil, err
		}
		if m, ok := raw.(map[string]any); ok {
			payload = m
		}
	}
	return &schema.OrganizationAuditTrail{
		ID:           entry.ID,
		InstanceID:   entry.InstanceID,
		InstanceSlug: entry.InstanceSlug,
		InstanceName: entry.InstanceName,
		CustomerID:   entry.CustomerID,
		CustomerSlug: entry.CustomerSlug,
		CustomerName: entry.CustomerName,
		EventName:    entry.EventName,
		EventType:    entry.EventType,
		Timestamp:    entry.OccurredAt,
		Payload:      payload,
	}, nil
}

// ErrMissingIdentity is returned when identity is not in context.
var ErrMissingIdentity = errors.New("missing identity in context")

func instanceRowToSchema(
	id uuid.UUID,
	slug string,
	status schema.InstanceStatus,
	lifecycleStage *string,
	name string,
	description string,
	createdByID uuid.UUID,
	createdByName string,
	createdAt pgtype.Timestamp,
	updatedByID uuid.UUID,
	updatedByName string,
	updatedAt pgtype.Timestamp,
	customerID uuid.UUID,
	customerSlugPtr *string,
	licenseID uuid.UUID,
	licenseSlugPtr *string,
	deploymentZoneID *uuid.UUID,
	deploymentZoneSlug *string,
	startLicenseDate pgtype.Timestamp,
	endLicenseDate pgtype.Timestamp,
	metadata []byte,
) (*schema.Instance, error) {
	metadataMap, err := schema.UnmarshalJSONObject(metadata)
	if err != nil {
		return nil, err
	}

	licenseSlug := ""
	if licenseSlugPtr != nil {
		licenseSlug = *licenseSlugPtr
	}

	customerSlug := ""
	if customerSlugPtr != nil {
		customerSlug = *customerSlugPtr
	}

	return &schema.Instance{
		ID:                 id,
		Slug:               slug,
		Name:               name,
		Description:        description,
		CreatedBy:          shared.User{ID: createdByID, Name: createdByName},
		CreatedAt:          createdAt.Time,
		UpdatedBy:          shared.User{ID: updatedByID, Name: updatedByName},
		UpdatedAt:          updatedAt.Time,
		Status:             status,
		LifecycleStage:     lifecycleStage,
		CustomerID:         customerID,
		CustomerSlug:       customerSlug,
		LicenseID:          licenseID,
		LicenseSlug:        licenseSlug,
		DeploymentZoneID:   deploymentZoneID,
		DeploymentZoneSlug: deploymentZoneSlug,
		StartLicenseDate:   startLicenseDate.Time,
		EndLicenseDate:     endLicenseDate.Time,
		Metadata:           metadataMap,
	}, nil
}

func toInstanceSchemaFromGetOneInstanceRow(i db.GetOneInstanceRow) (*schema.Instance, error) {
	return instanceRowToSchema(
		i.ID, i.Slug, schema.InstanceStatus(i.Status), i.LifecycleStage, i.Name, i.Description,
		i.CreatedByID, i.CreatedByName, i.CreatedAt,
		i.UpdatedByID, i.UpdatedByName, i.UpdatedAt,
		i.CustomerID, i.CustomerSlug, i.LicenseID, i.LicenseSlug,
		i.DeploymentZoneID, i.DeploymentZoneSlug, i.StartLicenseDate, i.EndLicenseDate, i.Metadata,
	)
}

func toInstanceSchemaFromGetInstancesByIDsRow(i db.GetInstancesByIDsRow) (*schema.Instance, error) {
	return instanceRowToSchema(
		i.ID, i.Slug, schema.InstanceStatus(i.Status), i.LifecycleStage, i.Name, i.Description,
		i.CreatedByID, i.CreatedByName, i.CreatedAt,
		i.UpdatedByID, i.UpdatedByName, i.UpdatedAt,
		i.CustomerID, i.CustomerSlug, i.LicenseID, i.LicenseSlug,
		i.DeploymentZoneID, i.DeploymentZoneSlug, i.StartLicenseDate, i.EndLicenseDate, i.Metadata,
	)
}

func toInstanceSchemaFromGetAllInstancesByCursorRow(i db.GetAllInstancesByCursorRow) (*schema.Instance, error) {
	return instanceRowToSchema(
		i.ID, i.Slug, schema.InstanceStatus(i.Status), i.LifecycleStage, i.Name, i.Description,
		i.CreatedByID, i.CreatedByName, i.CreatedAt,
		i.UpdatedByID, i.UpdatedByName, i.UpdatedAt,
		i.CustomerID, i.CustomerSlug, i.LicenseID, i.LicenseSlug,
		i.DeploymentZoneID, i.DeploymentZoneSlug, i.StartLicenseDate, i.EndLicenseDate, i.Metadata,
	)
}

func toInstanceSchemaFromCustomerRow(i db.GetInstancesByCustomerIDsRow) (*schema.Instance, error) {
	return instanceRowToSchema(
		i.ID, i.Slug, schema.InstanceStatus(i.Status), i.LifecycleStage, i.Name, i.Description,
		i.CreatedByID, i.CreatedByName, i.CreatedAt,
		i.UpdatedByID, i.UpdatedByName, i.UpdatedAt,
		i.CustomerID, i.CustomerSlug, i.LicenseID, i.LicenseSlug,
		i.DeploymentZoneID, i.DeploymentZoneSlug, i.StartLicenseDate, i.EndLicenseDate, i.Metadata,
	)
}

func toInstanceSchemasFromCustomerRows(instances []db.GetInstancesByCustomerIDsRow) ([]schema.Instance, error) {
	result := make([]schema.Instance, 0, len(instances))
	for _, i := range instances {
		inst, err := toInstanceSchemaFromCustomerRow(i)
		if err != nil {
			return nil, err
		}
		result = append(result, *inst)
	}
	return result, nil
}

func toInstanceSchemaFromLicenseRow(i db.GetInstancesByLicenseIDsRow) (*schema.Instance, error) {
	return instanceRowToSchema(
		i.ID, i.Slug, schema.InstanceStatus(i.Status), i.LifecycleStage, i.Name, i.Description,
		i.CreatedByID, i.CreatedByName, i.CreatedAt,
		i.UpdatedByID, i.UpdatedByName, i.UpdatedAt,
		i.CustomerID, i.CustomerSlug, i.LicenseID, i.LicenseSlug,
		i.DeploymentZoneID, i.DeploymentZoneSlug, i.StartLicenseDate, i.EndLicenseDate, i.Metadata,
	)
}

func toInstanceSchemasFromLicenseRows(instances []db.GetInstancesByLicenseIDsRow) ([]schema.Instance, error) {
	result := make([]schema.Instance, 0, len(instances))
	for _, i := range instances {
		inst, err := toInstanceSchemaFromLicenseRow(i)
		if err != nil {
			return nil, err
		}
		result = append(result, *inst)
	}
	return result, nil
}
