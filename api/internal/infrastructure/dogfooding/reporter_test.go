package dogfooding

import (
	"strings"
	"testing"

	"github.com/google/uuid"
)

// TestValidateConfig locks in the config-validation rules NewClient/NewReporter
// rely on before ever touching the network: a non-blank, absolute API URL is
// required, and an organization id is optional but must be real if given.
func TestValidateConfig(t *testing.T) {
	validOrgID := uuid.New().String()

	tests := []struct {
		name    string
		cfg     Config
		wantErr string // substring expected in the error, "" means no error
	}{
		{
			name: "valid config passes",
			cfg:  Config{APIURL: "https://api.example.com", OrgID: validOrgID},
		},
		{
			name:    "blank API URL is rejected",
			cfg:     Config{APIURL: "", OrgID: validOrgID},
			wantErr: "api url is required",
		},
		{
			name:    "whitespace-only API URL is rejected",
			cfg:     Config{APIURL: "   ", OrgID: validOrgID},
			wantErr: "api url is required",
		},
		{
			name:    "unparseable org id is rejected",
			cfg:     Config{APIURL: "https://api.example.com", OrgID: "not-a-uuid"},
			wantErr: "parse dogfooding org id",
		},
		{
			// The normal case for a standalone deployment: no organization of its
			// own among the tenants it meters, so nothing to skip.
			name: "omitted org id is accepted and means skip nothing",
			cfg:  Config{APIURL: "https://api.example.com", OrgID: ""},
		},
		{
			name: "whitespace-only org id is accepted, same as omitted",
			cfg:  Config{APIURL: "https://api.example.com", OrgID: "   "},
		},
		{
			// Omitting it says "skip nothing"; writing it out says "skip this
			// organization" about an id that designates none. The second is
			// somebody being wrong, and is worth a startup error rather than a
			// self-skip that silently never fires.
			name:    "the nil uuid written out is rejected even though it parses",
			cfg:     Config{APIURL: "https://api.example.com", OrgID: uuid.Nil.String()},
			wantErr: "must not be the nil uuid",
		},
		{
			name:    "API URL missing a scheme is rejected",
			cfg:     Config{APIURL: "api.example.com", OrgID: validOrgID},
			wantErr: "must be absolute",
		},
		{
			name:    "API URL that fails to parse is rejected",
			cfg:     Config{APIURL: "http://[::1", OrgID: validOrgID},
			wantErr: "parse dogfooding api url",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateConfig(tt.cfg)
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("validateConfig(%+v) unexpected error: %v", tt.cfg, err)
				}
				return
			}
			if err == nil {
				t.Fatalf("validateConfig(%+v) error = nil, want error containing %q", tt.cfg, tt.wantErr)
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("validateConfig(%+v) error = %q, want it to contain %q", tt.cfg, err.Error(), tt.wantErr)
			}
		})
	}
}

// TestNormalizeAPIURL locks in the URL-shaping rule the dogfooding SDK client
// depends on: every configured API URL, regardless of how the operator wrote
// it, ends up pointing at the "/api" base path exactly once, with no
// double slashes or missing segments.
func TestNormalizeAPIURL(t *testing.T) {
	tests := []struct {
		name    string
		raw     string
		want    string
		wantErr string
	}{
		{
			name: "bare host gets /api appended",
			raw:  "https://api.example.com",
			want: "https://api.example.com/api",
		},
		{
			name: "trailing slash is trimmed before appending /api",
			raw:  "https://api.example.com/",
			want: "https://api.example.com/api",
		},
		{
			name: "already-suffixed /api is left untouched",
			raw:  "https://api.example.com/api",
			want: "https://api.example.com/api",
		},
		{
			name: "already-suffixed /api with trailing slash still normalizes to exactly one /api",
			raw:  "https://api.example.com/api/",
			want: "https://api.example.com/api",
		},
		{
			name: "other path segments are preserved and /api is appended",
			raw:  "https://api.example.com/gateway",
			want: "https://api.example.com/gateway/api",
		},
		{
			name: "surrounding whitespace is trimmed",
			raw:  "  https://api.example.com  ",
			want: "https://api.example.com/api",
		},
		{
			name: "port is preserved",
			raw:  "https://api.example.com:8443",
			want: "https://api.example.com:8443/api",
		},
		{
			name:    "missing scheme is rejected",
			raw:     "api.example.com",
			wantErr: "must be absolute",
		},
		{
			name:    "missing host is rejected",
			raw:     "http:///path",
			wantErr: "must be absolute",
		},
		{
			name:    "unparseable URL is rejected",
			raw:     "http://[::1",
			wantErr: "parse dogfooding api url",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeAPIURL(tt.raw)
			if tt.wantErr != "" {
				if err == nil {
					t.Fatalf("normalizeAPIURL(%q) error = nil, want error containing %q", tt.raw, tt.wantErr)
				}
				if !strings.Contains(err.Error(), tt.wantErr) {
					t.Errorf("normalizeAPIURL(%q) error = %q, want it to contain %q", tt.raw, err.Error(), tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("normalizeAPIURL(%q) unexpected error: %v", tt.raw, err)
			}
			if got != tt.want {
				t.Errorf("normalizeAPIURL(%q) = %q, want %q", tt.raw, got, tt.want)
			}
		})
	}
}

// TestClientDecrementSkipsWithoutTouchingTheSDK exercises client.Decrement's
// two guard clauses directly. Both must return before the method reaches
// r.sdkClient, which is why a zero-value client (nil sdkClient/ofClient) is
// safe to use here -- if either guard clause regressed and fell through, this
// test would panic on the nil SDK client instead of silently passing.
func TestClientDecrementSkipsWithoutTouchingTheSDK(t *testing.T) {
	kaitenOrgID := uuid.New()
	otherOrgID := uuid.New()
	c := &client{kaitenOrgID: kaitenOrgID}

	t.Run("blank entitlement slug is a no-op", func(t *testing.T) {
		if err := c.Decrement(t.Context(), otherOrgID, ""); err != nil {
			t.Errorf("Decrement() with blank slug = %v, want nil", err)
		}
	})

	t.Run("whitespace-only entitlement slug is a no-op", func(t *testing.T) {
		if err := c.Decrement(t.Context(), otherOrgID, "   "); err != nil {
			t.Errorf("Decrement() with whitespace slug = %v, want nil", err)
		}
	})

	t.Run("the Kaiten organization is always skipped", func(t *testing.T) {
		if err := c.Decrement(t.Context(), kaitenOrgID, "some-entitlement"); err != nil {
			t.Errorf("Decrement() for the Kaiten org = %v, want nil", err)
		}
	})
}

// TestClientReportAndEnforceSkipsBlankSlugWithoutTouchingTheSDK exercises the
// one guard clause in ReportAndEnforce that runs before any OpenFeature or SDK
// call -- unlike Decrement, this method does not special-case the Kaiten org
// via a direct ID comparison (it goes through the "is-kaiten" flag evaluation
// instead), so only the blank-slug branch is safe to exercise without a real
// OpenFeature client.
func TestClientReportAndEnforceSkipsBlankSlugWithoutTouchingTheSDK(t *testing.T) {
	c := &client{kaitenOrgID: uuid.New()}

	if err := c.ReportAndEnforce(t.Context(), uuid.New(), ""); err != nil {
		t.Errorf("ReportAndEnforce() with blank slug = %v, want nil", err)
	}
}
