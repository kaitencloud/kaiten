package attio

import (
	"context"
	"strings"

	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	deploymentzoneschema "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// The other modules' use cases, each narrowed to the one method this connector calls.
//
// Naming the owning module's own Command/schema types is what lets *getcustomer.UseCase
// and friends satisfy these structurally without either package importing the other --
// Go needs exact type identity in an interface method signature, so a port that wanted
// to avoid the schema import would have to be adapted by hand at every call site
// instead. This is the shape integrations/upsertintegration/ports.go settled on.
type (
	customerGetter interface {
		Execute(ctx context.Context, slug string) (*customerschema.Customer, error)
	}
	licenseGetter interface {
		Execute(ctx context.Context, slug string) (*licenseschema.License, error)
	}
	zoneGetter interface {
		Execute(ctx context.Context, slug string) (*deploymentzoneschema.DeploymentZone, error)
	}
	customerLinkGetter interface {
		Execute(ctx context.Context, customerSlug, integrationName string) (*customerschema.CustomerIntegration, error)
	}
	customerLinkCreator interface {
		Execute(ctx context.Context, customerSlug, integrationName string,
			body customerschema.CustomerIntegration) (*customerschema.CustomerIntegration, error)
	}
	customerLinkUpdater interface {
		Execute(ctx context.Context, customerSlug, integrationName string,
			body customerschema.CustomerIntegration) (*customerschema.CustomerIntegration, error)
	}
	instanceLinkGetter interface {
		Execute(ctx context.Context, instanceSlug, integrationName string) (*instanceschema.InstanceIntegration, error)
	}
	instanceLinkCreator interface {
		Execute(ctx context.Context, instanceSlug, integrationName string,
			body instanceschema.InstanceIntegration) (*instanceschema.InstanceIntegration, error)
	}
	instanceLinkUpdater interface {
		Execute(ctx context.Context, instanceSlug, integrationName string,
			body instanceschema.InstanceIntegration) (*instanceschema.InstanceIntegration, error)
	}
)

// StoreDeps is the set of use cases the store is built from.
type StoreDeps struct {
	Customer           customerGetter
	License            licenseGetter
	DeploymentZone     zoneGetter
	CustomerLink       customerLinkGetter
	CreateCustomerLink customerLinkCreator
	UpdateCustomerLink customerLinkUpdater
	InstanceLink       instanceLinkGetter
	CreateInstanceLink instanceLinkCreator
	UpdateInstanceLink instanceLinkUpdater
}

// Store is KaitenStore over the owning modules' use cases.
//
// It holds no queries and no pool: every read and write goes through the use case that
// owns the table, so the entitlement tracking, the slug resolution and the integration
// URL validation those use cases do all still happen for a write this connector makes.
// Reaching the repositories directly would skip all three, and reaching them over HTTP
// -- which is what this connector did as a separate service -- needed a credential
// nobody could scope properly.
//
// Every method carries the organization implicitly: the use cases read it from
// currentuser, which under a CDC delivery is the system principal internal/kaiten bound
// from the event's own organization id. So an event for organization A cannot read or
// write organization B's records even though the store is a process-wide singleton.
type Store struct {
	deps StoreDeps
}

func NewStore(deps StoreDeps) *Store { return &Store{deps: deps} }

// Customer implements CustomerReader.
func (s *Store) Customer(ctx context.Context, slug string) (Customer, error) {
	customer, err := s.deps.Customer.Execute(ctx, slug)
	if err != nil {
		return Customer{}, translateRecord(err)
	}

	domain := ""
	if customer.Domain != nil {
		domain = *customer.Domain
	}

	return Customer{Name: customer.Name, Domain: domain}, nil
}

// License implements InstanceReader.
func (s *Store) License(ctx context.Context, slug string) (License, error) {
	license, err := s.deps.License.Execute(ctx, slug)
	if err != nil {
		return License{}, translateRecord(err)
	}

	return License{Name: license.Name, Type: string(license.Type)}, nil
}

// DeploymentZoneName implements InstanceReader.
func (s *Store) DeploymentZoneName(ctx context.Context, slug string) (string, error) {
	zone, err := s.deps.DeploymentZone.Execute(ctx, slug)
	if err != nil {
		return "", translateRecord(err)
	}

	return zone.Name, nil
}

// CustomerLink implements LinkStore.
func (s *Store) CustomerLink(ctx context.Context, slug string) (Link, error) {
	integration, err := s.deps.CustomerLink.Execute(ctx, slug, Name)
	if err != nil {
		return Link{}, translateLink(err)
	}

	return toLink(integration.ExternalID, integration.WebURL, integration.LastError), nil
}

// SetCustomerLink implements LinkStore.
//
// Update first, create on a missing link, update once more if the create lost a race:
// the two paths are the owning module's own operations and neither is an upsert, so the
// upsert has to be assembled here. Ordering update-before-create rather than the other
// way round is what makes the common case -- a link that already exists, being
// refreshed after every sync -- one call instead of two.
//
// The third step is skipped for one of the two conflicts a create can answer with. See
// isLinkTaken: retrying the update there cannot succeed and costs the real error
// message, which is the only thing that would tell anyone what happened.
func (s *Store) SetCustomerLink(ctx context.Context, slug string, link Link) error {
	external, webURL, lastError := link.ExternalID, optional(link.WebURL), optional(link.LastError)

	_, err := s.deps.UpdateCustomerLink.Execute(ctx, slug, Name,
		customerschema.CustomerIntegration{
			ExternalID: external, WebURL: webURL, LastError: lastError,
		})
	if err == nil {
		return nil
	}
	if !isLinkMissing(err) {
		return translateLink(err)
	}

	_, err = s.deps.CreateCustomerLink.Execute(ctx, slug, Name,
		customerschema.CustomerIntegration{
			ExternalID: external, WebURL: webURL, LastError: lastError,
		})
	if err == nil {
		return nil
	}
	if !kaitenerrors.IsConflict(err) || isLinkTaken(err) {
		return translateLink(err)
	}

	_, err = s.deps.UpdateCustomerLink.Execute(ctx, slug, Name,
		customerschema.CustomerIntegration{
			ExternalID: external, WebURL: webURL, LastError: lastError,
		})

	return translateLink(err)
}

// InstanceLink implements LinkStore.
func (s *Store) InstanceLink(ctx context.Context, slug string) (Link, error) {
	integration, err := s.deps.InstanceLink.Execute(ctx, slug, Name)
	if err != nil {
		return Link{}, translateLink(err)
	}

	return toLink(integration.ExternalID, integration.WebURL, integration.LastError), nil
}

// SetInstanceLink implements LinkStore, the same three steps and the same exception.
func (s *Store) SetInstanceLink(ctx context.Context, slug string, link Link) error {
	external, webURL, lastError := link.ExternalID, optional(link.WebURL), optional(link.LastError)

	_, err := s.deps.UpdateInstanceLink.Execute(ctx, slug, Name,
		instanceschema.InstanceIntegration{
			ExternalID: external, WebURL: webURL, LastError: lastError,
		})
	if err == nil {
		return nil
	}
	if !isLinkMissing(err) {
		return translateLink(err)
	}

	_, err = s.deps.CreateInstanceLink.Execute(ctx, slug, Name,
		instanceschema.InstanceIntegration{
			ExternalID: external, WebURL: webURL, LastError: lastError,
		})
	if err == nil {
		return nil
	}
	if !kaitenerrors.IsConflict(err) || isLinkTaken(err) {
		return translateLink(err)
	}

	_, err = s.deps.UpdateInstanceLink.Execute(ctx, slug, Name,
		instanceschema.InstanceIntegration{
			ExternalID: external, WebURL: webURL, LastError: lastError,
		})

	return translateLink(err)
}

func toLink(externalID string, webURL, lastError *string) Link {
	link := Link{ExternalID: externalID}
	if webURL != nil {
		link.WebURL = *webURL
	}
	if lastError != nil {
		link.LastError = *lastError
	}

	return link
}

// optional always returns a pointer, including to the empty string.
//
// These bodies are not patches: the integration store writes every field it is handed
// (integrations.Store.upsertIntegration), so an omitted field is a cleared field. That
// is exactly what the connector means -- a sync that recovered must clear the error the
// last one recorded, and a nil here would leave it on the record forever.
func optional(value string) *string {
	trimmed := strings.TrimSpace(value)

	return &trimmed
}

// translateRecord maps "the Kaiten record is gone" onto the connector's own error.
//
// By kind rather than by code: every one of these reads has exactly one not-found
// answer -- the record it named -- so the kind carries all the information the code
// would, and matching on codes would tie this adapter to four error-code spellings in
// four other modules.
func translateRecord(err error) error {
	if kaitenerrors.IsNotFound(err) {
		return ErrRecordNotFound
	}

	return err
}

// translateLink tells the two not-found answers of an integration read apart.
//
// Here the kind is not enough: a missing customer and a missing link both answer 404,
// and the connector branches differently on them -- a missing record is terminal, a
// missing link is the ordinary state of anything not yet synced. The owning module
// distinguishes them in the code (".CustomerNotFound" / ".InstanceNotFound" against a
// bare ".NotFound"), so that is what this reads.
func translateLink(err error) error {
	if err == nil {
		return nil
	}
	if !kaitenerrors.IsNotFound(err) {
		return err
	}
	if isRecordMissing(err) {
		return ErrRecordNotFound
	}

	return ErrLinkNotFound
}

func isRecordMissing(err error) bool {
	code := kaitenerrors.GetCode(err)

	return strings.HasSuffix(code, ".CustomerNotFound") || strings.HasSuffix(code, ".InstanceNotFound")
}

func isLinkMissing(err error) bool {
	return kaitenerrors.IsNotFound(err) && !isRecordMissing(err)
}

// isLinkTaken is the conflict that some OTHER record already owns this external id.
//
// The constraint is (organization_id, adapter, external_id) --
// customer_integrations_external_unique and its instance twin -- so one Attio record
// maps to one Kaiten record. Two Kaiten customers resolving to the same Attio company
// is how that gets violated, and it is not exotic: Attio dedups companies by domain,
// so two customers sharing a domain resolve to one company.
//
// It has to be told apart from the ordinary lost create race, because the two need
// opposite handling and only one of them leaves a transaction anything can still be
// done in:
//
//   - ".AlreadyExists" is the race. The owning module catches it on a READ, before it
//     writes anything, so the surrounding transaction is untouched and retrying the
//     update reaches the state this was aiming at.
//   - ".ExternalIDConflict" is this one, and by the time it arrives the INSERT has
//     already raised 23505 -- which ABORTS the surrounding transaction, so every later
//     statement in it answers 25P02 regardless of what it asks. Retrying the update
//     there does not merely fail: it replaces "external_id %q is already used" with
//     "current transaction is aborted, commands ignored until end of transaction
//     block", and that is the line an operator would have to work backwards from.
//
// Suffix-matched on the code for the same reason isRecordMissing is: the owning module
// spells it operation+".ExternalIDConflict", so the prefix is the caller's own
// operation name and only the suffix is the fact being read.
func isLinkTaken(err error) bool {
	return strings.HasSuffix(kaitenerrors.GetCode(err), ".ExternalIDConflict")
}
