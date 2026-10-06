package updatelicense

import (
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
)

// LifecycleState is empty when the caller did not send one. Set, it has to be
// the stored state: a version moves through publish, archive and unarchive,
// and update accepts the state only as an echo
// (UpdateLicense.LifecycleStateNotSettable).
//
// Version is empty when the caller did not send one. Set, it has to be the
// stored version: the field is readOnly, and accepted only as an echo
// (UpdateLicense.VersionNotSettable).
//
// FamilyID is nil when the caller did not send one. Set, it is not a change
// request -- a version never moves between families -- but the value a client
// writing back what it read carries along; the repository refuses anything but
// the row's own family (UpdateLicense.FamilyNotReassignable).
type Command struct {
	Name           string                `json:"name"`
	Description    string                `json:"description"`
	Type           schema.Type           `json:"type"`
	Version        string                `json:"version"`
	VersionName    *string               `json:"versionName,omitempty"`
	IsDefault      bool                  `json:"isDefault"`
	FamilyID       *uuid.UUID            `json:"familyId,omitempty"`
	LifecycleState schema.LifecycleState `json:"lifecycleState,omitempty"`

	// The commercial fields are keep-if-absent: nil (or "" for PricingType)
	// leaves the stored value. TrialPeriodDays 0 and SelfServeCtaURL "" clear.
	PricingType           schema.PricingType `json:"pricingType,omitempty"`
	TrialPeriodDays       *int32             `json:"trialPeriodDays,omitempty"`
	RequiresPaymentMethod *bool              `json:"requiresPaymentMethod,omitempty"`
	SelfServeCtaURL       *string            `json:"selfServeCtaUrl,omitempty"`
}
