package graphql

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/99designs/gqlgen/complexity"
	"github.com/99designs/gqlgen/graphql"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	gqlparser "github.com/vektah/gqlparser/v2"
	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/lexer"
	"github.com/vektah/gqlparser/v2/parser"
	"github.com/vektah/gqlparser/v2/validator"
	"go.opentelemetry.io/otel/trace"

	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/pkg/fiberapi"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

func TestHTTPHandlerWithUserContextPreservesUserContext(t *testing.T) {
	t.Parallel()

	app := fiber.New()
	expectedTraceID := trace.TraceID{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16}
	expectedSpanID := trace.SpanID{1, 2, 3, 4, 5, 6, 7, 8}

	app.Use(func(c fiber.Ctx) error {
		spanCtx := trace.NewSpanContext(trace.SpanContextConfig{
			TraceID: expectedTraceID,
			SpanID:  expectedSpanID,
			Remote:  true,
		})
		c.SetContext(trace.ContextWithSpanContext(c.Context(), spanCtx))
		return c.Next()
	})

	app.Get("/graphql", httpHandlerWithUserContext(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		spanCtx := trace.SpanContextFromContext(r.Context())
		require.True(t, spanCtx.IsValid())
		require.Equal(t, expectedTraceID, spanCtx.TraceID())
		require.Equal(t, expectedSpanID, spanCtx.SpanID())
		w.WriteHeader(http.StatusNoContent)
	})))

	req := httptest.NewRequest(http.MethodGet, "/graphql", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.Empty(t, body)
	require.Equal(t, http.StatusNoContent, resp.StatusCode)
}

// TestGraphQLHandlerPersistsQueriesAcrossRequests pins the reason the gqlgen
// server is built once: an automatic persisted query registered by one request
// must still be resolvable by the next one, which sends the hash alone.
func TestGraphQLHandlerPersistsQueriesAcrossRequests(t *testing.T) {
	t.Parallel()

	const query = "{_health}"
	sum := sha256.Sum256([]byte(query))
	hash := hex.EncodeToString(sum[:])

	app := newTestApp(t, Config{})

	// The first request carries both the query and its hash: it registers the
	// document in the persisted query cache.
	body := postGraphQL(t, app, map[string]any{
		"query":      query,
		"extensions": persistedQueryExtension(hash),
	})
	require.JSONEq(t, `{"data":{"_health":"ok"}}`, body)

	// The second one sends the hash only. It resolves only if the cache
	// survived the first request.
	body = postGraphQL(t, app, map[string]any{
		"extensions": persistedQueryExtension(hash),
	})
	require.JSONEq(t, `{"data":{"_health":"ok"}}`, body)
}

func TestParserTokenLimitAdmitsEveryLegitimateQuery(t *testing.T) {
	t.Parallel()

	schema := newExecutableSchema(nil, Config{}).Schema()
	for _, queries := range []map[string]string{legitimateQueries, parserSDKQueries} {
		for name, query := range queries {
			t.Run(name, func(t *testing.T) {
				t.Parallel()

				tokens := queryTokenCount(t, query)
				t.Logf("%d tokens", tokens)
				require.Less(t, tokens, parserTokenLimit,
					"the parser must leave legitimate documents room to grow")
				doc, err := parser.ParseQueryWithTokenLimit(&ast.Source{Input: query}, parserTokenLimit)
				require.NoError(t, err)
				require.Empty(t, validator.ValidateWithRules(schema, doc, nil))
			})
		}
	}

	require.Equal(t, 73, queryTokenCount(t, parserSDKQueries["sdk/LicensingCatalog"]))
	require.Equal(t, 140, queryTokenCount(t, parserSDKQueries["sdk/LicensingSnapshot"]),
		"the largest measured document is the anchor for parserTokenLimit")
}

func TestParserTokenLimitBoundary(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name  string
		query string
		code  int
	}{
		{"at the limit", queryAtParserTokenLimit, http.StatusOK},
		{"one token over", "query " + queryAtParserTokenLimit, http.StatusUnprocessableEntity},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			srv := newServer(nil, Config{})
			var calls atomic.Int64
			srv.AroundFields(func(ctx context.Context, next graphql.Resolver) (any, error) {
				calls.Add(1)
				return next(ctx)
			})

			encoded, err := json.Marshal(map[string]any{"query": tc.query})
			require.NoError(t, err)
			req := httptest.NewRequest(http.MethodPost, "/graphql", bytes.NewReader(encoded))
			req.Header.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
			// graphqlHandler hands the scope gate its caller; this test serves the
			// gqlgen server directly, so it does the same. _health requires no scope.
			req = req.WithContext(withScopeCheck(req.Context(), &scopeCheck{caller: callerHolding()}))
			resp := httptest.NewRecorder()
			srv.ServeHTTP(resp, req)

			require.Equal(t, tc.code, resp.Code, resp.Body.String())
			if tc.code == http.StatusOK {
				require.Equal(t, parserTokenLimit, queryTokenCount(t, tc.query))
				require.JSONEq(t, `{"data":{"_health":"ok"}}`, resp.Body.String())
				require.Positive(t, calls.Load())
			} else {
				require.Equal(t, parserTokenLimit+1, queryTokenCount(t, tc.query))
				require.Zero(t, calls.Load(), "no resolver may run before the refusal")
				require.JSONEq(t, fmt.Sprintf(`{"errors":[{"message":"exceeded token limit of %d","extensions":{"code":"GRAPHQL_PARSE_FAILED"}}],"data":null}`, parserTokenLimit), resp.Body.String())
			}
		})
	}
}

func TestGraphQLRejectsQueryOverParserTokenLimit(t *testing.T) {
	t.Parallel()

	app := newTestApp(t, Config{})
	// Even a complexity of one can exhaust the parser's stack. Exercise the
	// real Fiber route and error presenter, without Fiber's one-second timeout.
	encoded, err := json.Marshal(map[string]any{"query": nestedFragmentQuery(2_000, "_health")})
	require.NoError(t, err)
	req := httptest.NewRequest(http.MethodPost, "/graphql", bytes.NewReader(encoded))
	req.Header.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
	resp, err := app.Test(req, fiber.TestConfig{Timeout: 0})
	require.NoError(t, err)
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	require.Equal(t, http.StatusUnprocessableEntity, resp.StatusCode, string(body))
	require.JSONEq(t, fmt.Sprintf(`{"errors":[{"message":"exceeded token limit of %d","extensions":{"code":"GRAPHQL_PARSE_FAILED"}}],"data":null}`, parserTokenLimit), string(body))
}

// TestComplexityLimitAdmitsEveryLegitimateQuery is where complexityLimit comes
// from. Every number here is a row count, not a field count: see complexity.go
// for why a field's cost is its fan-out times the cost of one row.
func TestComplexityLimitAdmitsEveryLegitimateQuery(t *testing.T) {
	t.Parallel()

	for name := range legitimateQueries {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			require.LessOrEqual(t, queryComplexityAsSent(t, name), complexityLimit,
				"a query a real client issues must never be refused")
		})
	}

	// The ceiling. The console sends its dearest document asking for the
	// largest page pagination serves, so no page of it costs more than that.
	t.Run("the heaviest one the console sends", func(t *testing.T) {
		t.Parallel()

		cost := queryComplexityAsSent(t, heaviestClientQuery)

		require.Equal(t, 262_200, cost, "the number complexityLimit was read from")
		require.Less(t, cost, complexityLimit,
			"the limit must leave the schema and the console room to grow")
		for name := range legitimateQueries {
			require.LessOrEqual(t, queryComplexityAsSent(t, name), cost,
				"%s is dearer than the ceiling, so it is the ceiling now: read complexityLimit against it", name)
		}
	})

	// The SDK's documents do not leave their page to the caller: they name one,
	// sized to keep the dearer of the two under the ceiling. complexityLimit
	// says why a license is too dear a row for them to do otherwise.
	t.Run("the SDK's documents at the page they name", func(t *testing.T) {
		t.Parallel()

		catalog := queryComplexity(t, legitimateQueries[sdkCatalogQuery])
		snapshot := queryComplexity(t, legitimateQueries[sdkSnapshotQuery])

		require.Equal(t, 215_350, catalog)
		require.Equal(t, 236_363, snapshot)
	})

	// A release of the SDK that asks for the largest page is refused whole, and
	// that is the limit working: the answer is a smaller page, not a higher
	// limit.
	t.Run("the SDK's documents at the largest page are refused", func(t *testing.T) {
		t.Parallel()

		catalog := queryComplexity(t, sdkQueryAtMaxPage(sdkCatalogQuery))
		snapshot := queryComplexity(t, sdkQueryAtMaxPage(sdkSnapshotQuery))

		require.Equal(t, 1_722_800, catalog)
		require.Equal(t, 1_743_813, snapshot)
		require.Greater(t, catalog, complexityLimit)
	})

	// Not a ceiling: fan-out charging makes breadth multiply, and expanding every
	// relation of an organization in one pass is the shape this guard refuses.
	t.Run("an organization expanded in one pass is refused", func(t *testing.T) {
		t.Parallel()

		require.Equal(t, 23_692_600, queryComplexity(t, broadQuery))
		require.Greater(t, queryComplexity(t, broadQuery), complexityLimit)
	})
}

// TestGraphQLRejectsQueryOverComplexityLimit exercises the shape the limit
// exists for: the instance -> license -> instances cycle, where every turn
// multiplies the objects resolved while the document barely grows.
//
// The turn count is the assertion. Under the structural cost model this
// replaced, a turn cost two flat points and 123 of them were admitted -- by
// which point a tenant with fifty instances per license has asked for more
// objects than there are atoms worth serving. Three turns is where it stops
// now.
func TestGraphQLRejectsQueryOverComplexityLimit(t *testing.T) {
	t.Parallel()

	app := newTestApp(t, Config{})

	// The nil pool is the proof that nothing ran: the refusal happens while
	// the operation context is built, before any resolver is reached.
	body := postGraphQL(t, app, map[string]any{"query": cyclicQuery(3)})

	require.Contains(t, body, "COMPLEXITY_LIMIT_EXCEEDED")
	require.Contains(t, body, "which exceeds the limit of 400000")
	require.Contains(t, body, `"data":null`)
}

// TestCyclicQueryPricesItselfOutInThreeTurns pins the turn counts either side
// of the limit, so a later change to assumedFanout or to complexityLimit that
// reopens the cycle fails here rather than in production.
func TestCyclicQueryPricesItselfOutInThreeTurns(t *testing.T) {
	t.Parallel()

	require.Equal(t, 2_600, queryComplexity(t, cyclicQuery(1)))
	require.Equal(t, 127_600, queryComplexity(t, cyclicQuery(2)))
	require.Equal(t, 6_377_600, queryComplexity(t, cyclicQuery(3)))

	require.LessOrEqual(t, queryComplexity(t, cyclicQuery(2)), complexityLimit,
		"one hop and a spare stay affordable -- this is not a depth limit")
	require.Greater(t, queryComplexity(t, cyclicQuery(3)), complexityLimit,
		"the cycle must price itself out well before it can exhaust the process")
}

func TestPlaygroundServedOnlyWhenEnabled(t *testing.T) {
	t.Parallel()

	t.Run("absent by default", func(t *testing.T) {
		t.Parallel()

		app := newTestApp(t, Config{})

		resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/graphql/playground", nil))
		require.NoError(t, err)
		defer resp.Body.Close()

		require.Equal(t, http.StatusNotFound, resp.StatusCode)
	})

	t.Run("served when the deployment asks for it", func(t *testing.T) {
		t.Parallel()

		app := newTestApp(t, Config{EnablePlayground: true})

		resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/graphql/playground", nil))
		require.NoError(t, err)
		defer resp.Body.Close()

		require.Equal(t, http.StatusOK, resp.StatusCode)
	})
}

func TestIntrospectionAnsweredOnlyWhenEnabled(t *testing.T) {
	t.Parallel()

	const query = "{__schema{queryType{name}}}"

	t.Run("refused by default", func(t *testing.T) {
		t.Parallel()

		app := newTestApp(t, Config{})

		body := postGraphQL(t, app, map[string]any{"query": query})

		require.Contains(t, body, "introspection disabled")
		require.NotContains(t, body, "\"Query\"")
	})

	t.Run("answered when the deployment asks for it", func(t *testing.T) {
		t.Parallel()

		app := newTestApp(t, Config{EnableIntrospection: true})

		body := postGraphQL(t, app, map[string]any{"query": query})

		require.JSONEq(t, `{"data":{"__schema":{"queryType":{"name":"Query"}}}}`, body)
	})
}

// TestGraphQLRefusesACredentialThatIsNotAnOrganizations is the credential-class
// gate on this route, asserted from the outside.
func TestGraphQLRefusesACredentialThatIsNotAnOrganizations(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		principal *principal.Principal
		status    int
		code      string
	}{
		{
			name: "platform credential",
			principal: &principal.Principal{
				Kind:            principal.KindPlatform,
				UserID:          uuid.New(),
				PlatformTokenID: uuid.New(),
			},
			status: http.StatusForbidden,
			code:   principal.ErrCodeWrongCredentialKind,
		},
		{
			// The zero value: a principal nobody assigned a kind to. Refused with
			// the platform one rather than read as "the Core API, please" -- see
			// principal.Kind.
			name:      "principal with no kind",
			principal: &principal.Principal{UserID: uuid.New(), OrganizationID: uuid.New()},
			status:    http.StatusForbidden,
			code:      principal.ErrCodeWrongCredentialKind,
		},
		{
			// Unreachable through the real server -- /api/graphql is inside the auth
			// pipeline -- but it is the floor under a future mount that is not, and
			// it must answer 401 rather than 403 so a client refreshes its token.
			name:      "no identity at all",
			principal: nil,
			status:    http.StatusUnauthorized,
			code:      scope.ErrCodeNoIdentity,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			app := newTestAppWithPrincipal(t, Config{}, tc.principal)

			encoded, err := json.Marshal(map[string]any{"query": "{_health}"})
			require.NoError(t, err)

			req := httptest.NewRequest(http.MethodPost, "/graphql", bytes.NewReader(encoded))
			req.Header.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)

			resp, err := app.Test(req)
			require.NoError(t, err)
			defer func() { require.NoError(t, resp.Body.Close()) }()

			body, err := io.ReadAll(resp.Body)
			require.NoError(t, err)
			require.Equal(t, tc.status, resp.StatusCode, string(body))

			var problem map[string]any
			require.NoError(t, json.Unmarshal(body, &problem))
			require.Equal(t, tc.code, problem["code"], string(body))
		})
	}
}

// newTestApp mounts the GraphQL routes behind a principal, the way the auth
// middleware does in the real server. The pool is nil: every query below is
// answered, or refused, before a resolver needs one. The principal holds no
// scope for the same reason -- nothing answered here reads a resource, and what
// the scope gate does with one that would is in scope_test.go.
//
// The kind is written out, and has to be: graphqlHandler resolves a
// caller.Organization, so a principal nobody assigned a kind to is refused with
// 403 before any of these tests reach a query. That is the same fixture the real
// auth middleware produces -- see TestGraphQLRefusesACredentialThatIsNotAnOrganizations
// for the refusals it is the positive case of.
func newTestApp(t *testing.T, config Config) *fiber.App {
	t.Helper()

	return newTestAppWithPrincipal(t, config, &principal.Principal{
		Kind:           principal.KindOrganization,
		UserID:         uuid.New(),
		OrganizationID: uuid.New(),
	})
}

// newTestAppWithPrincipal is newTestApp for a caller that is not the ordinary
// organization one -- a nil principal stands for a request the auth middleware
// let through without establishing an identity.
func newTestAppWithPrincipal(t *testing.T, config Config, i *principal.Principal) *fiber.App {
	t.Helper()

	app := fiber.New(fiber.Config{ErrorHandler: fiberapi.SetErrorHandler()})
	app.Use(func(c fiber.Ctx) error {
		c.SetContext(principal.ContextWithPrincipal(c.Context(), i))
		return c.Next()
	})
	NewHandler(nil, config).RegisterRoutes(app)

	return app
}

// queryComplexityAsSent prices a document in legitimateQueries with the
// variables legitimateVariables holds for it. queryComplexity passes none,
// which charges a page taken from $limit as the default page.
func queryComplexityAsSent(t *testing.T, name string) int {
	t.Helper()

	es := newExecutableSchema(nil, Config{})

	doc, errs := gqlparser.LoadQueryWithRules(es.Schema(), legitimateQueries[name], nil)
	require.Empty(t, errs, "the query must still be valid against the schema")

	variables := legitimateVariables[name]
	if doc.Operations[0].VariableDefinitions.ForName("limit") != nil {
		require.Contains(t, variables, "limit",
			"%s takes its page from $limit: legitimateVariables must say which page its client asks for", name)
	}

	return complexity.Calculate(context.Background(), es, doc.Operations[0], variables)
}

func queryComplexity(t *testing.T, query string) int {
	t.Helper()

	// The server's own schema, cost model included -- see newExecutableSchema.
	// Building a bare generated.Config here would measure gqlgen's structural
	// default instead, and every number in this file would be a fiction.
	es := newExecutableSchema(nil, Config{})

	// Nil rules means the default set -- the same one gqlgen's executor
	// validates an incoming operation with.
	doc, errs := gqlparser.LoadQueryWithRules(es.Schema(), query, nil)
	require.Empty(t, errs, "the query must still be valid against the schema")

	return complexity.Calculate(context.Background(), es, doc.Operations[0], nil)
}

// queryTokenCount uses gqlparser's lexer, including comments but excluding EOF,
// which the query parser peeks at without consuming.
func queryTokenCount(t testing.TB, query string) int {
	t.Helper()

	l := lexer.New(&ast.Source{Input: query})
	for count := 0; ; count++ {
		token, err := l.ReadToken()
		require.NoError(t, err)
		if token.Kind == lexer.EOF {
			return count
		}
	}
}

func nestedFragmentQuery(depth int, selection string) string {
	return "{" + strings.Repeat("...{", depth) + selection + strings.Repeat("}", depth) + "}"
}

// Three tokens per fragment, plus the outer braces and the leaf. Repeated
// health fields fill the remainder without increasing the selection-set depth.
var queryAtParserTokenLimit = nestedFragmentQuery(
	(parserTokenLimit-3)/3,
	"_health"+strings.Repeat(" _health", (parserTokenLimit-3)%3),
)

// cyclicQuery walks instance -> license -> instances depth times. The schema is
// cyclic, so a client can keep going for as long as the complexity limit lets
// it -- each level multiplies the rows resolved, and the cost with them.
func cyclicQuery(depth int) string {
	inner := "id"
	for range depth {
		inner = "license { instances { " + inner + " } }"
	}

	return "{ instances { items { " + inner + " } } }"
}

func persistedQueryExtension(hash string) map[string]any {
	return map[string]any{
		"persistedQuery": map[string]any{
			"version":    1,
			"sha256Hash": hash,
		},
	}
}

func postGraphQL(t *testing.T, app *fiber.App, payload map[string]any) string {
	t.Helper()

	encoded, err := json.Marshal(payload)
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/graphql", bytes.NewReader(encoded))
	req.Header.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)

	resp, err := app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode, string(body))

	return string(body)
}

// heaviestClientQuery keys the dearest document in legitimateQueries, as its
// client sends it -- the console's, and the one complexityLimit was read from.
const heaviestClientQuery = "console/GetReleaseManagementOverview"

// The two documents @kaitencloud/client sends, as legitimateQueries keys them.
const (
	sdkCatalogQuery  = "sdk/LicensingCatalog"
	sdkSnapshotQuery = "sdk/LicensingSnapshot"
)

// sdkPage is the page both of them name, as they spell it.
const sdkPage = "licenses(limit: 25"

// sdkQueryAtMaxPage is one of the SDK's documents asking for the largest page
// pagination will serve instead of the one it names.
//
// Derived from the document rather than copied beside it: a rewrite of the
// SDK's document that this replacement stops matching leaves the two
// identical, and the costs pinned in TestComplexityLimitAdmitsEveryLegitimateQuery
// change, so the drift is caught rather than silently measured.
func sdkQueryAtMaxPage(name string) string {
	return strings.Replace(
		legitimateQueries[name],
		sdkPage,
		fmt.Sprintf("licenses(limit: %d", pagination.MaxLimit),
		1,
	)
}

// consolePage is the page the console asks for whenever it pages a list: its
// MAX_PAGE_SIZE.
const consolePage = 200

// legitimateVariables is what a client sends beside a document in
// legitimateQueries, wherever that changes what the document costs: its page.
var legitimateVariables = map[string]map[string]any{
	"console/GetInstancesWithRelations": {"limit": consolePage},
	"console/GetCustomersWithInstances": {"limit": consolePage},
	heaviestClientQuery:                 {"limit": consolePage},
	"console/MetadataFields":            {"limit": consolePage},
	// The most the audit trail asks for, once "load more" has been pressed.
	"console/GetGlobalAuditTrail": {"limit": 1000},
}

// legitimateQueries is every GraphQL document a client of this service holds,
// verbatim: every one the console hands to graphql() under app/src, the two
// @kaitencloud/client sends (packages/client/src/graphql/documents.ts in
// sdk-js), and the composed licensing snapshot the integration suite reads
// (tests/integrations/graphql/instance_entitlement_usage_test.go) -- which is
// not a document the SDK sends, whatever its key says.
var legitimateQueries = map[string]string{
	"console/GetInstancesWithRelations": `query GetInstancesWithRelations($limit: Int, $cursor: String) {
		instances(limit: $limit, cursor: $cursor) {
			nextCursor hasMore
			items {
				slug name description status lifecycleStage metadata integrations
				customerId licenseId deploymentZoneId startLicenseDate endLicenseDate createdAt
				customer { slug id name }
				license { id name type }
			}
		}
	}`,
	"console/GetCustomersWithInstances": `query GetCustomersWithInstances($limit: Int, $cursor: String) {
		customers(limit: $limit, cursor: $cursor) {
			nextCursor hasMore
			items {
				slug name externalCustomerId domain integrations createdAt updatedAt
				instances { slug name description license { type } }
			}
		}
	}`,
	"console/GetCustomers": `query GetCustomers {
		customers { items { id slug name createdAt } }
	}`,
	"console/GetInstances": `query GetInstances {
		instances {
			items {
				id slug name customerId licenseId startLicenseDate endLicenseDate createdAt
				license { id slug name type }
			}
		}
	}`,
	"console/GetLicenses": `query GetLicenses {
		licenses { items { id slug name type } }
	}`,
	"console/GetDashboardData": `query GetDashboardData {
		customers { items { id slug name createdAt } }
		instances {
			items {
				id slug name customerId licenseId startLicenseDate endLicenseDate createdAt
				license { id slug name type }
			}
		}
		licenses { items { id slug name type } }
	}`,
	"console/GetGlobalAuditTrail": `query GetGlobalAuditTrail($limit: Int) {
		organizationAuditTrails(limit: $limit) {
			items {
				id eventName eventType instanceId instanceSlug instanceName customerName
				payload timestamp
			}
		}
	}`,
	heaviestClientQuery: `query GetReleaseManagementOverview($limit: Int, $cursor: String) {
		releases(limit: $limit, cursor: $cursor) {
			nextCursor hasMore
			items {
				id slug version description createdAt
				createdBy { id name }
				components {
					id previousComponentId name version slug description createdAt
					createdBy { id name }
				}
				deploymentZones { id name slug description type releaseId createdAt updatedAt }
				instances { id name slug description deploymentZoneId customer { id name } }
			}
		}
	}`,
	"console/GetAttioSyncedRecords": `query GetAttioSyncedRecords($connectorName: String!) {
		customers(hasIntegration: $connectorName) { items { id slug name integrations } }
		instances(hasIntegration: $connectorName) { items { id slug name integrations } }
	}`,
	"console/MetadataFields": `query MetadataFields($resourceType: MetadataFieldResourceType!, $includeArchived: Boolean!, $limit: Int, $cursor: String) {
		metadataFields(resourceType: $resourceType, includeArchived: $includeArchived, limit: $limit, cursor: $cursor) {
			items { archivedAt displayOrder id jsonSchema key label resourceType }
			nextCursor hasMore
		}
	}`,
	"sdk/ComposedLicensingSnapshot": `query($slug: String!) {
		customer(slug: $slug) {
			slug
			instances {
				slug customerSlug licenseSlug
				license { slug entitlements { entitlementSlug value unlimited } }
				entitlementUsage { entitlementSlug licenseSlug value }
			}
		}
	}`,
	sdkCatalogQuery: `query LicensingCatalog($cursor: String) {
		licenses(limit: 25, cursor: $cursor) {
			items {
				id name slug description type version versionName isDefault lifecycleState
				family { id }
				entitlements {
					entitlementSlug entitlementName entitlementType licenseId licenseSlug
					value unlimited limitCapExceededOveragePercent
					entitlement {
						id name slug description type icon unitSingular unitPlural
						saleUnitSingular saleUnitPlural saleUnitFactor userFacing displayOrder
						entitlementGroups { id name slug }
					}
				}
			}
			hasMore
			nextCursor
		}
	}`,
	sdkSnapshotQuery: `query LicensingSnapshot($customerId: UUID, $customerSlug: String) {
		licenses(limit: 25) {
			items {
				id name slug description type version versionName isDefault lifecycleState
				family { id }
				entitlements {
					entitlementSlug entitlementName entitlementType licenseId licenseSlug
					value unlimited limitCapExceededOveragePercent
					entitlement {
						id name slug description type icon unitSingular unitPlural
						saleUnitSingular saleUnitPlural saleUnitFactor userFacing displayOrder
						entitlementGroups { id name slug }
					}
				}
			}
			hasMore
			nextCursor
		}
		customer(id: $customerId, slug: $customerSlug) {
			id slug name externalCustomerId
			createdBy { id name }
			createdAt
			updatedBy { id name }
			updatedAt
			instances {
				id slug name description customerId customerSlug licenseId licenseSlug
				deploymentZoneId startLicenseDate endLicenseDate metadata
				createdBy { id name }
				createdAt
				updatedBy { id name }
				updatedAt
				entitlementUsage {
					entitlementId entitlementSlug licenseId licenseSlug value limit
					currentPeriodStart currentPeriodEnd
				}
			}
		}
	}`,
}

// parserSDKQueries mirrors sdk-js/packages/client/src/graphql/documents.ts as
// of 2026-09-30 (whitespace condensed). Keep these local so API tests never
// depend on a sibling checkout. Both validate, but their existing fan-out cost
// exceeds complexityLimit; these fixtures measure parser admission only.
var parserSDKQueries = map[string]string{
	"sdk/LicensingSnapshot": `query LicensingSnapshot($customerId: UUID, $customerSlug: String) {
		licenses(limit: 200) {
			items {
				id name slug description type version versionName isDefault lifecycleState
				family { id }
				entitlements {
					entitlementSlug entitlementName entitlementType licenseId licenseSlug
					value unlimited limitCapExceededOveragePercent
					entitlement {
						id name slug description type icon unitSingular unitPlural
						saleUnitSingular saleUnitPlural saleUnitFactor userFacing displayOrder
						entitlementGroups { id name slug }
					}
				}
			}
			hasMore nextCursor
		}
		customer(id: $customerId, slug: $customerSlug) {
			id slug name externalCustomerId
			createdBy { id name }
			createdAt
			updatedBy { id name }
			updatedAt
			instances {
				id slug name description customerId customerSlug licenseId licenseSlug
				deploymentZoneId startLicenseDate endLicenseDate metadata
				createdBy { id name }
				createdAt
				updatedBy { id name }
				updatedAt
				entitlementUsage {
					entitlementId entitlementSlug licenseId licenseSlug value limit
					currentPeriodStart currentPeriodEnd
				}
			}
		}
	}`,
	"sdk/LicensingCatalog": `query LicensingCatalog($cursor: String) {
		licenses(limit: 200, cursor: $cursor) {
			items {
				id name slug description type version versionName isDefault lifecycleState
				family { id }
				entitlements {
					entitlementSlug entitlementName entitlementType licenseId licenseSlug
					value unlimited limitCapExceededOveragePercent
					entitlement {
						id name slug description type icon unitSingular unitPlural
						saleUnitSingular saleUnitPlural saleUnitFactor userFacing displayOrder
						entitlementGroups { id name slug }
					}
				}
			}
			hasMore nextCursor
		}
	}`,
}

// broadQuery asks for an organization in one document: root lists at the
// default page, with the relations under them expanded. It is not a client's
// document: it is here for complexityLimit to refuse. Nor is it the whole
// schema, so a field added to the schema does not have to be added here.
const broadQuery = `query Organization {
	customers {
		items {
			id name slug externalCustomerId domain integrations createdAt updatedAt
			createdBy { id name }
			updatedBy { id name }
			instances {
				id name slug description status lifecycleStage createdAt updatedAt
				customerId customerSlug licenseId licenseSlug startLicenseDate endLicenseDate
				metadata integrations deploymentZoneId deploymentZoneSlug
				createdBy { id name }
				updatedBy { id name }
				customer { id name slug }
				license {
					id name slug description type version versionName isDefault
					entitlements {
						entitlementSlug entitlementName entitlementType licenseId licenseSlug
						value unlimited limitCapExceededOveragePercent
						entitlement {
							id name slug description type icon unitSingular unitPlural
							saleUnitSingular saleUnitPlural saleUnitFactor userFacing displayOrder
							warningThresholdPercent resetPeriod resetAnchor
							entitlementGroups { id name slug }
						}
					}
				}
				deploymentZone { id name slug description type releaseId createdAt updatedAt }
				entitlementUsage { entitlementSlug licenseSlug value }
				auditTrails {
					items { id eventName eventType instanceId instanceSlug payload timestamp }
					nextCursor hasMore
				}
			}
		}
	}
	releases {
		items {
			id slug version description createdAt
			createdBy { id name }
			components {
				id previousComponentId name version slug description createdAt
				createdBy { id name }
			}
			deploymentZones { id name slug description type releaseId createdAt updatedAt }
			instances { id name slug description deploymentZoneId customer { id name } }
		}
	}
	licenses { items { id name slug description type version versionName isDefault } }
	entitlements {
		items {
			id name slug description type icon unitSingular unitPlural userFacing displayOrder
			entitlementGroups { id name slug }
		}
	}
	organizationAuditTrails {
		items {
			id eventName eventType instanceId instanceSlug instanceName customerName payload
			timestamp
		}
	}
	metadataFields(resourceType: DEPLOYMENT_ZONE) {
		items {
			id resourceType key label jsonSchema displayOrder archivedAt createdAt updatedAt
			createdBy { id name }
			updatedBy { id name }
		}
		nextCursor hasMore
	}
}`
