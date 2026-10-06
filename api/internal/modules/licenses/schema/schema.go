package schema

import (
	"fmt"
	"reflect"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	entitlementsschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	instancesschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

type Type string

const (
	Development Type = "DEVELOPMENT"
	Trial       Type = "TRIAL"
	Paid        Type = "PAID"
	Community   Type = "COMMUNITY"
)

func (e *Type) Scan(src interface{}) error {
	switch s := src.(type) {
	case []byte:
		*e = Type(strings.ToUpper(string(s)))
	case string:
		*e = Type(strings.ToUpper(s))
	default:
		return fmt.Errorf("unsupported scan type for LicenseType: %T", src)
	}
	return nil
}

// LifecycleState says whether a version of a license may be served.
//
// Several versions of one family can be Published at once -- a vendor may keep
// more than one purchasable -- so this is not "the current version" flag.
// Resolving a family to one version is a read-time rule on top of it (the
// family's default first, then its highest published version).
//
// Draft and Archived are both unservable and resolution treats them alike, but
// they are not the same fact: one has never been offered, the other has been
// withdrawn. That distinction is why this is a state and not a boolean.
// PricingType is how a licence version is sold: FREE and PAID are self-serve
// candidates, CUSTOM goes through a conversation ("Contact us").
type PricingType string

const (
	PricingTypeFree   PricingType = "FREE"
	PricingTypePaid   PricingType = "PAID"
	PricingTypeCustom PricingType = "CUSTOM"
)

type LifecycleState string

const (
	// Draft is a version being prepared. It is addressable by its own slug and
	// never resolved as a family's current version.
	Draft LifecycleState = "DRAFT"
	// Published is a version that may be served, and the only state a family's
	// default version is allowed to be in
	// (license_default_must_be_published_check).
	Published LifecycleState = "PUBLISHED"
	// Archived is a version withdrawn from sale. It stays addressable by its own
	// slug -- instances pinned to it keep working, and historical access is
	// deliberate -- but no family resolves to it. A version only gets here from
	// Published, through archive-license: create refuses it.
	Archived LifecycleState = "ARCHIVED"
)

// License is reused unmodified as the request body for create and update, and
// as the response for both plus get. ID/CreatedAt/UpdatedAt are readOnly.
//
// Version is readOnly too: update_license_version() numbers every new version
// of a family on INSERT and nothing changes it afterwards, because the derived
// slug ({familySlug}-v{n}) is built from it. huma skips readOnly fields on
// write rather than rejecting them, so both write paths check it rather than
// discard a sent value silently -- create refuses any value, update accepts
// only the stored one.
//
// FamilySlug is the mirror image: writeOnly, it names the family a new version
// joins on create and is absent from every response. A version never moves
// between families, so update refuses it outright. FamilyID identifies the
// family on the way out, and is accepted on create as the identifier form of
// FamilySlug, so it is optional rather than readOnly; update refuses any value
// but the row's own.
//
// Slug, FamilyID and LifecycleState are optional although every response
// carries them: one schema serves create, update and read, and OpenAPI can
// only make a field required on read alone by marking it readOnly -- which
// these are not, being writable somewhere. Version, which nothing writes, is
// readOnly and required.
type License struct {
	ID          uuid.UUID `json:"id" readOnly:"true" example:"123e4567-e89b-12d3-a456-426614174000" doc:"Unique identifier for the license"`
	Name        string    `json:"name" example:"Enterprise License" doc:"Display name of the license" minLength:"1" maxLength:"100"`
	Slug        string    `json:"slug,omitempty" example:"enterprise-license" doc:"Optional URL-friendly identifier, unique per organization. When omitted, a new version of an existing family takes {familySlug}-v{version}, and any other license gets one generated from its name. A license that opens a new family gives the family its slug." minLength:"2" maxLength:"100" pattern:"^[a-z0-9][a-z0-9-]*[a-z0-9]$"`
	Description string    `json:"description" example:"This license provides access to all enterprise features including advanced analytics, priority support, and unlimited users." doc:"Detailed description of the license capabilities and restrictions" maxLength:"500"`
	Type        Type      `json:"type" example:"paid" enum:"DEVELOPMENT,TRIAL,PAID,COMMUNITY" doc:"Type of the license determining its capabilities and restrictions"`
	Version     string    `json:"version" readOnly:"true" example:"1" doc:"Version of the license within its family, assigned by the server when the version is created and never changed afterwards: the version's derived slug ({familySlug}-v{version}, see slug) is built from it. A number is never reused within a family, even after its version is deleted. Create refuses any value (CreateLicense.VersionNotSettable); update accepts only the stored one, so a representation can be written back as it was read (UpdateLicense.VersionNotSettable)."`
	VersionName *string   `json:"versionName,omitempty" example:"Winter 2024 Release" doc:"Optional human-readable name for the license version. Defaults to \"Version - <version>\"." maxLength:"50"`
	IsDefault   bool      `json:"isDefault" example:"false" doc:"Whether this version is the one its family puts forward: at most one version per family, and only a PUBLISHED one (CreateLicense.DefaultMustBePublished, UpdateLicense.DefaultMustBePublished). Resolution hands it out ahead of the highest-numbered published version, so it keeps being served when a newer version is published. Setting it takes the flag from the family's previous default, which gets a LICENSE_UPDATED event of its own. On update, sending false unsets it; the default cannot be archived until another version takes its place or the flag is unset (ArchiveLicense.DefaultMustBePublished)."`
	FamilySlug  string    `json:"familySlug,omitempty" writeOnly:"true" example:"enterprise-license" doc:"Write-only on create: slug of the family this license is a new version of. familyId names the same family by identifier; sent together they must agree. Omit both to create a new family, of which this license becomes version 1. Never returned -- see familyId. Refused on update: a version cannot move between families." minLength:"2" maxLength:"100" pattern:"^[a-z0-9][a-z0-9-]*[a-z0-9]$"`
	FamilyID    uuid.UUID `json:"familyId,omitempty" example:"123e4567-e89b-12d3-a456-426614174000" doc:"Identifier of the license family this license is a version of. Stable across renames and new versions: two licenses sharing it are the same product. Always present in responses. On create, optional: names the family this license is a new version of, as familySlug does by slug; omit both to create a new family. On update, optional and must be the license's own family: a version cannot move between families (UpdateLicense.FamilyNotReassignable)."`

	LifecycleState LifecycleState `json:"lifecycleState,omitempty" example:"PUBLISHED" enum:"DRAFT,PUBLISHED,ARCHIVED" doc:"Whether this version may be served. Always present in responses. Optional on create, where it is DRAFT or PUBLISHED and PUBLISHED when omitted; ARCHIVED is refused (CreateLicense.LifecycleStateNotSettable), since a version is archived by withdrawing it from sale. After that it changes only through publish-license (DRAFT to PUBLISHED), archive-license (PUBLISHED to ARCHIVED) and unarchive-license (ARCHIVED to PUBLISHED); update accepts the stored state and refuses any other (UpdateLicense.LifecycleStateNotSettable). Only a PUBLISHED version can be the family's default. An ARCHIVED version cannot be assigned to an instance (CreateInstance.LicenseArchived, UpdateInstance.LicenseArchived); instances already on it keep it."`
	CreatedAt      time.Time      `json:"createdAt" readOnly:"true" example:"2023-10-01T12:00:00Z" doc:"Timestamp when this license was created"`
	UpdatedAt      time.Time      `json:"updatedAt" readOnly:"true" example:"2023-10-02T12:00:00Z" doc:"Timestamp when this license was last updated"`

	PricingType           PricingType `json:"pricingType,omitempty" example:"PAID" enum:"FREE,PAID,CUSTOM" doc:"How this version is sold. FREE and PAID can be bought self-serve; CUSTOM sends a buyer to selfServeCtaUrl or a conversation. Always present in responses. On create it defaults to CUSTOM; on update, omit it to keep the stored value."`
	TrialPeriodDays       *int32      `json:"trialPeriodDays,omitempty" example:"14" minimum:"0" doc:"Trial length, in days, a subscription to this version starts with by default. Absent when there is none. Must be at least 1 on create (CreateLicense.InvalidTrialPeriodDays). On update, omit it to keep the stored value, or send 0 to remove the trial."`
	RequiresPaymentMethod *bool       `json:"requiresPaymentMethod,omitempty" example:"false" doc:"Whether self-serve signup captures a payment method before activation. Always present in responses; false when omitted on create. On update, omit it to keep the stored value."`
	SelfServeCtaURL       *string     `json:"selfServeCtaUrl,omitempty" example:"https://example.com/contact-sales" maxLength:"2048" doc:"Where a buyer is sent when this version cannot be bought self-serve: an http(s) URL of at most 2048 characters (CreateLicense.InvalidSelfServeCtaUrl). Absent when there is none. On update, omit it to keep the stored value, or send an empty string to remove it."`
}

// LicenseFamily is the product a license is a version of, as the GraphQL
// License.family field returns it.
//
// It has no REST counterpart on purpose: a license's REST representation
// identifies its family by familyId, and the family's own slug is served where
// the family itself is rather than copied onto each of its versions.
// There is no name field because a family has no name -- the display name is
// whichever version is being shown.
type LicenseFamily struct {
	ID   uuid.UUID
	Slug string
}

// LicenseFamilyView is a family together with the version it currently
// resolves to -- the answer to "the current version of this product", which
// addressing a version slug cannot give.
//
// CurrentVersion is null when the family has no PUBLISHED version: every
// version is still a draft, or all of them have been archived. The family is
// still listed in that state, so a console can render it as draft-only rather
// than having it disappear; the single-family endpoint reports it as
// GetLicenseFamily.NoPublishedVersion instead.
//
// Versions is populated only by the family endpoint's ?include=versions, and is
// absent everywhere else. VersionCount, by contrast, is always there and counts
// every version whatever its state -- it describes the product's history, not
// how much of it is for sale.
//
// This is a different type from LicenseFamily, which the GraphQL License.family
// field returns: that one is identity alone (a license saying which product it
// belongs to), this one is a resolved view of the product.
type LicenseFamilyView struct {
	ID             uuid.UUID `json:"id" readOnly:"true" example:"123e4567-e89b-12d3-a456-426614174000" doc:"Unique identifier for the license family"`
	Slug           string    `json:"slug" example:"enterprise-license" doc:"URL-friendly identifier of the family, unique per organization and stable across renames and new versions. Deleting the family's last version deletes the family and frees the slug."`
	CurrentVersion *License  `json:"currentVersion,omitempty" doc:"The version this read is about. By default the version the family resolves to: its default version if it has one, otherwise its highest-numbered PUBLISHED version. Under ?version=N it is the version asked for instead, whatever its lifecycle state. Absent when the family has no PUBLISHED version, which only a list or an include=versions read returns."`
	VersionCount   int32     `json:"versionCount" example:"3" doc:"Number of versions in this family, whatever their lifecycle state"`
	Versions       []License `json:"versions,omitempty" nullable:"false" doc:"Every version of the family, oldest first. Only returned when explicitly requested with include=versions, and then never null: a family always has at least one version."`
	CreatedAt      time.Time `json:"createdAt" readOnly:"true" example:"2023-10-01T12:00:00Z" doc:"Timestamp when this family was created"`
	UpdatedAt      time.Time `json:"updatedAt" readOnly:"true" example:"2023-10-02T12:00:00Z" doc:"Timestamp when a version was last added to this family, or when the family was created. Renames, lifecycle moves and default changes update the versions' own updatedAt, not this one."`
}

// LicensePage is a cursor-paginated page of licenses, returned by the
// GraphQL licenses field -- the GraphQL counterpart of the REST
// getlicenses endpoint's pagination.Page[*License] envelope. It is a
// plain (non-generic) struct, rather than pagination.Page itself, because
// gqlgen's model binding (see gqlgen.yml) needs a concrete Go type to bind
// the LicensePage GraphQL type to.
type LicensePage struct {
	Items      []License
	NextCursor *string
	HasMore    bool
}

// LicenseEntitlementValue is a map[string]any that generates a polymorphic
// discriminated-union schema (number / boolean / object) in the OpenAPI spec
// while remaining fully usable as a regular map at runtime.
type LicenseEntitlementValue map[string]any

// Schema implements huma.SchemaProvider.
func (v LicenseEntitlementValue) Schema(r huma.Registry) *huma.Schema {
	r.Schema(reflect.TypeOf(instancesschema.NumberEntitlementValue{}), true, "NumberEntitlementValue")
	r.Schema(reflect.TypeOf(instancesschema.BooleanEntitlementValue{}), true, "BooleanEntitlementValue")
	r.Schema(reflect.TypeOf(instancesschema.ConfigEntitlementValue{}), true, "ConfigEntitlementValue")
	return &huma.Schema{
		OneOf: []*huma.Schema{
			{Ref: "#/components/schemas/NumberEntitlementValue"},
			{Ref: "#/components/schemas/BooleanEntitlementValue"},
			{Ref: "#/components/schemas/ConfigEntitlementValue"},
		},
		Discriminator: &huma.Discriminator{
			PropertyName: "type",
			Mapping: map[string]string{
				"number":  "#/components/schemas/NumberEntitlementValue",
				"boolean": "#/components/schemas/BooleanEntitlementValue",
				"object":  "#/components/schemas/ConfigEntitlementValue",
			},
		},
	}
}

// LicenseEntitlement is reused unmodified as the request body for both
// associate-entitlement-with-license and update-license-entitlement, as
// well as the response for both and any read of a license's entitlements.
// EntitlementName/EntitlementType/LicenseID/LicenseSlug/CreatedBy/CreatedAt/
// UpdatedBy/UpdatedAt/EntitlementGroups are readOnly:"true" -- all resolved
// by the server from the entitlement/license lookup, never client-supplied.
// EntitlementSlug is accepted on associate (it names which entitlement to
// grant) but not settable through update-license-entitlement, where both the
// license and the entitlement are already named in the path -- its handler
// rejects it being present and different from the path's entitlementSlug
// with a 422.
type LicenseEntitlement struct {
	EntitlementSlug string                  `json:"entitlementSlug,omitempty" format:"string" example:"premium-support" doc:"URL-friendly identifier for the entitlement"`
	EntitlementName string                  `json:"entitlementName" readOnly:"true" example:"Premium Support" doc:"Name of the entitlement feature or service"`
	EntitlementType string                  `json:"entitlementType,omitempty" readOnly:"true" enum:"BOOLEAN,NUMBER,CONFIG" example:"NUMBER" doc:"Type of entitlement (BOOLEAN, NUMBER, or CONFIG)"`
	LicenseID       uuid.UUID               `json:"licenseId" readOnly:"true" example:"a1b2c3d4-e5f6-7g8h-9i0j-k1l2m3n4o5p6" doc:"Unique identifier for the license this entitlement belongs to"`
	LicenseSlug     string                  `json:"licenseSlug" readOnly:"true" example:"enterprise-license" doc:"URL-friendly identifier for the license this entitlement belongs to"`
	CreatedBy       shared.User             `json:"createdBy" readOnly:"true" doc:"User who created this entitlement"`
	CreatedAt       time.Time               `json:"createdAt" readOnly:"true" example:"2023-10-01T12:00:00Z" doc:"Timestamp when this entitlement was created"`
	UpdatedBy       shared.User             `json:"updatedBy" readOnly:"true" doc:"User who last updated this entitlement"`
	UpdatedAt       time.Time               `json:"updatedAt" readOnly:"true" example:"2023-10-02T12:00:00Z" doc:"Timestamp when this entitlement was last updated"`
	Value           LicenseEntitlementValue `json:"value" doc:"Typed entitlement value. Supported shapes: {type:number,value:number}, {type:boolean,value:boolean}, {type:object,value:{...}}"`
	// LimitCapExceededOveragePercent derives this grant's enforcement from its
	// own Value, with no separate hard/soft/unlimited flag:
	//   - Value's numeric limit is the unlimited sentinel (-1): this is -1.
	//     There is no cap, so there is no overage to bound.
	//   - Otherwise: 0 means usage above the limit is rejected (hard limit);
	//     a positive percentage means usage may exceed the limit by that much
	//     before being rejected (soft limit).
	// Null when Value is not numeric (BOOLEAN/CONFIG entitlements have no
	// usage cap to enforce).
	LimitCapExceededOveragePercent *int32                                        `json:"limitCapExceededOveragePercent,omitempty" doc:"Derives this grant's enforcement from its own numeric value: -1 when the value is unlimited (no cap, no overage); otherwise 0 rejects usage above the value (hard limit) and a positive percentage allows usage to exceed it by that much before being rejected (soft limit). Null for non-numeric (BOOLEAN/CONFIG) grants." example:"10"`
	EntitlementGroups              []*entitlementsschema.EntitlementGroupSummary `json:"entitlementGroups,omitempty" readOnly:"true" doc:"Groups associated with this entitlement"`
}
