package upsertintegration

import (
	"context"
	"fmt"
	"reflect"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	createcustomer "github.com/kaitencloud/kaiten/api/internal/modules/customers/createcustomer"
	customerintegrationsync "github.com/kaitencloud/kaiten/api/internal/modules/customers/integrationsync"
	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	updatecustomer "github.com/kaitencloud/kaiten/api/internal/modules/customers/updatecustomer"
	createinstance "github.com/kaitencloud/kaiten/api/internal/modules/instances/createinstance"
	instanceintegrationsync "github.com/kaitencloud/kaiten/api/internal/modules/instances/integrationsync"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	updateinstance "github.com/kaitencloud/kaiten/api/internal/modules/instances/updateinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/integrations/adapter"
	integrationschema "github.com/kaitencloud/kaiten/api/internal/modules/integrations/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/integrationurl"
	"github.com/kaitencloud/kaiten/api/internal/shared/patchutil"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container. UsageReporter is only used for the post-update
// TrackAsync call below -- entitlement enforcement on create is delegated to
// CustomerCreator/InstanceCreator, which share the exact check (and, for
// customers, the exact rejection event) their own modules' direct-create
// paths use.
type Deps struct {
	UserProvider    currentuser.Provider
	UsageReporter   services.UsageReporter
	Uow             *uow.UnitOfWork
	CustomerCreator CustomerCreator
	CustomerUpdater CustomerUpdater
	InstanceCreator InstanceCreator
	InstanceUpdater InstanceUpdater
}

type UseCase struct {
	deps      Deps
	customers customerintegrationsync.Port
	instances instanceintegrationsync.Port
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:      deps,
		customers: customerintegrationsync.NewScoped(deps.Uow),
		instances: instanceintegrationsync.NewScoped(deps.Uow),
	}
}

func (h *UseCase) UpsertCustomer(ctx context.Context, adapterName, externalID string, body CustomerBody) (*integrationschema.CustomerIntegrationResource, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	normalizedAdapter, err := adapter.Normalize(adapterName)
	if err != nil {
		return nil, err
	}

	trimmedExternalID := strings.TrimSpace(externalID)
	if trimmedExternalID == "" {
		return nil, kaitenerrors.Validation("UpsertIntegration.InvalidExternalID", "Integration external ID cannot be empty")
	}

	createPath := false
	if _, err := h.customers.GetByExternalID(ctx, user.OrganizationID, normalizedAdapter, trimmedExternalID); err != nil {
		if !kaitenerrors.IsNotFound(err) {
			return nil, err
		}
		createPath = true
	}

	// The create path calls CustomerCreator.Execute directly, outside any
	// transaction this package owns -- Execute enforces the creation
	// entitlement and persists atomically as one self-contained call (see
	// its doc comment). Wrapping it in this package's own Transact would do
	// two things wrong: the ambient transaction would make Execute's
	// internal entitlement check join it instead of committing
	// independently, so a rejection's CustomerCreationRejected event would
	// be rolled back along with everything else instead of surviving; and
	// calling EnforceCreationLimit here first, before also calling Execute
	// (which enforces it again internally), would report usage twice for
	// one logical creation.
	if createPath {
		name, err := requiredTrimmedString(body.Name, "UpsertIntegration.CustomerNameRequired", "Customer name is required when creating a customer integration")
		if err != nil {
			return nil, err
		}
		resolvedSlug, err := resolveSlug(name, body.Slug, "UpsertIntegration.InvalidCustomerSlug")
		if err != nil {
			return nil, err
		}

		createdCustomer, err := h.deps.CustomerCreator.Execute(ctx, &createcustomer.Command{
			Name:   name,
			Slug:   &resolvedSlug,
			Domain: normalizeOptionalField(body.Domain),
			Integrations: map[string]customerschema.CustomerIntegration{
				normalizedAdapter: {
					ExternalID: trimmedExternalID,
					Metadata:   normalizeJSONObject(body.IntegrationMetadata),
					WebURL:     body.WebURL,
					LastError:  normalizeOptionalField(body.Error),
				},
			},
		})
		if err != nil {
			if kaitenerrors.GetCode(err) == createcustomer.EntitlementLimitReachedCode {
				return nil, kaitenerrors.Conflict("UpsertIntegration.CustomerLimitReached", "Customer creation limit reached for this organization")
			}
			return nil, err
		}

		integration := createdCustomer.Integrations[normalizedAdapter]
		return &integrationschema.CustomerIntegrationResource{
			Domain:   createdCustomer.Domain,
			Error:    integration.LastError,
			Metadata: integration.Metadata,
			Name:     createdCustomer.Name,
			Slug:     createdCustomer.Slug,
			WebURL:   integration.WebURL,
		}, nil
	}

	var response *integrationschema.CustomerIntegrationResource
	var resourceChanged bool

	err = h.deps.Uow.Transact(ctx, func(ctx context.Context) error {
		current, err := h.customers.GetByExternalID(ctx, user.OrganizationID, normalizedAdapter, trimmedExternalID)
		if err != nil {
			return err
		}

		resolvedName := current.Name
		if body.Name != nil {
			trimmed := strings.TrimSpace(*body.Name)
			if trimmed == "" {
				return kaitenerrors.Validation("UpsertIntegration.CustomerNameRequired", "Customer name cannot be empty")
			}
			resolvedName = trimmed
		}

		resolvedSlug := current.Slug
		if body.Slug != nil {
			resolvedSlug, err = resolveSlug(resolvedName, body.Slug, "UpsertIntegration.InvalidCustomerSlug")
			if err != nil {
				return err
			}
		}

		resolvedDomain := current.Domain
		if body.Domain != nil {
			resolvedDomain = normalizeOptionalField(body.Domain)
		}

		resourceChanged = patchutil.Changed(current.Name, resolvedName) || patchutil.Changed(current.Slug, resolvedSlug) || !patchutil.PointersEqual(current.Domain, resolvedDomain)

		integrationMetadata := current.Integration.Metadata
		integrationChanged := false
		if body.IntegrationMetadata != nil {
			integrationMetadata = normalizeJSONObject(body.IntegrationMetadata)
			integrationChanged = !reflect.DeepEqual(integrationMetadata, current.Integration.Metadata)
		}

		integrationLastError := current.Integration.LastError
		if body.Error != nil {
			integrationLastError = normalizeOptionalField(body.Error)
			integrationChanged = integrationChanged || !patchutil.PointersEqual(integrationLastError, current.Integration.LastError)
		}

		integrationWebURL := current.Integration.WebURL
		if body.WebURL != nil {
			integrationWebURL, err = integrationurl.Normalize(body.WebURL)
			if err != nil {
				return kaitenerrors.Validation("UpsertIntegration.InvalidWebURL", "webUrl must be an absolute http(s) URL")
			}
			integrationChanged = integrationChanged || !patchutil.PointersEqual(integrationWebURL, current.Integration.WebURL)
		}

		var updatedCustomer *customerschema.Customer
		if resourceChanged {
			updatedCustomer, err = h.deps.CustomerUpdater.Execute(ctx, &updatecustomer.Command{
				Name:               resolvedName,
				ExternalCustomerID: current.ExternalCustomerID,
				Domain:             resolvedDomain,
			}, current.Slug)
			if err != nil {
				return err
			}
			if resolvedSlug != current.Slug {
				if err := h.customers.UpdateSlugByID(ctx, user.OrganizationID, user.ID, current.ID, resolvedSlug); err != nil {
					return err
				}
				updatedCustomer.Slug = resolvedSlug
				updatedCustomer.UpdatedAt = time.Now().UTC()
			}
		} else {
			updatedCustomer = &customerschema.Customer{
				ID:                 current.ID,
				Name:               current.Name,
				Slug:               current.Slug,
				ExternalCustomerID: current.ExternalCustomerID,
				Domain:             current.Domain,
			}
		}

		integration := current.Integration
		if integrationChanged {
			updatedIntegration, err := h.customers.UpsertIntegration(ctx, user.OrganizationID, current.ID, normalizedAdapter, trimmedExternalID, integrationMetadata, integrationWebURL, integrationLastError)
			if err != nil {
				return err
			}
			integration = *updatedIntegration
		}

		response = &integrationschema.CustomerIntegrationResource{
			Domain:   updatedCustomer.Domain,
			Error:    integration.LastError,
			Metadata: integration.Metadata,
			Name:     updatedCustomer.Name,
			Slug:     updatedCustomer.Slug,
			WebURL:   integration.WebURL,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	if resourceChanged {
		h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.CustomerUpdatedEntitlementSlug)
	}

	return response, nil
}

func (h *UseCase) UpsertInstance(ctx context.Context, adapterName, externalID string, body InstanceBody) (*integrationschema.InstanceIntegrationResource, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	normalizedAdapter, err := adapter.Normalize(adapterName)
	if err != nil {
		return nil, err
	}

	trimmedExternalID := strings.TrimSpace(externalID)
	if trimmedExternalID == "" {
		return nil, kaitenerrors.Validation("UpsertIntegration.InvalidExternalID", "Integration external ID cannot be empty")
	}

	createPath := false
	if _, err := h.instances.GetByExternalID(ctx, user.OrganizationID, normalizedAdapter, trimmedExternalID); err != nil {
		if !kaitenerrors.IsNotFound(err) {
			return nil, err
		}
		createPath = true
	}

	// See UpsertCustomer's comment on the create branch: InstanceCreator.Execute
	// is called directly, outside this package's own transaction, so its
	// internal entitlement enforcement neither joins (and risks being rolled
	// back by) an ambient transaction nor gets reported twice.
	if createPath {
		name, err := requiredTrimmedString(body.Name, "UpsertIntegration.InstanceNameRequired", "Instance name is required when creating an instance integration")
		if err != nil {
			return nil, err
		}
		description, err := requiredTrimmedString(body.Description, "UpsertIntegration.InstanceDescriptionRequired", "Instance description is required when creating an instance integration")
		if err != nil {
			return nil, err
		}
		customerExternalID, err := requiredTrimmedString(body.CustomerExternalID, "UpsertIntegration.CustomerExternalIDRequired", "customerExternalId is required when creating an instance integration")
		if err != nil {
			return nil, err
		}
		licenseID, err := requiredUUID(body.LicenseID, "UpsertIntegration.LicenseIDRequired", "licenseId is required when creating an instance integration")
		if err != nil {
			return nil, err
		}
		startLicenseDate, err := requiredTime(body.StartLicenseDate, "UpsertIntegration.StartLicenseDateRequired", "startLicenseDate is required when creating an instance integration")
		if err != nil {
			return nil, err
		}
		endLicenseDate, err := requiredTime(body.EndLicenseDate, "UpsertIntegration.EndLicenseDateRequired", "endLicenseDate is required when creating an instance integration")
		if err != nil {
			return nil, err
		}
		customer, err := h.customers.GetByExternalID(ctx, user.OrganizationID, normalizedAdapter, customerExternalID)
		if err != nil {
			return nil, err
		}

		resolvedSlug, err := resolveSlug(name, body.Slug, "UpsertIntegration.InvalidInstanceSlug")
		if err != nil {
			return nil, err
		}

		createdInstance, err := h.deps.InstanceCreator.Execute(ctx, &createinstance.Command{
			Name:             name,
			Description:      description,
			CustomerID:       customer.ID,
			LicenseID:        licenseID,
			DeploymentZoneID: body.DeploymentZoneID,
			StartLicenseDate: startLicenseDate,
			EndLicenseDate:   endLicenseDate,
			Metadata:         normalizeJSONObject(body.Metadata),
			Slug:             &resolvedSlug,
			Integrations: map[string]instanceschema.InstanceIntegration{
				normalizedAdapter: {
					ExternalID: trimmedExternalID,
					Metadata:   normalizeJSONObject(body.IntegrationMetadata),
					WebURL:     body.WebURL,
					LastError:  normalizeOptionalField(body.Error),
				},
			},
		})
		if err != nil {
			if kaitenerrors.GetCode(err) == createinstance.EntitlementLimitReachedCode {
				return nil, kaitenerrors.Conflict("UpsertIntegration.InstanceLimitReached", "Instance creation limit reached for this organization")
			}
			return nil, err
		}

		integration := createdInstance.Integrations[normalizedAdapter]
		return &integrationschema.InstanceIntegrationResource{
			CustomerExternalID: &customerExternalID,
			WebURL:             integration.WebURL,
			DeploymentZoneID:   createdInstance.DeploymentZoneID,
			Description:        createdInstance.Description,
			EndLicenseDate:     createdInstance.EndLicenseDate,
			Error:              integration.LastError,
			LicenseID:          createdInstance.LicenseID,
			Metadata:           createdInstance.Metadata,
			Name:               createdInstance.Name,
			Slug:               createdInstance.Slug,
			StartLicenseDate:   createdInstance.StartLicenseDate,
		}, nil
	}

	var response *integrationschema.InstanceIntegrationResource
	var resourceChanged bool

	err = h.deps.Uow.Transact(ctx, func(ctx context.Context) error {
		current, err := h.instances.GetByExternalID(ctx, user.OrganizationID, normalizedAdapter, trimmedExternalID)
		if err != nil {
			return err
		}

		resolvedName := current.Name
		if body.Name != nil {
			trimmed := strings.TrimSpace(*body.Name)
			if trimmed == "" {
				return kaitenerrors.Validation("UpsertIntegration.InstanceNameRequired", "Instance name cannot be empty")
			}
			resolvedName = trimmed
		}

		resolvedSlug := current.Slug
		if body.Slug != nil {
			resolvedSlug, err = resolveSlug(resolvedName, body.Slug, "UpsertIntegration.InvalidInstanceSlug")
			if err != nil {
				return err
			}
		}

		resolvedDescription := patchutil.ResolveOptional(current.Description, body.Description)

		resolvedCustomerID := current.CustomerID
		resolvedCustomerExternalID := current.CustomerExternalID
		if body.CustomerExternalID != nil {
			customerExternalID, err := requiredTrimmedString(body.CustomerExternalID, "UpsertIntegration.CustomerExternalIDRequired", "customerExternalId cannot be empty")
			if err != nil {
				return err
			}
			customer, err := h.customers.GetByExternalID(ctx, user.OrganizationID, normalizedAdapter, customerExternalID)
			if err != nil {
				return err
			}
			resolvedCustomerID = customer.ID
			resolvedCustomerExternalID = &customerExternalID
		}

		resolvedLicenseID := patchutil.ResolveOptional(current.LicenseID, body.LicenseID)

		resolvedDeploymentZoneID := patchutil.ResolveOptionalPointer(current.DeploymentZoneID, body.DeploymentZoneID)

		resolvedStartLicenseDate := patchutil.ResolveOptional(current.StartLicenseDate, body.StartLicenseDate)

		resolvedEndLicenseDate := patchutil.ResolveOptional(current.EndLicenseDate, body.EndLicenseDate)

		resolvedMetadata := current.Metadata
		if body.Metadata != nil {
			resolvedMetadata = normalizeJSONObject(body.Metadata)
		}

		resourceChanged = patchutil.Changed(current.Name, resolvedName) ||
			patchutil.Changed(current.Slug, resolvedSlug) ||
			patchutil.Changed(current.Description, resolvedDescription) ||
			patchutil.Changed(current.CustomerID, resolvedCustomerID) ||
			patchutil.Changed(current.LicenseID, resolvedLicenseID) ||
			!patchutil.PointersEqual(resolvedDeploymentZoneID, current.DeploymentZoneID) ||
			!resolvedStartLicenseDate.Equal(current.StartLicenseDate) ||
			!resolvedEndLicenseDate.Equal(current.EndLicenseDate) ||
			!reflect.DeepEqual(resolvedMetadata, current.Metadata)

		integrationLastError := current.Integration.LastError
		integrationChanged := false
		integrationMetadata := current.Integration.Metadata
		if body.IntegrationMetadata != nil {
			integrationMetadata = normalizeJSONObject(body.IntegrationMetadata)
			integrationChanged = !reflect.DeepEqual(integrationMetadata, current.Integration.Metadata)
		}
		if body.Error != nil {
			integrationLastError = normalizeOptionalField(body.Error)
			integrationChanged = integrationChanged || !patchutil.PointersEqual(integrationLastError, current.Integration.LastError)
		}

		integrationWebURL := current.Integration.WebURL
		if body.WebURL != nil {
			integrationWebURL, err = integrationurl.Normalize(body.WebURL)
			if err != nil {
				return kaitenerrors.Validation("UpsertIntegration.InvalidWebURL", "webUrl must be an absolute http(s) URL")
			}
			integrationChanged = integrationChanged || !patchutil.PointersEqual(integrationWebURL, current.Integration.WebURL)
		}

		integration := current.Integration
		var updatedInstance *instanceschema.Instance
		if resourceChanged {
			updatedInstance, err = h.deps.InstanceUpdater.Execute(ctx, &updateinstance.Command{
				Name:             resolvedName,
				Description:      resolvedDescription,
				CustomerID:       resolvedCustomerID,
				LicenseID:        resolvedLicenseID,
				DeploymentZoneID: resolvedDeploymentZoneID,
				StartLicenseDate: resolvedStartLicenseDate,
				EndLicenseDate:   resolvedEndLicenseDate,
				Metadata:         resolvedMetadata,
			}, current.Slug)
			if err != nil {
				return err
			}

			if resolvedSlug != current.Slug {
				if err := h.instances.UpdateSlugByID(ctx, user.OrganizationID, user.ID, current.ID, resolvedSlug); err != nil {
					return err
				}
				updatedInstance.Slug = resolvedSlug
				updatedInstance.UpdatedAt = time.Now().UTC()
			}
		} else {
			updatedInstance = &instanceschema.Instance{
				ID:               current.ID,
				Name:             current.Name,
				Slug:             current.Slug,
				Description:      current.Description,
				CustomerID:       current.CustomerID,
				LicenseID:        current.LicenseID,
				DeploymentZoneID: current.DeploymentZoneID,
				StartLicenseDate: current.StartLicenseDate,
				EndLicenseDate:   current.EndLicenseDate,
				Metadata:         current.Metadata,
			}
		}

		if integrationChanged {
			updatedIntegration, err := h.instances.UpsertIntegration(ctx, user.OrganizationID, current.ID, normalizedAdapter, trimmedExternalID, integrationMetadata, integrationWebURL, integrationLastError)
			if err != nil {
				return err
			}
			integration = *updatedIntegration
		}

		response = &integrationschema.InstanceIntegrationResource{
			CustomerExternalID: resolvedCustomerExternalID,
			DeploymentZoneID:   updatedInstance.DeploymentZoneID,
			WebURL:             integration.WebURL,
			Description:        updatedInstance.Description,
			EndLicenseDate:     updatedInstance.EndLicenseDate,
			Error:              integration.LastError,
			LicenseID:          updatedInstance.LicenseID,
			Metadata:           updatedInstance.Metadata,
			Name:               updatedInstance.Name,
			Slug:               updatedInstance.Slug,
			StartLicenseDate:   updatedInstance.StartLicenseDate,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	if resourceChanged {
		h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.InstanceUpdatedEntitlementSlug)
	}

	return response, nil
}

func resolveSlug(name string, requested *string, errorCode string) (string, error) {
	if requested != nil {
		trimmed := strings.TrimSpace(*requested)
		if !slugutil.Validate(trimmed) {
			return "", kaitenerrors.Validation(errorCode, fmt.Sprintf("Slug %q is invalid: must match ^[a-z0-9][a-z0-9-]*[a-z0-9]$ and be 2–100 characters", trimmed))
		}
		return trimmed, nil
	}
	return slugutil.GenerateUnique(name)
}

func requiredTrimmedString(value *string, code, message string) (string, error) {
	if value == nil {
		return "", kaitenerrors.Validation(code, message)
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return "", kaitenerrors.Validation(code, message)
	}
	return trimmed, nil
}

func requiredUUID(value *uuid.UUID, code, message string) (uuid.UUID, error) {
	if value == nil {
		return uuid.Nil, kaitenerrors.Validation(code, message)
	}
	return *value, nil
}

func requiredTime(value *time.Time, code, message string) (time.Time, error) {
	if value == nil || value.IsZero() {
		return time.Time{}, kaitenerrors.Validation(code, message)
	}
	return *value, nil
}

// normalizeOptionalField collapses "absent", "empty" and "whitespace only" to
// a single nil, so a stored optional string is either meaningful or unset and
// never a blank that reads as present. For a patchable field -- Integration's
// LastError is the one that matters -- that also means sending "" is how a
// caller clears it.
func normalizeOptionalField(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func normalizeJSONObject(value map[string]any) map[string]any {
	return instanceschema.NormalizeJSONObject(value)
}
