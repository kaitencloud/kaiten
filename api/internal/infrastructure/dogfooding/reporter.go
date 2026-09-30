package dogfooding

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/kaitencloud/sdk-go"
	ofrep "github.com/open-feature/go-sdk-contrib/providers/ofrep"
	ofsdk "github.com/open-feature/go-sdk/openfeature"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

	"github.com/kaitencloud/kaiten/api/pkg/dogfoodingctx"
)

const (
	openFeatureDomain  = "dogfooding"
	IsKaitenFlagKey    = "is-kaiten"
	evaluationTimeout  = 5 * time.Second
	usageReportTimeout = 10 * time.Second
)

// ErrThresholdExceeded signals that the entitlement usage limit has been reached.
var ErrThresholdExceeded = errors.New("entitlement threshold exceeded")

type Config struct {
	APIURL string

	// OrgID is the reporting deployment's OWN organization in the Kaiten it
	// reports to, and its only job is to be skipped: usage is never metered
	// against the vendor's own tenant. Empty means "skip nothing", which is the
	// correct answer for every deployment except the one metering itself.
	OrgID string
}

// parseOrgID resolves Config.OrgID, treating empty as uuid.Nil.
//
// uuid.Nil is not a sentinel invented here: no organization row can hold it (the
// id is derived through UUIDv5, whose output is never nil), so it cannot collide
// with a tenant and no real caller is ever skipped by it.
func parseOrgID(raw string) (uuid.UUID, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return uuid.Nil, nil
	}
	parsed, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, fmt.Errorf("parse dogfooding org id: %w", err)
	}
	if parsed == uuid.Nil {
		// Explicitly spelling the nil uuid is refused while omitting it is not,
		// because the two are different intents: one is "skip nothing", the
		// other is somebody having written down an id they believed was real.
		return uuid.Nil, fmt.Errorf("dogfooding org id must not be the nil uuid; omit it to skip nothing")
	}
	return parsed, nil
}

type client struct {
	sdkClient   *sdk.Client
	ofClient    *ofsdk.Client
	kaitenOrgID uuid.UUID
}

func validateConfig(cfg Config) error {
	if strings.TrimSpace(cfg.APIURL) == "" {
		return fmt.Errorf("dogfooding api url is required")
	}

	if _, err := parseOrgID(cfg.OrgID); err != nil {
		return err
	}

	_, err := normalizeAPIURL(cfg.APIURL)
	return err
}

func newClient(cfg Config, serviceToken string) (*client, error) {
	if err := validateConfig(cfg); err != nil {
		return nil, err
	}
	if strings.TrimSpace(serviceToken) == "" {
		return nil, fmt.Errorf("dogfooding service token is required")
	}

	kaitenOrgID, err := parseOrgID(cfg.OrgID)
	if err != nil {
		return nil, err
	}
	apiURL, err := normalizeAPIURL(cfg.APIURL)
	if err != nil {
		return nil, err
	}

	// One instrumented client for both the SDK and OFREP: these are the only
	// synchronous calls the API makes to another service on a request path,
	// so without a client span a request blocked on the platform API shows
	// up as an unexplained gap in the trace.
	httpClient := &http.Client{
		Timeout:   usageReportTimeout,
		Transport: otelhttp.NewTransport(http.DefaultTransport),
	}

	sdkClient, err := sdk.NewClient(
		apiURL,
		sdk.WithHTTPClient(httpClient),
		sdk.WithBearerToken(serviceToken),
	)
	if err != nil {
		return nil, fmt.Errorf("init dogfooding SDK client: %w", err)
	}

	provider := ofrep.NewProvider(
		apiURL,
		ofrep.WithClient(httpClient),
		ofrep.WithBearerToken(serviceToken),
	)
	if err := ofsdk.SetNamedProviderAndWait(openFeatureDomain, provider); err != nil {
		return nil, fmt.Errorf("init dogfooding OFREP provider: %w", err)
	}

	return &client{
		sdkClient:   sdkClient,
		ofClient:    ofsdk.NewClient(openFeatureDomain),
		kaitenOrgID: kaitenOrgID,
	}, nil
}

// Decrement synchronously reports a -1 usage delta. Skips if the org is the Kaiten org.
// No threshold enforcement is applied — a decrement can never exceed a limit.
func (r *client) Decrement(ctx context.Context, orgID uuid.UUID, entitlementSlug string) error {
	if strings.TrimSpace(entitlementSlug) == "" {
		return nil
	}

	if r.isSelf(orgID) {
		return nil
	}

	reportCtx, cancel := context.WithTimeout(ctx, usageReportTimeout)
	defer cancel()

	if err := r.sdkClient.Instances.ReportUsage(reportCtx, orgID.String(), entitlementSlug, -1); err != nil {
		return fmt.Errorf("decrement %q usage: %w", entitlementSlug, err)
	}

	return nil
}

// ReportAndEnforce synchronously reports usage and enforces the configured threshold.
// Returns ErrThresholdExceeded if the entitlement limit is reached.
// Returns a non-nil, non-ErrThresholdExceeded error for transient failures.
func (r *client) ReportAndEnforce(ctx context.Context, orgID uuid.UUID, entitlementSlug string) error {
	if strings.TrimSpace(entitlementSlug) == "" {
		return nil
	}

	evalCtx, evalCancel := context.WithTimeout(ctx, evaluationTimeout)
	defer evalCancel()

	isKaiten, err := r.ofClient.BooleanValue(evalCtx, IsKaitenFlagKey, false, newInternalEvaluationContext(orgID))
	if err != nil {
		if r.isSelf(orgID) {
			return nil
		}

		slog.Warn(
			"dogfooding flag evaluation failed, using org fallback",
			"organization_id", orgID,
			"entitlement_slug", entitlementSlug,
			"error", err,
		)
	} else if isKaiten {
		return nil
	}

	reportCtx, reportCancel := context.WithTimeout(ctx, usageReportTimeout)
	defer reportCancel()

	if err := r.sdkClient.Instances.ReportUsage(reportCtx, orgID.String(), entitlementSlug, 1); err != nil {
		if errors.Is(err, sdk.ErrThresholdExceeded) {
			return fmt.Errorf("enforce %q limit: %w", entitlementSlug, ErrThresholdExceeded)
		}
		return fmt.Errorf("report %q usage: %w", entitlementSlug, err)
	}

	return nil
}

// isSelf reports whether orgID is the reporting deployment's own organization,
// which is exempt from its own meters.
//
// False whenever none is configured. Guarding on uuid.Nil rather than comparing
// directly is what keeps "no self to skip" from becoming "skip the caller whose
// id failed to resolve": a nil orgID reaching a metered path is a bug upstream,
// and treating it as the vendor's own tenant would hide that bug as a silent
// exemption instead of surfacing it as a rejected report.
func (r *client) isSelf(orgID uuid.UUID) bool {
	return r.kaitenOrgID != uuid.Nil && orgID == r.kaitenOrgID
}

func newInternalEvaluationContext(currentOrgID uuid.UUID) ofsdk.EvaluationContext {
	return ofsdk.NewEvaluationContext(currentOrgID.String(), dogfoodingctx.BuildContext(currentOrgID))
}

func normalizeAPIURL(raw string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "", fmt.Errorf("parse dogfooding api url: %w", err)
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("dogfooding api url must be absolute")
	}

	parsed.Path = strings.TrimSuffix(parsed.Path, "/")
	if !strings.HasSuffix(parsed.Path, "/api") {
		parsed.Path += "/api"
	}

	return parsed.String(), nil
}
