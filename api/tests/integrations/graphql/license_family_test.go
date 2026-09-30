package graphql_test

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	licensesgraphql "github.com/kaitencloud/kaiten/api/internal/modules/licenses/graphql"
	licensesdb "github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
)

type licenseFamilyPayload struct {
	ID   string `json:"id"`
	Slug string `json:"slug"`
}

// TestGraphQL_LicenseFamily covers the GraphQL surface: family is
// where the family's slug is served, since a license's REST representation
// carries only familyId.
func TestGraphQL_LicenseFamily(t *testing.T) {
	t.Run("ResolvesTheFamilyOfEveryVersion", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		first := newLicense(t, "Family Query")
		second := newLicenseVersion(t, "Family Query", first.Slug)

		resp := executeGraphQL(t, `{ licenses { items { slug version family { id slug } } } }`, nil)
		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		var payload struct {
			Licenses struct {
				Items []struct {
					Slug    string               `json:"slug"`
					Version string               `json:"version"`
					Family  licenseFamilyPayload `json:"family"`
				} `json:"items"`
			} `json:"licenses"`
		}
		require.NoError(t, json.Unmarshal(resp.Data, &payload))

		families := make(map[string]licenseFamilyPayload, len(payload.Licenses.Items))
		for _, item := range payload.Licenses.Items {
			families[item.Slug] = item.Family
		}

		require.Contains(t, families, first.Slug)
		require.Contains(t, families, second.Slug)
		assert.Equal(t, first.Slug, families[first.Slug].Slug,
			"the family took the slug of the version that opened it")
		assert.Equal(t, families[first.Slug].ID, families[second.Slug].ID,
			"two versions of one product resolve to one family")
		assert.Equal(t, first.FamilyID.String(), families[first.Slug].ID,
			"the GraphQL family and the REST familyId are the same identifier")
	})

	// The traversal that a field-by-field row copy in the license dataloader
	// used to break: family_id was dropped there, so the family resolved
	// against a nil UUID one level down while resolving correctly at the top.
	t.Run("ResolvesThroughInstanceLicense", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		license := newLicense(t, "Traversed Family")
		customer := newCustomer(t, "Traversal Customer")
		instance := newInstance(t, "Traversal Instance", customer, license)

		resp := executeGraphQL(t,
			`query ($slug: String!) { instance(slug: $slug) { slug license { slug isDefault family { id slug } } } }`,
			map[string]interface{}{"slug": instance.Slug})
		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		var payload struct {
			Instance struct {
				Slug    string `json:"slug"`
				License struct {
					Slug      string               `json:"slug"`
					IsDefault bool                 `json:"isDefault"`
					Family    licenseFamilyPayload `json:"family"`
				} `json:"license"`
			} `json:"instance"`
		}
		require.NoError(t, json.Unmarshal(resp.Data, &payload))

		assert.Equal(t, license.Slug, payload.Instance.License.Slug)
		assert.Equal(t, license.FamilyID.String(), payload.Instance.License.Family.ID,
			"the family survives the instance -> license traversal")
		assert.Equal(t, license.Slug, payload.Instance.License.Family.Slug)
	})
}

// newLicenseVersion adds a version to an existing family, which is what
// familySlug on create means.
func newLicenseVersion(t *testing.T, name, familySlug string) *licenseschema.License {
	t.Helper()

	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	license, err := repo.CreateLicense(
		t.Context(),
		&createlicense.Command{
			Name:        name,
			FamilySlug:  ptr.To(familySlug),
			Description: "Next version of the same product",
			Type:        licenseschema.Development,
		},
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)

	return license
}

// TestGraphQL_LicenseFamilyQuery covers the licenseFamily query: the
// same resolution rule the REST family endpoint applies, reached through
// GraphQL.
func TestGraphQL_LicenseFamilyQuery(t *testing.T) {
	const query = `query ($slug: String!) {
		licenseFamily(slug: $slug) {
			id
			slug
			versionCount
			currentVersion { slug version lifecycleState }
			versions { version lifecycleState }
		}
	}`

	type familyPayload struct {
		LicenseFamily *struct {
			ID             string `json:"id"`
			Slug           string `json:"slug"`
			VersionCount   int    `json:"versionCount"`
			CurrentVersion *struct {
				Slug           string `json:"slug"`
				Version        string `json:"version"`
				LifecycleState string `json:"lifecycleState"`
			} `json:"currentVersion"`
			Versions []struct {
				Version        string `json:"version"`
				LifecycleState string `json:"lifecycleState"`
			} `json:"versions"`
		} `json:"licenseFamily"`
	}

	t.Run("ResolvesTheCurrentVersionAndTheHistory", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		first := newLicense(t, "Graph Family")
		newLicenseVersion(t, "Graph Family", first.Slug)

		resp := executeGraphQL(t, query, map[string]interface{}{"slug": first.Slug})
		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		var payload familyPayload
		require.NoError(t, json.Unmarshal(resp.Data, &payload))
		require.NotNil(t, payload.LicenseFamily)

		assert.Equal(t, first.Slug, payload.LicenseFamily.Slug)
		assert.Equal(t, 2, payload.LicenseFamily.VersionCount)
		require.NotNil(t, payload.LicenseFamily.CurrentVersion)
		assert.Equal(t, "2", payload.LicenseFamily.CurrentVersion.Version,
			"with no default set, the highest published version is what the family serves")
		assert.Equal(t, "PUBLISHED", payload.LicenseFamily.CurrentVersion.LifecycleState)
		assert.Len(t, payload.LicenseFamily.Versions, 2)
	})

	// Where GraphQL parts from REST on purpose: no published version is a null
	// field, not an error that fails the whole query.
	t.Run("WhenNothingIsPublished_ReturnsANullCurrentVersion", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		license := newDraftLicense(t, "Graph Draft Only")

		resp := executeGraphQL(t, query, map[string]interface{}{"slug": license.Slug})
		require.Empty(t, resp.Errors, "a draft-only family must not fail the query: %v", resp.Errors)

		var payload familyPayload
		require.NoError(t, json.Unmarshal(resp.Data, &payload))
		require.NotNil(t, payload.LicenseFamily)

		assert.Nil(t, payload.LicenseFamily.CurrentVersion)
		assert.Equal(t, 1, payload.LicenseFamily.VersionCount)
		assert.Len(t, payload.LicenseFamily.Versions, 1)
		assert.Equal(t, "DRAFT", payload.LicenseFamily.Versions[0].LifecycleState)
	})

	// versions has its own resolver, so a query that does not select it does
	// not read the history, and everything else still resolves without it.
	t.Run("WithoutVersionsSelected_ResolvesTheRest", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		first := newLicense(t, "Graph Lean Family")
		newLicenseVersion(t, "Graph Lean Family", first.Slug)

		resp := executeGraphQL(t, `query ($slug: String!) {
			licenseFamily(slug: $slug) { slug versionCount currentVersion { version } }
		}`, map[string]interface{}{"slug": first.Slug})
		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		var payload map[string]map[string]json.RawMessage
		require.NoError(t, json.Unmarshal(resp.Data, &payload))
		family := payload["licenseFamily"]
		require.NotNil(t, family)
		assert.JSONEq(t, `2`, string(family["versionCount"]))
		assert.JSONEq(t, `{"version":"2"}`, string(family["currentVersion"]))
		assert.NotContains(t, family, "versions")

		// The response alone cannot show the history was not read: GraphQL
		// leaves out an unselected field either way. The statements the view
		// runs can, so the resolver behind licenseFamily is run on a pool that
		// records them -- and the history read, run on its own, is seen by the
		// same recorder, so an empty result is not a recorder that sees nothing.
		queries, statements := recordedQueries(t)
		ctx := principal.ContextWithPrincipal(t.Context(), &principal.Principal{
			Kind:           principal.KindOrganization,
			UserID:         testDb.DefaultData.UserID,
			OrganizationID: testDb.DefaultData.OrganizationID,
		})

		view, err := licensesgraphql.GetLicenseFamilyView(ctx, queries, first.Slug)
		require.NoError(t, err)
		require.NotNil(t, view)
		assert.False(t, statements.ran(listLicenseVersionsInFamily),
			"licenseFamily read the version history although versions was not selected")

		_, err = licensesgraphql.LicenseFamilyVersions(ctx, queries, view.ID)
		require.NoError(t, err)
		assert.True(t, statements.ran(listLicenseVersionsInFamily),
			"the recorder must see the history read when it does run")
	})

	t.Run("WhenTheFamilyDoesNotExist_ReturnsNull", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		resp := executeGraphQL(t, query, map[string]interface{}{"slug": "no-such-family"})
		require.Empty(t, resp.Errors, "GraphQL errors: %v", resp.Errors)

		var payload familyPayload
		require.NoError(t, json.Unmarshal(resp.Data, &payload))
		assert.Nil(t, payload.LicenseFamily)
	})
}

// newDraftLicense creates a license that opens a family with nothing published.
func newDraftLicense(t *testing.T, name string) *licenseschema.License {
	t.Helper()

	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	license, err := repo.CreateLicense(
		t.Context(),
		&createlicense.Command{
			Name:           name,
			Slug:           ptr.To(slugutil.Generate(name)),
			Description:    "Prepared, not offered",
			Type:           licenseschema.Development,
			LifecycleState: licenseschema.Draft,
		},
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)

	return license
}

// listLicenseVersionsInFamily is the name sqlc gives the history read; every
// statement it generates starts with that name as a comment.
const listLicenseVersionsInFamily = "-- name: ListLicenseVersionsInFamily "

// statementRecorder is a pgx tracer that keeps the text of every statement a
// pool runs.
type statementRecorder struct {
	mu  sync.Mutex
	sql []string
}

func (r *statementRecorder) TraceQueryStart(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sql = append(r.sql, data.SQL)
	return ctx
}

func (r *statementRecorder) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {}

func (r *statementRecorder) ran(prefix string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, statement := range r.sql {
		if strings.HasPrefix(statement, prefix) {
			return true
		}
	}
	return false
}

// recordedQueries opens a pool on the test database whose statements are
// recorded, and returns the licenses queries bound to it.
func recordedQueries(t *testing.T) (*licensesdb.Queries, *statementRecorder) {
	t.Helper()

	recorder := &statementRecorder{}
	config, err := pgxpool.ParseConfig(testDb.ConnectionString)
	require.NoError(t, err)
	config.ConnConfig.Tracer = recorder

	pool, err := pgxpool.NewWithConfig(t.Context(), config)
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	return licensesdb.New(pool), recorder
}
