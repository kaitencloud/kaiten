package events

import "github.com/kaitencloud/kaiten/api/internal/infrastructure/events"

var (
	LicenseCreated               = events.New("LICENSE_CREATED", "com.kaiten.license.v1.created")
	LicenseUpdated               = events.New("LICENSE_UPDATED", "com.kaiten.license.v1.updated")
	LicenseDeleted               = events.New("LICENSE_DELETED", "com.kaiten.license.v1.deleted")
	LicensePublished             = events.New("LICENSE_PUBLISHED", "com.kaiten.license.v1.published")
	LicenseArchived              = events.New("LICENSE_ARCHIVED", "com.kaiten.license.v1.archived")
	LicenseUnarchived            = events.New("LICENSE_UNARCHIVED", "com.kaiten.license.v1.unarchived")
	LicenseEntitlementAssigned   = events.New("LICENSE_ENTITLEMENT_ASSIGNED", "com.kaiten.license.entitlement.v1.assigned")
	LicenseEntitlementUnassigned = events.New("LICENSE_ENTITLEMENT_UNASSIGNED", "com.kaiten.license.entitlement.v1.unassigned")
	LicenseEntitlementUpdated    = events.New("LICENSE_ENTITLEMENT_UPDATED", "com.kaiten.license.entitlement.v1.updated")

	LicensePriceCreated    = events.New("LICENSE_PRICE_CREATED", "com.kaiten.license.price.v1.created")
	LicensePriceUpdated    = events.New("LICENSE_PRICE_UPDATED", "com.kaiten.license.price.v1.updated")
	LicensePriceDeprecated = events.New("LICENSE_PRICE_DEPRECATED", "com.kaiten.license.price.v1.deprecated")

	// A license family is the product its versions belong to. It has
	// no write operation of its own -- its first version opens it, and its last
	// takes it away -- so these are recorded by the version writes that change
	// it, in the same transaction; see familyevents.
	LicenseFamilyCreated = events.New("LICENSE_FAMILY_CREATED", "com.kaiten.license_family.v1.created")
	LicenseFamilyUpdated = events.New("LICENSE_FAMILY_UPDATED", "com.kaiten.license_family.v1.updated")
	LicenseFamilyDeleted = events.New("LICENSE_FAMILY_DELETED", "com.kaiten.license_family.v1.deleted")
)
