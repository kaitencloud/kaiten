package schema

import "time"

// LicenseTermStatus describes the assigned instance's license interval, not
// catalog publication, operational health or permission to retrieve the resource.
type LicenseTermStatus string

const (
	LicenseTermActive     LicenseTermStatus = "ACTIVE"
	LicenseTermNotStarted LicenseTermStatus = "NOT_STARTED"
	LicenseTermExpired    LicenseTermStatus = "EXPIRED"
)

// LicenseTerm is current resource data on GET instance details. The associated
// license and start-inclusive, end-exclusive dates remain on Instance. This is
// not a durable authorization token or an expiry-enforcement policy.
type LicenseTerm struct {
	Status      LicenseTermStatus `json:"status" enum:"ACTIVE,NOT_STARTED,EXPIRED" doc:"State of the assigned license interval at evaluatedAt"`
	EvaluatedAt time.Time         `json:"evaluatedAt" doc:"UTC database instant used to determine the current term state"`
}
