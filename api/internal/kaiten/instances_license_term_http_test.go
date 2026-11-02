package kaiten

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humafiber"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type instanceTermQueries struct {
	orgID                               uuid.UUID
	instance                            db.GetOneInstanceRow
	now                                 pgtype.Timestamp
	lookups, clocks                     int
	lookupErr, clockErr, integrationErr error
	integrations                        []db.GetInstanceIntegrationsRow
}

func (q *instanceTermQueries) GetOneInstance(_ context.Context, params db.GetOneInstanceParams) (db.GetOneInstanceRow, error) {
	q.lookups++
	if q.lookupErr != nil {
		return db.GetOneInstanceRow{}, q.lookupErr
	}
	if params.OrganizationID != q.orgID || params.Slug != q.instance.Slug {
		return db.GetOneInstanceRow{}, pgx.ErrNoRows
	}
	return q.instance, nil
}

func (q *instanceTermQueries) GetDatabaseNow(context.Context) (pgtype.Timestamp, error) {
	q.clocks++
	return q.now, q.clockErr
}

func (q *instanceTermQueries) GetInstanceIntegrations(context.Context, db.GetInstanceIntegrationsParams) ([]db.GetInstanceIntegrationsRow, error) {
	return q.integrations, q.integrationErr
}

func instanceTermApp(q *instanceTermQueries, p *principal.Principal) *fiber.App {
	app := fiber.New()
	app.Use(func(c fiber.Ctx) error {
		if p != nil {
			c.SetContext(principal.ContextWithPrincipal(c.Context(), p))
		}
		return c.Next()
	})
	kaitenhuma.SetErrorHandler()
	api := humafiber.New(app, kaitenhuma.ConfigureErrors(kaitenhuma.ConfigureSecurity(huma.DefaultConfig("test", "1"))))
	facade := Instances{uc: &instances.UseCases{GetInstance: getinstance.NewUseCase(getinstance.Deps{
		Queries: q, UserProvider: &currentuser.ContextUserProvider{},
	})}}
	getinstance.RegisterEndpoint(api, facade)
	return app
}

func TestInstanceTermHTTPNoStoreAndInternalFailures(t *testing.T) {
	now := time.Date(2026, 10, 30, 0, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		name       string
		start, end time.Duration
		status     schema.LicenseTermStatus
		invalid    string
	}{
		{"active", -time.Hour, time.Hour, schema.LicenseTermActive, ""},
		{"future", time.Hour, 2 * time.Hour, schema.LicenseTermNotStarted, ""},
		{"expired", -2 * time.Hour, -time.Hour, schema.LicenseTermExpired, ""},
		{"before start", time.Millisecond, time.Hour, schema.LicenseTermNotStarted, ""},
		{"at start inclusive", 0, time.Hour, schema.LicenseTermActive, ""},
		{"before end", -time.Hour, time.Millisecond, schema.LicenseTermActive, ""},
		{"at end exclusive", -time.Hour, 0, schema.LicenseTermExpired, ""},
		{"after end", -time.Hour, -time.Millisecond, schema.LicenseTermExpired, ""},
		{"invalid clock", -time.Hour, time.Hour, "", "clock"},
		{"missing start", -time.Hour, time.Hour, "", "start"},
		{"missing end", -time.Hour, time.Hour, "", "end"},
		{"missing license slug", -time.Hour, time.Hour, "", "slug"},
		{"lookup failure", -time.Hour, time.Hour, "", "lookup"},
		{"clock failure", -time.Hour, time.Hour, "", "clock error"},
		{"cancellation", -time.Hour, time.Hour, "", "cancel"},
		{"metadata failure", -time.Hour, time.Hour, "", "metadata"},
		{"integration failure", -time.Hour, time.Hour, "", "integration"},
		{"integration metadata failure", -time.Hour, time.Hour, "", "integration metadata"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			orgID, licenseID := uuid.New(), uuid.New()
			licenseSlug := "starter"
			q := &instanceTermQueries{orgID: orgID, now: pgtype.Timestamp{Time: now, Valid: true}, instance: db.GetOneInstanceRow{
				ID: uuid.New(), Name: "Ninja production", Description: "Synthetic resource", Status: db.InstanceStatusHEALTHY,
				Slug: "ninja-prod", LicenseID: licenseID, LicenseSlug: &licenseSlug,
				StartLicenseDate: pgtype.Timestamp{Time: now.Add(tc.start), Valid: true},
				EndLicenseDate:   pgtype.Timestamp{Time: now.Add(tc.end), Valid: true},
			}}
			switch tc.invalid {
			case "clock":
				q.now.Valid = false
			case "start":
				q.instance.StartLicenseDate.Valid = false
			case "end":
				q.instance.EndLicenseDate.Valid = false
			case "slug":
				q.instance.LicenseSlug = nil
			case "lookup":
				q.lookupErr = errors.New("private SQL lookup failure")
			case "clock error":
				q.clockErr = errors.New("private SQL clock failure")
			case "cancel":
				q.lookupErr = context.Canceled
			case "metadata":
				q.instance.Metadata = []byte("[]")
			case "integration":
				q.integrationErr = errors.New("private SQL integration failure")
			case "integration metadata":
				q.integrations = []db.GetInstanceIntegrationsRow{{Metadata: []byte("[]")}}
			}
			app := instanceTermApp(q, &principal.Principal{Kind: principal.KindOrganization, UserID: uuid.New(), OrganizationID: orgID, Scopes: []string{"read:instances"}})
			resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/instances/ninja-prod", nil))
			require.NoError(t, err)
			defer func() { require.NoError(t, resp.Body.Close()) }()
			if tc.invalid != "" {
				require.Equal(t, http.StatusInternalServerError, resp.StatusCode)
				var problem kaitenerrors.Problem
				require.NoError(t, json.NewDecoder(resp.Body).Decode(&problem))
				require.NotEmpty(t, problem.ErrorID)
				require.Empty(t, problem.Errors, "internal invariant diagnostics must not reach clients")
				require.NotContains(t, problem.Detail, "database clock")
				require.NotContains(t, problem.Detail, "stored license term")
				require.NotContains(t, problem.Detail, "license slug")
				require.NotContains(t, problem.Detail, "private SQL")
				return
			}
			require.Equal(t, http.StatusOK, resp.StatusCode)
			require.Equal(t, "no-store", resp.Header.Get("Cache-Control"))
			var resource map[string]any
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&resource))
			require.NotContains(t, resource, "valid")
			require.Len(t, resource["licenseTerm"], 2)
			raw, err := json.Marshal(resource)
			require.NoError(t, err)
			var result schema.Instance
			require.NoError(t, json.Unmarshal(raw, &result))
			require.NotNil(t, result.LicenseTerm)
			require.Equal(t, tc.status, result.LicenseTerm.Status)
			require.Equal(t, q.instance.ID, result.ID)
			require.Equal(t, q.instance.Name, result.Name)
			require.Equal(t, q.instance.Description, result.Description)
			require.Equal(t, schema.InstanceStatusHealthy, result.Status)
			require.Equal(t, q.instance.StartLicenseDate.Time.UTC(), result.StartLicenseDate)
			require.Equal(t, q.instance.EndLicenseDate.Time.UTC(), result.EndLicenseDate)
			require.Equal(t, licenseID, result.LicenseID)
			require.Equal(t, licenseSlug, result.LicenseSlug)
			require.Equal(t, now, result.LicenseTerm.EvaluatedAt)
			require.Equal(t, 1, q.lookups)
			require.Equal(t, 1, q.clocks)
		})
	}
}

func TestInstanceTermHTTPGuards(t *testing.T) {
	orgID := uuid.New()
	for _, tc := range []struct {
		name, slug      string
		identity        bool
		orgID           uuid.UUID
		scopes          []string
		status, lookups int
		kind            principal.Kind
	}{
		{"unauthenticated", "ninja-prod", false, orgID, nil, http.StatusUnauthorized, 0, principal.KindOrganization},
		{"insufficient scope", "ninja-prod", true, orgID, []string{"read:licenses"}, http.StatusForbidden, 0, principal.KindOrganization},
		{"foreign", "ninja-prod", true, uuid.New(), []string{"read:instances"}, http.StatusNotFound, 1, principal.KindOrganization},
		{"missing", "missing-prod", true, orgID, []string{"read:instances"}, http.StatusNotFound, 1, principal.KindOrganization},
		{"wrong credential", "ninja-prod", true, orgID, []string{"read:instances"}, http.StatusForbidden, 0, principal.KindPlatform},
	} {
		t.Run(tc.name, func(t *testing.T) {
			q := &instanceTermQueries{orgID: orgID, instance: db.GetOneInstanceRow{Slug: "ninja-prod"}}
			var p *principal.Principal
			if tc.identity {
				p = &principal.Principal{Kind: tc.kind, UserID: uuid.New(), OrganizationID: tc.orgID, Scopes: tc.scopes}
			}
			resp, err := instanceTermApp(q, p).Test(httptest.NewRequest(http.MethodGet, "/instances/"+tc.slug, nil))
			require.NoError(t, err)
			defer func() { require.NoError(t, resp.Body.Close()) }()
			require.Equal(t, tc.status, resp.StatusCode)
			if tc.status == http.StatusNotFound {
				var problem kaitenerrors.Problem
				require.NoError(t, json.NewDecoder(resp.Body).Decode(&problem))
				require.Equal(t, "GetInstance.NotFound", problem.Code)
			}
			require.Equal(t, tc.lookups, q.lookups)
			require.Zero(t, q.clocks, "denied requests must not evaluate a term")
		})
	}
}
