package kaiten

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/archivelicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/associateentitlementwithlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicenseprice"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/deletelicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/deletelicenseentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/deprecatelicenseprice"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicenseentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicenseentitlements"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicensefamily"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicenseprice"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicenses"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/listlicensefamilies"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/listlicenseprices"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/previewlicenseinvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/publishlicense"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/unarchivelicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/updatelicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/updatelicenseentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/updatelicensefamily"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/updatelicenseprice"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// Licenses is the licenses module's twenty-one operations: ten on the license and
// its family, five on the grants it carries, five on its prices, and the preview of
// what those prices would invoice.
//
// A license entitlement is a grant -- this license gives this entitlement, with this
// value -- so the five that manage one keep Entitlement in the name, the way
// Customers keeps Integration. Its create is AssociateEntitlement rather than
// CreateEntitlement, because the entitlement already exists and what the call makes
// is the link; naming it Create would suggest the operation could bring an
// entitlement into being, which it cannot.
//
// A price is the version's own, so its five keep Price in the name the same way.
// It has no delete: a price that may have billed is deprecated, never removed.
//
// See Customers for the naming and argument-order convention.
type Licenses struct {
	uc *licenses.UseCases
}

// Licenses returns the licenses surface.
func (k *Kaiten) Licenses() Licenses {
	return Licenses{uc: k.modules.Licenses}
}

func (l Licenses) Create(
	ctx context.Context, cl caller.OrganizationCaller, cmd *createlicense.Command,
) (*licenseschema.License, error) {
	if err := cl.Require(createlicense.RequiredScope); err != nil {
		return nil, err
	}

	return l.uc.CreateLicense.Execute(bindOrganization(ctx, cl), cmd)
}

func (l Licenses) List(
	ctx context.Context, cl caller.OrganizationCaller, limit int32, cursor *string,
) (pagination.Page[*licenseschema.License], error) {
	if err := cl.Require(getlicenses.RequiredScope); err != nil {
		return pagination.Page[*licenseschema.License]{}, err
	}

	return l.uc.GetLicenses.Execute(bindOrganization(ctx, cl), limit, cursor)
}

func (l Licenses) Get(
	ctx context.Context, cl caller.OrganizationCaller, slug string,
) (*licenseschema.License, error) {
	if err := cl.Require(getlicense.RequiredScope); err != nil {
		return nil, err
	}

	return l.uc.GetLicense.Execute(bindOrganization(ctx, cl), slug)
}

// ListFamilies lists the products, where List lists their versions.
func (l Licenses) ListFamilies(
	ctx context.Context, cl caller.OrganizationCaller, limit int32, cursor *string,
) (pagination.Page[*licenseschema.LicenseFamilyView], error) {
	if err := cl.Require(listlicensefamilies.RequiredScope); err != nil {
		return pagination.Page[*licenseschema.LicenseFamilyView]{}, err
	}

	return l.uc.ListLicenseFamilies.Execute(bindOrganization(ctx, cl), limit, cursor)
}

// GetFamily resolves a product to the version it currently serves, where Get
// fetches one named version.
func (l Licenses) GetFamily(
	ctx context.Context, cl caller.OrganizationCaller, familySlug string, query *getlicensefamily.Query,
) (*licenseschema.LicenseFamilyView, error) {
	if err := cl.Require(getlicensefamily.RequiredScope); err != nil {
		return nil, err
	}

	return l.uc.GetLicenseFamily.Execute(bindOrganization(ctx, cl), familySlug, query)
}

func (l Licenses) Update(
	ctx context.Context, cl caller.OrganizationCaller, slug string, cmd *updatelicense.Command,
) error {
	if err := cl.Require(updatelicense.RequiredScope); err != nil {
		return err
	}

	return l.uc.UpdateLicense.Execute(bindOrganization(ctx, cl), cmd, slug)
}

// Publish puts a draft version on sale. Publish, Archive and Unarchive are the
// only way a version's lifecycle state changes after it is created; Update
// accepts the stored state and refuses any other.
func (l Licenses) Publish(
	ctx context.Context, cl caller.OrganizationCaller, slug string,
) (*licenseschema.License, error) {
	if err := cl.Require(publishlicense.RequiredScope); err != nil {
		return nil, err
	}

	return l.uc.PublishLicense.Execute(bindOrganization(ctx, cl), slug)
}

// Archive withdraws a published version from sale.
func (l Licenses) Archive(
	ctx context.Context, cl caller.OrganizationCaller, slug string,
) (*licenseschema.License, error) {
	if err := cl.Require(archivelicense.RequiredScope); err != nil {
		return nil, err
	}

	return l.uc.ArchiveLicense.Execute(bindOrganization(ctx, cl), slug)
}

// Unarchive puts an archived version back on sale.
func (l Licenses) Unarchive(
	ctx context.Context, cl caller.OrganizationCaller, slug string,
) (*licenseschema.License, error) {
	if err := cl.Require(unarchivelicense.RequiredScope); err != nil {
		return nil, err
	}

	return l.uc.UnarchiveLicense.Execute(bindOrganization(ctx, cl), slug)
}

func (l Licenses) Delete(ctx context.Context, cl caller.OrganizationCaller, slug string) error {
	if err := cl.Require(deletelicense.RequiredScope); err != nil {
		return err
	}

	return l.uc.DeleteLicense.Execute(bindOrganization(ctx, cl), slug)
}

// AssociateEntitlement grants an existing entitlement through a license. It is the
// create of the five grant operations; see the type doc for why it is not called
// CreateEntitlement.
func (l Licenses) AssociateEntitlement(
	ctx context.Context, cl caller.OrganizationCaller,
	licenseSlug string, cmd *associateentitlementwithlicense.Command,
) error {
	if err := cl.Require(associateentitlementwithlicense.RequiredScope); err != nil {
		return err
	}

	return l.uc.AssociateEntitlementWithLicense.Execute(
		bindOrganization(ctx, cl), licenseSlug, cmd)
}

func (l Licenses) ListEntitlements(
	ctx context.Context, cl caller.OrganizationCaller,
	licenseSlug string, limit int32, cursor *string,
) (pagination.Page[licenseschema.LicenseEntitlement], error) {
	if err := cl.Require(getlicenseentitlements.RequiredScope); err != nil {
		return pagination.Page[licenseschema.LicenseEntitlement]{}, err
	}

	return l.uc.GetLicenseEntitlements.Execute(
		bindOrganization(ctx, cl), licenseSlug, limit, cursor)
}

func (l Licenses) GetEntitlement(
	ctx context.Context, cl caller.OrganizationCaller, licenseSlug, entitlementSlug string,
) (*licenseschema.LicenseEntitlement, error) {
	if err := cl.Require(getlicenseentitlement.RequiredScope); err != nil {
		return nil, err
	}

	return l.uc.GetLicenseEntitlement.Execute(
		bindOrganization(ctx, cl), licenseSlug, entitlementSlug)
}

func (l Licenses) UpdateEntitlement(
	ctx context.Context, cl caller.OrganizationCaller,
	licenseSlug, entitlementSlug string, cmd *updatelicenseentitlement.Command,
) error {
	if err := cl.Require(updatelicenseentitlement.RequiredScope); err != nil {
		return err
	}

	return l.uc.UpdateLicenseEntitlement.Execute(
		bindOrganization(ctx, cl), licenseSlug, entitlementSlug, cmd)
}

func (l Licenses) DeleteEntitlement(
	ctx context.Context, cl caller.OrganizationCaller, licenseSlug, entitlementSlug string,
) error {
	if err := cl.Require(deletelicenseentitlement.RequiredScope); err != nil {
		return err
	}

	return l.uc.DeleteLicenseEntitlement.Execute(
		bindOrganization(ctx, cl), licenseSlug, entitlementSlug)
}

func (l Licenses) ListPrices(
	ctx context.Context, cl caller.OrganizationCaller, licenseSlug, status, billingModel string,
) ([]prices.Price, error) {
	if err := cl.Require(listlicenseprices.RequiredScope); err != nil {
		return nil, err
	}

	return l.uc.ListLicensePrices.Execute(bindOrganization(ctx, cl), licenseSlug, status, billingModel)
}

func (l Licenses) GetPrice(
	ctx context.Context, cl caller.OrganizationCaller, licenseSlug string, priceID uuid.UUID,
) (*prices.Price, error) {
	if err := cl.Require(getlicenseprice.RequiredScope); err != nil {
		return nil, err
	}

	return l.uc.GetLicensePrice.Execute(bindOrganization(ctx, cl), licenseSlug, priceID)
}

func (l Licenses) CreatePrice(
	ctx context.Context, cl caller.OrganizationCaller, licenseSlug string, draft prices.Draft,
) (*prices.Price, error) {
	if err := cl.Require(createlicenseprice.RequiredScope); err != nil {
		return nil, err
	}

	return l.uc.CreateLicensePrice.Execute(bindOrganization(ctx, cl), licenseSlug, draft)
}

func (l Licenses) UpdatePrice(
	ctx context.Context, cl caller.OrganizationCaller,
	licenseSlug string, priceID uuid.UUID, patch updatelicenseprice.Patch,
) (*prices.Price, error) {
	if err := cl.Require(updatelicenseprice.RequiredScope); err != nil {
		return nil, err
	}

	return l.uc.UpdateLicensePrice.Execute(bindOrganization(ctx, cl), licenseSlug, priceID, patch)
}

// DeprecatePrice is the one change a published price takes.
func (l Licenses) DeprecatePrice(
	ctx context.Context, cl caller.OrganizationCaller, licenseSlug string, priceID uuid.UUID,
) (*prices.Price, error) {
	if err := cl.Require(deprecatelicenseprice.RequiredScope); err != nil {
		return nil, err
	}

	return l.uc.DeprecateLicensePrice.Execute(bindOrganization(ctx, cl), licenseSlug, priceID)
}

// PreviewInvoice composes, without writing, what the version's prices would
// invoice.
func (l Licenses) PreviewInvoice(
	ctx context.Context, cl caller.OrganizationCaller, licenseSlug string, scenario previewlicenseinvoice.Scenario,
) (*rating.InvoicePreview, error) {
	if err := cl.Require(previewlicenseinvoice.RequiredScope); err != nil {
		return nil, err
	}

	return l.uc.PreviewLicenseInvoice.Execute(bindOrganization(ctx, cl), licenseSlug, scenario)
}

// UpdateFamily lists a family in the public catalogue, or takes it out.
func (l Licenses) UpdateFamily(
	ctx context.Context, cl caller.OrganizationCaller, familySlug string, isPublic bool,
) (*licenseschema.LicenseFamilyView, error) {
	if err := cl.Require(updatelicensefamily.RequiredScope); err != nil {
		return nil, err
	}

	return l.uc.UpdateLicenseFamily.Execute(bindOrganization(ctx, cl), familySlug, isPublic)
}
