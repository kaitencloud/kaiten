package usage

import (
	"errors"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
)

// Gauge is everything the wire shape of one entitlement's usage is made of.
// Counter and Window are only read for a NUMBER-family entitlement.
type Gauge struct {
	EntitlementID   uuid.UUID
	EntitlementSlug string
	LicenseID       uuid.UUID
	LicenseSlug     string
	NumberFamily    bool
	// LicenseValue is the grant as stored: the cap the counter is measured
	// against for the NUMBER family, the value itself for BOOLEAN and CONFIG.
	LicenseValue []byte
	Counter      Counter
	Window       Window
}

// ErrMissingLicenseValue is returned by Present for a BOOLEAN or CONFIG
// entitlement whose grant carries no value: it has no usage of its own, so
// there would be nothing to answer with.
var ErrMissingLicenseValue = errors.New("license entitlement carries no value")

// Present is the one presenter of an entitlement's usage: the report's
// answer and both gauges go through it, so the three cannot drift apart.
func Present(g Gauge) (*schema.EntitlementUsage, error) {
	limit, err := schema.ParseEntitlementValue(g.LicenseValue)
	if err != nil {
		return nil, err
	}

	out := &schema.EntitlementUsage{
		EntitlementID:   g.EntitlementID,
		EntitlementSlug: g.EntitlementSlug,
		LicenseID:       g.LicenseID,
		LicenseSlug:     g.LicenseSlug,
		Limit:           limit,
	}
	if !g.NumberFamily {
		if limit == nil {
			return nil, ErrMissingLicenseValue
		}
		out.Value = *limit
		return out, nil
	}

	out.Value = schema.EntitlementValue{Number: &schema.NumberEntitlementValue{
		Type:       "number",
		Value:      g.Counter.Value,
		EventCount: g.Counter.EventCount,
	}}
	out.CurrentPeriodStart = g.Window.Start
	out.CurrentPeriodEnd = g.Window.End
	return out, nil
}
