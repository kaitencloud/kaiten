package createlicense

import (
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
)

// Command carries no version: update_license_version() assigns it on
// INSERT, and the row that comes back through RETURNING is the only place
// the value exists.
//
// FamilySlug and FamilyID are what decide between the two things this command
// can mean. Both absent, it is a new product: a family is created and this is
// its version 1. Either present, it is the next version of an existing
// product, and the family named is what the version number is drawn from --
// not the name, which since the license-family split is a display label two families are free
// to share. The two forms exist because callers hold different handles: an
// integrator addresses a product by the slug it published, while the console
// holds the familyId every license carries and nothing else, the way an
// instance names its license by licenseId. Sent together they must name the
// same family.
// LifecycleState is empty when the caller did not say, which the repository
// resolves to schema.Published -- a license created through this command is
// servable straight away, as it has always been. Set, it is DRAFT or
// PUBLISHED: Execute refuses ARCHIVED (CreateLicense.LifecycleStateNotSettable),
// which a version only reaches through archive-license.
type Command struct {
	Name           string                `json:"name"`
	Description    string                `json:"description"`
	Type           schema.Type           `json:"type"`
	VersionName    *string               `json:"versionName,omitempty"`
	IsDefault      bool                  `json:"isDefault"`
	Slug           *string               `json:"slug,omitempty"`
	FamilySlug     *string               `json:"familySlug,omitempty"`
	FamilyID       *uuid.UUID            `json:"familyId,omitempty"`
	LifecycleState schema.LifecycleState `json:"lifecycleState,omitempty"`
}

// opensFamily reports whether the command creates a new product, rather than
// the next version of one the organization already has.
func (c *Command) opensFamily() bool {
	return c.FamilySlug == nil && c.FamilyID == nil
}
