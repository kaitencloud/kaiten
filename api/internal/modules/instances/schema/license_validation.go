package schema

import (
	"time"

	"github.com/google/uuid"
)

// LicenseTermStatus describes the assigned instance's license term, not whether
// its catalog version is on sale or the instance is operationally healthy.
type LicenseTermStatus string

const (
	LicenseTermActive     LicenseTermStatus = "ACTIVE"
	LicenseTermNotStarted LicenseTermStatus = "NOT_STARTED"
	LicenseTermExpired    LicenseTermStatus = "EXPIRED"
)

// LicenseValidation is a point-in-time decision. Consumers must revalidate before
// protected actions; a previously valid response is not an authorization token.
// The term is start-inclusive and end-exclusive. Draft and archived catalog
// versions retain their existing assignment semantics and do not change this
// decision, nor do operational status or the free-form commercial lifecycle stage.
type LicenseValidation struct {
	Valid            bool              `json:"valid" doc:"Whether the assigned license term contains evaluatedAt"`
	Status           LicenseTermStatus `json:"status" enum:"ACTIVE,NOT_STARTED,EXPIRED" doc:"Assigned license term status"`
	EvaluatedAt      time.Time         `json:"evaluatedAt" doc:"UTC database time at which the term was evaluated"`
	InstanceSlug     string            `json:"instanceSlug" doc:"Instance whose assigned license was evaluated"`
	LicenseID        uuid.UUID         `json:"licenseId" doc:"Identifier of the assigned license version"`
	LicenseSlug      string            `json:"licenseSlug" doc:"Slug of the assigned license version"`
	StartLicenseDate time.Time         `json:"startLicenseDate" doc:"UTC inclusive start of the assigned license term"`
	EndLicenseDate   time.Time         `json:"endLicenseDate" doc:"UTC exclusive end of the assigned license term"`
}
