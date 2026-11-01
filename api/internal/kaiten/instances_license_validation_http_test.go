package kaiten

import (
	"context"
	"encoding/json"
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
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getlicensevalidation"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type licenseValidationQueries struct {
	orgID           uuid.UUID
	instance        db.GetOneInstanceRow
	now             pgtype.Timestamp
	lookups, clocks int
}

func (q *licenseValidationQueries) GetOneInstance(_ context.Context, params db.GetOneInstanceParams) (db.GetOneInstanceRow, error) {
	q.lookups++
	if params.OrganizationID != q.orgID || params.Slug != q.instance.Slug {
		return db.GetOneInstanceRow{}, pgx.ErrNoRows
	}
	return q.instance, nil
}

func (q *licenseValidationQueries) GetDatabaseNow(context.Context) (pgtype.Timestamp, error) {
	q.clocks++
	return q.now, nil
}

func licenseValidationApp(q *licenseValidationQueries, p *principal.Principal) *fiber.App {
	app := fiber.New()
	app.Use(func(c fiber.Ctx) error {
		if p != nil {
			c.SetContext(principal.ContextWithPrincipal(c.Context(), p))
		}
		return c.Next()
	})
	kaitenhuma.SetErrorHandler()
	api := humafiber.New(app, kaitenhuma.ConfigureErrors(kaitenhuma.ConfigureSecurity(huma.DefaultConfig("test", "1"))))
	facade := Instances{uc: &instances.UseCases{GetLicenseValidation: getlicensevalidation.NewUseCase(getlicensevalidation.Deps{
		Queries: q, UserProvider: &currentuser.ContextUserProvider{},
	})}}
	getlicensevalidation.RegisterEndpoint(api, facade)
	return app
}

func TestLicenseValidationHTTPNoStoreAndInternalFailures(t *testing.T) {
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
		{"invalid clock", -time.Hour, time.Hour, "", "clock"},
		{"missing start", -time.Hour, time.Hour, "", "start"},
		{"missing end", -time.Hour, time.Hour, "", "end"},
		{"missing license slug", -time.Hour, time.Hour, "", "slug"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			orgID, licenseID := uuid.New(), uuid.New()
			licenseSlug := "starter"
			q := &licenseValidationQueries{orgID: orgID, now: pgtype.Timestamp{Time: now, Valid: true}, instance: db.GetOneInstanceRow{
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
			}
			app := licenseValidationApp(q, &principal.Principal{Kind: principal.KindOrganization, UserID: uuid.New(), OrganizationID: orgID, Scopes: []string{"read:instances"}})
			resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/instances/ninja-prod/license-validation", nil))
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
				return
			}
			require.Equal(t, http.StatusOK, resp.StatusCode)
			require.Equal(t, "no-store", resp.Header.Get("Cache-Control"))
			var result schema.LicenseValidation
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
			require.Equal(t, tc.status, result.Status)
			require.Equal(t, tc.status == schema.LicenseTermActive, result.Valid)
			require.Equal(t, licenseID, result.LicenseID)
			require.Equal(t, licenseSlug, result.LicenseSlug)
			require.Equal(t, now, result.EvaluatedAt)
			require.Equal(t, 1, q.lookups)
			require.Equal(t, 1, q.clocks)
		})
	}
}

func TestLicenseValidationHTTPGuards(t *testing.T) {
	orgID := uuid.New()
	for _, tc := range []struct {
		name, slug      string
		identity        bool
		orgID           uuid.UUID
		scopes          []string
		status, lookups int
	}{
		{"unauthenticated", "ninja-prod", false, orgID, nil, http.StatusUnauthorized, 0},
		{"insufficient scope", "ninja-prod", true, orgID, []string{"read:licenses"}, http.StatusForbidden, 0},
		{"foreign", "ninja-prod", true, uuid.New(), []string{"read:instances"}, http.StatusNotFound, 1},
		{"missing", "missing-prod", true, orgID, []string{"read:instances"}, http.StatusNotFound, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			q := &licenseValidationQueries{orgID: orgID, instance: db.GetOneInstanceRow{Slug: "ninja-prod"}}
			var p *principal.Principal
			if tc.identity {
				p = &principal.Principal{Kind: principal.KindOrganization, UserID: uuid.New(), OrganizationID: tc.orgID, Scopes: tc.scopes}
			}
			resp, err := licenseValidationApp(q, p).Test(httptest.NewRequest(http.MethodGet, "/instances/"+tc.slug+"/license-validation", nil))
			require.NoError(t, err)
			defer func() { require.NoError(t, resp.Body.Close()) }()
			require.Equal(t, tc.status, resp.StatusCode)
			if tc.status == http.StatusNotFound {
				var problem kaitenerrors.Problem
				require.NoError(t, json.NewDecoder(resp.Body).Decode(&problem))
				require.Equal(t, "GetInstanceLicenseValidation.NotFound", problem.Code)
			}
			require.Equal(t, tc.lookups, q.lookups)
			require.Zero(t, q.clocks, "denied requests must not evaluate a term")
		})
	}
}
