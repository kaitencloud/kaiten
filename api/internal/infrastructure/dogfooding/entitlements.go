package dogfooding

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"
	sdk "github.com/kaitencloud/sdk-go"
)

// Entitled reports whether an organization's licence in the Kaiten installation
// this one reports to grants entitlementSlug.
func (r *client) Entitled(ctx context.Context, orgID uuid.UUID, entitlementSlug string) (bool, error) {
	if strings.TrimSpace(entitlementSlug) == "" {
		return true, nil
	}

	// The platform organization is entitled to everything, unless this is the
	// deployment it is an instance of: there its licence answers like anyone's.
	if r.isSelf(orgID) && !r.checkSelfEntitlements {
		return true, nil
	}

	readCtx, cancel := context.WithTimeout(ctx, usageReportTimeout)
	defer cancel()

	usage, err := r.sdkClient.Instances.GetEntitlementUsageMetric(readCtx, orgID.String(), entitlementSlug)
	if err != nil {
		var apiErr *sdk.Error
		if errors.As(err, &apiErr) && apiErr.StatusCode == http.StatusNotFound {
			return false, nil
		}
		return false, fmt.Errorf("read %q entitlement: %w", entitlementSlug, err)
	}

	// A non-BOOLEAN entitlement under a slug a connector named is a catalogue
	// mistake, and it is refused rather than coerced: reading a numeric quota as a
	// yes/no would answer confidently with something nobody configured.
	value, err := usage.Value.AsBooleanEntitlementValue()
	if err != nil {
		return false, fmt.Errorf("entitlement %q is not a BOOLEAN entitlement: %w", entitlementSlug, err)
	}

	return value.Value, nil
}

// Entitled asks the lazily-loaded client, without waiting for one.
//
// A reporter that has no client yet cannot answer, and says so rather than defaulting.
// The credential arrives from a file the platform writes after this process starts, so
// "not ready" is an ordinary early-life state -- and the difference between it and "not
// entitled" is exactly the difference the callers fail closed on. It fails at once
// rather than holding the request until the credential shows up: the answer a caller
// gives on it is "retry", and a request parked until the gateway gives up says the
// same thing a minute later.
func (r *Reporter) Entitled(ctx context.Context, orgID uuid.UUID, entitlementSlug string) (bool, error) {
	client, err := r.clientNow(ctx)
	if err != nil {
		return false, err
	}

	return client.Entitled(ctx, orgID, entitlementSlug)
}

// errNotReady is what a synchronous call -- Entitled, ReportAndEnforce, Decrement --
// answers before the service token has been loaded.
var errNotReady = errors.New("dogfooding service token not loaded yet")
