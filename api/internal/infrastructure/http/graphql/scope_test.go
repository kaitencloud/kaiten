package graphql

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"maps"
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/99designs/gqlgen/graphql"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	gqlparser "github.com/vektah/gqlparser/v2"
	"github.com/vektah/gqlparser/v2/ast"

	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

var (
	readComponents      = scope.Read(scope.Components)
	readCustomers       = scope.Read(scope.Customers)
	readDeploymentZones = scope.Read(scope.DeploymentZones)
	readEntitlements    = scope.Read(scope.Entitlements)
	readInstances       = scope.Read(scope.Instances)
	readLicenses        = scope.Read(scope.Licenses)
	readMetadataFields  = scope.Read(scope.MetadataFields)
	readOrganizations   = scope.Read(scope.Organizations)
	readReleases        = scope.Read(scope.Releases)
)

// TestScopeTablesCoverTheServedSchema states on its own the check gqlgen runs
// when the gate is installed. A gap does not wait for this test: it panics in
// every test, and every process, that builds a server.
func TestScopeTablesCoverTheServedSchema(t *testing.T) {
	t.Parallel()

	require.NoError(t, scopeGate{}.Validate(newExecutableSchema(nil, Config{})))
}

// TestScopeTablesRefuseASchemaTheyDoNotCover is what stops a type, or a root
// field, from being added to the schema without anybody deciding what it takes
// to read it.
func TestScopeTablesRefuseASchemaTheyDoNotCover(t *testing.T) {
	t.Parallel()

	object := func(name string) *ast.Definition {
		return &ast.Definition{Kind: ast.Object, Name: name}
	}
	rootField := func(name, returns string) *ast.FieldDefinition {
		return &ast.FieldDefinition{Name: name, Type: ast.NamedType(returns, nil)}
	}

	cases := []struct {
		name   string
		doctor func(schema *ast.Schema)
		want   string
	}{
		{
			name:   "an object type nobody gave a scope",
			doctor: func(schema *ast.Schema) { schema.Types["Invoice"] = object("Invoice") },
			want:   "type Invoice has no entry in typeScopes",
		},
		{
			name: "a union",
			doctor: func(schema *ast.Schema) {
				schema.Types["SearchResult"] = &ast.Definition{Kind: ast.Union, Name: "SearchResult"}
			},
			want: "type SearchResult is an interface or a union",
		},
		{
			name: "an interface",
			doctor: func(schema *ast.Schema) {
				schema.Types["Node"] = &ast.Definition{Kind: ast.Interface, Name: "Node"}
			},
			want: "type Node is an interface or a union",
		},
		{
			name:   "a mutation",
			doctor: func(schema *ast.Schema) { schema.Mutation = object("Mutation") },
			want:   "the schema has a Mutation or a Subscription type",
		},
		{
			name:   "a subscription",
			doctor: func(schema *ast.Schema) { schema.Subscription = object("Subscription") },
			want:   "the schema has a Mutation or a Subscription type",
		},
		{
			// A count is a scalar, so no type would ever ask for a scope on it.
			name: "a root field that returns a scalar",
			doctor: func(schema *ast.Schema) {
				schema.Query.Fields = append(schema.Query.Fields, rootField("customerCount", "Int"))
			},
			want: "Query.customerCount returns Int, which requires no scope",
		},
		{
			name: "a root field that returns an unscoped type",
			doctor: func(schema *ast.Schema) {
				schema.Query.Fields = append(schema.Query.Fields, rootField("me", "User"))
			},
			want: "Query.me returns User, which requires no scope",
		},
		{
			name:   "a scoped type the schema no longer has",
			doctor: func(schema *ast.Schema) { delete(schema.Types, "Customer") },
			want:   "typeScopes names Customer, which is not an object type of the schema",
		},
		{
			name:   "an unscoped type the schema no longer has",
			doctor: func(schema *ast.Schema) { delete(schema.Types, "User") },
			want:   "unscopedTypes names User, which is not an object type of the schema",
		},
		{
			name: "a public root field the schema no longer has",
			doctor: func(schema *ast.Schema) {
				schema.Query.Fields = slices.DeleteFunc(schema.Query.Fields, func(field *ast.FieldDefinition) bool {
					return field.Name == "_health"
				})
			},
			want: "publicRootFields names _health, which is not a field of Query",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			schema := copyOfServedSchema()
			tc.doctor(schema)

			require.ErrorContains(t, checkScopeTables(schema), tc.want)
		})
	}
}

// TestGraphQLAnswersAMissingScopeWithTheProblemRESTReturns pins the shape of the
// refusal: the status, the media type and every member of the body are the ones
// a REST operation answers a missing scope with. Only `instance` differs, and
// only because it names the route.
func TestGraphQLAnswersAMissingScopeWithTheProblemRESTReturns(t *testing.T) {
	t.Parallel()

	app := newScopedTestApp(t, readLicenses)

	status, header, body := postGraphQLRaw(t, app, map[string]any{"query": `{ customers { items { id } } }`})

	require.Equal(t, http.StatusForbidden, status, string(body))
	// One media type, and the problem's: gqlgen set its own before the response
	// was replaced, and none of it may be left.
	require.Equal(t, []string{"application/problem+json"}, header.Values(fiber.HeaderContentType))

	var problem apierrors.Problem
	require.NoError(t, json.Unmarshal(body, &problem))
	require.Equal(t, apierrors.Problem{
		Type:     apierrors.TypeForbidden,
		Title:    http.StatusText(http.StatusForbidden),
		Status:   http.StatusForbidden,
		Detail:   scope.MissingScopeMessage(readCustomers),
		Instance: "/graphql",
		Code:     scope.ErrCodeMissingScope,
	}, problem)

	// The same document the facade's own refusal renders as: the body is the
	// problem of the error caller.Require returns, and nothing GraphQL-shaped is
	// left of the response gqlgen wrote before it was replaced.
	refusal := caller.Static(uuid.New(), uuid.New(), []string{readLicenses}).Require(readCustomers)
	want, err := json.Marshal(apierrors.ProblemFrom(refusal, "/graphql"))
	require.NoError(t, err)
	require.JSONEq(t, string(want), string(body))
	require.NotContains(t, string(body), `"errors"`)
	require.NotContains(t, string(body), `"data"`)
}

// TestEveryScopedFieldIsRefusedWithoutItsScope asks the gate about the schema
// rather than about a list: every field that returns a scoped type is selected
// through the real route by a caller holding every read scope but that one, and
// must be refused for exactly that one.
//
// The pool is nil, so a document the gate let through would not come back as a
// refusal at all -- which makes each case a proof that nothing ran as well.
func TestEveryScopedFieldIsRefusedWithoutItsScope(t *testing.T) {
	t.Parallel()

	schema := newExecutableSchema(nil, Config{}).Schema()
	paths := pathsFromQuery(schema)

	checked := 0
	for _, owner := range schema.Types {
		if owner.Kind != ast.Object || isIntrospection(owner.Name) {
			continue
		}

		for _, field := range owner.Fields {
			required, scoped := typeScopes[field.Type.Name()]
			if !scoped {
				continue
			}
			checked++

			t.Run(owner.Name+"."+field.Name, func(t *testing.T) {
				t.Parallel()

				path, reachable := paths[owner.Name]
				require.True(t, reachable, "%s cannot be reached from Query, so nothing here can select its fields", owner.Name)

				document := probeDocument(schema, append(slices.Clone(path), field))
				app := newScopedTestApp(t, readScopesExcept(required)...)

				status, _, body := postGraphQLRaw(t, app, map[string]any{"query": document})

				require.Equal(t, http.StatusForbidden, status, "%s\n%s", document, body)

				var problem apierrors.Problem
				require.NoError(t, json.Unmarshal(body, &problem))
				require.Equal(t, scope.ErrCodeMissingScope, problem.Code, document)
				require.Equal(t, scope.MissingScopeMessage(required), problem.Detail, document)
			})
		}
	}

	require.Len(t, fieldScopes(schema), checked, "the walk and fieldScopes must agree on what is scoped")
	require.Greater(t, checked, len(typeScopes),
		"fewer scoped fields than scoped types means the walk stopped matching, not that the schema shrank")
}

// TestRequiredScopesReadsTheWholeOperation pins what the gate reads of a
// document, shape by shape. The order matters as much as the set: the first
// missing scope is the one a caller is told about.
func TestRequiredScopesReadsTheWholeOperation(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		document  string
		operation string
		want      []string
	}{
		{
			name:     "a field that reads nothing",
			document: `{ _health }`,
		},
		{
			name:     "the name of the root type",
			document: `{ __typename }`,
		},
		{
			name:     "introspection",
			document: `{ __schema { types { name fields { name type { name } } } } __type(name: "Customer") { name } }`,
		},
		{
			name:     "a root field",
			document: `{ customers { items { id } } }`,
			want:     []string{readCustomers},
		},
		{
			name:     "an aliased root field",
			document: `{ mine: customers { items { id } } theirs: licenses { items { id } } }`,
			want:     []string{readCustomers, readLicenses},
		},
		{
			name:     "a relation that opens another resource",
			document: `{ customer(slug: "acme") { name instances { id } } }`,
			want:     []string{readCustomers, readInstances},
		},
		{
			name:     "relations all the way down, in the order the document needs them",
			document: `{ licenses { items { instances { customer { name } deploymentZone { name } } entitlements { entitlement { name } } } } }`,
			want:     []string{readLicenses, readInstances, readCustomers, readDeploymentZones, readEntitlements},
		},
		{
			name:     "several types under one scope",
			document: `{ instances { items { auditTrails { items { id } } entitlementUsage { entitlementSlug } } } }`,
			want:     []string{readInstances},
		},
		{
			name:     "who created a value is part of the value",
			document: `{ customers { items { createdBy { name } updatedBy { name } } } }`,
			want:     []string{readCustomers},
		},
		{
			name:     "the organization-wide audit trail",
			document: `{ organizationAuditTrails { items { eventName } } }`,
			want:     []string{readOrganizations},
		},
		{
			name: "a fragment",
			document: `query { customer(slug: "acme") { ...Owned } }
				fragment Owned on Customer { instances { license { name } } }`,
			want: []string{readCustomers, readInstances, readLicenses},
		},
		{
			name: "a fragment inside a fragment, spread more than once",
			document: `query { customers { items { ...Owned } } customer(slug: "acme") { ...Owned } }
				fragment Owned on Customer { instances { ...Licensed } }
				fragment Licensed on Instance { license { name } }`,
			want: []string{readCustomers, readInstances, readLicenses},
		},
		{
			name:     "an inline fragment, with and without a type condition",
			document: `{ customer(slug: "acme") { ... on Customer { instances { id } } ... { createdBy { name } } } }`,
			want:     []string{readCustomers, readInstances},
		},
		{
			// A directive decides what runs, not what the document names.
			name:     "a field a directive would skip",
			document: `{ licenses { items { id instances @skip(if: true) { id } } } }`,
			want:     []string{readLicenses, readInstances},
		},
		{
			name: "a fragment a variable would leave out",
			document: `query ($with: Boolean!) { licenses { items { id ...Used @include(if: $with) } } }
				fragment Used on License { instances { id } }`,
			want: []string{readLicenses, readInstances},
		},
		{
			// Only the operation that runs is read: the other one is never executed.
			name:      "the operation asked for, in a document holding two",
			document:  `query Ping { _health } query Customers { customers { items { id } } }`,
			operation: "Ping",
		},
		{
			name:      "the other operation of the same document",
			document:  `query Ping { _health } query Customers { customers { items { id } } }`,
			operation: "Customers",
			want:      []string{readCustomers},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			require.Equal(t, tc.want, requiredScopesOf(t, tc.document, tc.operation))
		})
	}
}

// TestClientDocumentsRequireTheseScopes is what each document a known client
// sends costs in scopes. It is a pin, not a rule: it exists so that a change to
// typeScopes shows up here as the list of clients whose tokens it breaks.
func TestClientDocumentsRequireTheseScopes(t *testing.T) {
	t.Parallel()

	// legitimateQueries is read last, so a document it lists under one of
	// sdkDocuments' keys is the one pinned.
	documents := maps.Clone(sdkDocuments)
	maps.Copy(documents, legitimateQueries)

	want := map[string][]string{
		"console/GetInstancesWithRelations": {readInstances, readCustomers, readLicenses},
		"console/GetCustomersWithInstances": {readCustomers, readInstances, readLicenses},
		"console/GetDashboardData":          {readCustomers, readInstances, readLicenses},
		"console/GetCustomers":              {readCustomers},
		"console/GetInstances":              {readInstances, readLicenses},
		"console/GetLicenses":               {readLicenses},
		"console/GetGlobalAuditTrail":       {readOrganizations},
		heaviestClientQuery: {
			readReleases, readComponents, readDeploymentZones, readInstances, readCustomers,
		},
		"console/GetAttioSyncedRecords": {readCustomers, readInstances},
		"console/MetadataFields":        {readMetadataFields},
		"sdk/ComposedLicensingSnapshot": {readCustomers, readInstances, readLicenses},
		"sdk/LicensingCatalog":          {readLicenses, readEntitlements},
		"sdk/LicensingSnapshot":         {readLicenses, readEntitlements, readCustomers, readInstances},
	}

	for name, document := range documents {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			expected, pinned := want[name]
			require.True(t, pinned, "a client document with no scopes pinned: add it to this test")
			require.Equal(t, expected, requiredScopesOf(t, document, ""))
		})
	}

	require.Len(t, want, len(documents), "a pinned document no client sends any more")
}

// TestRequireScopesHonorsWhatAScopeImplies pins that the gate decides with
// caller.Require and nothing of its own: a write scope reads, and a wildcard
// covers, exactly as they do on a REST operation.
func TestRequireScopesHonorsWhatAScopeImplies(t *testing.T) {
	t.Parallel()

	const document = `{ customer(slug: "acme") { instances { id } } }`

	admitted := map[string][]string{
		"the scopes the document requires": {readCustomers, readInstances},
		"every read scope":                 {scope.ReadAll()},
		"every write scope":                {scope.WriteAll()},
		"the write scope of each module":   {scope.Write(scope.Customers), scope.Write(scope.Instances)},
	}
	for name, scopes := range admitted {
		t.Run("admits "+name, func(t *testing.T) {
			t.Parallel()

			require.NoError(t, requireScopes(callerHolding(scopes...), operationOf(t, document, "")))
		})
	}

	refused := map[string]struct {
		scopes  []string
		missing string
	}{
		"no scope at all":                  {missing: readCustomers},
		"the scope of the root field only": {scopes: []string{readCustomers}, missing: readInstances},
		"the scope of the relation only":   {scopes: []string{readInstances}, missing: readCustomers},
		"scopes on other modules":          {scopes: []string{readLicenses, scope.Write(scope.Releases)}, missing: readCustomers},
	}
	for name, tc := range refused {
		t.Run("refuses "+name, func(t *testing.T) {
			t.Parallel()

			err := requireScopes(callerHolding(tc.scopes...), operationOf(t, document, ""))

			require.True(t, apierrors.IsForbidden(err), "%v", err)
			require.Equal(t, scope.ErrCodeMissingScope, apierrors.GetCode(err))
			require.EqualError(t, err, scope.MissingScopeMessage(tc.missing))
		})
	}
}

// TestDocumentsThatReadNothingNeedNoScope is the floor under the gate: what a
// caller holding no scope at all is still answered.
func TestDocumentsThatReadNothingNeedNoScope(t *testing.T) {
	t.Parallel()

	app := newScopedTestApp(t)

	require.JSONEq(t, `{"data":{"_health":"ok"}}`, postGraphQL(t, app, map[string]any{"query": `{ _health }`}))
	require.JSONEq(t, `{"data":{"__typename":"Query"}}`, postGraphQL(t, app, map[string]any{"query": `{ __typename }`}))
}

// TestScopeGateAnswersAfterValidationAndTheComplexityLimit pins the order a
// request that is wrong twice is answered in: for what the document is, before
// for who sent it. A REST operation answers in the same order -- an under-scoped
// caller sending an invalid body is told about the body.
func TestScopeGateAnswersAfterValidationAndTheComplexityLimit(t *testing.T) {
	t.Parallel()

	app := newScopedTestApp(t)

	t.Run("a document that does not validate", func(t *testing.T) {
		t.Parallel()

		status, _, body := postGraphQLRaw(t, app, map[string]any{"query": `{ customers { items { nope } } }`})

		require.NotEqual(t, http.StatusForbidden, status, string(body))
		require.Contains(t, string(body), "GRAPHQL_VALIDATION_FAILED")
	})

	t.Run("a document over the complexity limit", func(t *testing.T) {
		t.Parallel()

		status, _, body := postGraphQLRaw(t, app, map[string]any{"query": cyclicQuery(3)})

		require.NotEqual(t, http.StatusForbidden, status, string(body))
		require.Contains(t, string(body), "COMPLEXITY_LIMIT_EXCEEDED")
	})

	t.Run("the same shape under the limit", func(t *testing.T) {
		t.Parallel()

		status, _, body := postGraphQLRaw(t, app, map[string]any{"query": cyclicQuery(1)})

		require.Equal(t, http.StatusForbidden, status, string(body))
		require.Contains(t, string(body), scope.MissingScopeMessage(readInstances))
	})
}

// TestScopeGateCoversEveryWayADocumentArrives: the gate hangs off the operation
// gqlgen is about to run, not off a transport, so neither a GET nor a persisted
// query is a way around it.
func TestScopeGateCoversEveryWayADocumentArrives(t *testing.T) {
	t.Parallel()

	const document = `{ customers { items { id } } }`

	t.Run("a GET", func(t *testing.T) {
		t.Parallel()

		app := newScopedTestApp(t, readLicenses)

		req := httptest.NewRequest(http.MethodGet, "/graphql?query="+url.QueryEscape(document), nil)
		status, header, body := do(t, app, req)

		require.Equal(t, http.StatusForbidden, status, string(body))
		require.Equal(t, "application/problem+json", header.Get(fiber.HeaderContentType))
		require.Contains(t, string(body), scope.MissingScopeMessage(readCustomers))
	})

	// gqlgen answers this media type with statuses of its own; the refusal is
	// still the problem, under its own media type.
	t.Run("a POST asking for application/graphql-response+json", func(t *testing.T) {
		t.Parallel()

		app := newScopedTestApp(t, readLicenses)

		encoded, err := json.Marshal(map[string]any{"query": document})
		require.NoError(t, err)
		req := httptest.NewRequest(http.MethodPost, "/graphql", bytes.NewReader(encoded))
		req.Header.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
		req.Header.Set(fiber.HeaderAccept, "application/graphql-response+json")
		status, header, body := do(t, app, req)

		require.Equal(t, http.StatusForbidden, status, string(body))
		require.Equal(t, []string{"application/problem+json"}, header.Values(fiber.HeaderContentType))
		require.Contains(t, string(body), scope.MissingScopeMessage(readCustomers))
	})

	t.Run("a persisted query, sent by its hash alone", func(t *testing.T) {
		t.Parallel()

		app := newScopedTestApp(t, readLicenses)
		sum := sha256.Sum256([]byte(document))
		extensions := persistedQueryExtension(hex.EncodeToString(sum[:]))

		// Registering is not reading: the document is stored before it is parsed,
		// and refused once it is.
		status, _, body := postGraphQLRaw(t, app, map[string]any{"query": document, "extensions": extensions})
		require.Equal(t, http.StatusForbidden, status, string(body))

		status, _, body = postGraphQLRaw(t, app, map[string]any{"extensions": extensions})
		require.Equal(t, http.StatusForbidden, status, string(body))
		require.Contains(t, string(body), scope.MissingScopeMessage(readCustomers))
	})
}

// TestScopeGateRefusesAnOperationWithNoCallerToCheck: a server handed a request
// by anything but graphqlHandler has no caller in its context, and serves
// nothing rather than everything.
func TestScopeGateRefusesAnOperationWithNoCallerToCheck(t *testing.T) {
	t.Parallel()

	opCtx := &graphql.OperationContext{Operation: operationOf(t, `{ _health }`, "")}

	err := scopeGate{}.MutateOperationContext(context.Background(), opCtx)

	require.NotNil(t, err)
	require.ErrorIs(t, err, errNoScopeCheck)
}

// TestUnreadableSelectionIsRefused: a field the gate cannot attribute to a type
// is a field it has not checked, so it refuses the operation instead of reading
// past it. Validation never lets such a document through; this is what happens
// if something else one day does.
func TestUnreadableSelectionIsRefused(t *testing.T) {
	t.Parallel()

	unresolved := &ast.OperationDefinition{
		Operation:    ast.Query,
		SelectionSet: ast.SelectionSet{&ast.Field{Name: "customers"}},
	}
	_, err := requiredScopes(unresolved)
	require.ErrorIs(t, err, errUnreadableSelection)

	dangling := &ast.OperationDefinition{
		Operation:    ast.Query,
		SelectionSet: ast.SelectionSet{&ast.FragmentSpread{Name: "Gone"}},
	}
	_, err = requiredScopes(dangling)
	require.ErrorIs(t, err, errUnreadableSelection)
}

// sdkDocuments are the two documents @kaitencloud/client sends, copied from it.
//
// What they take to pass the gate is what a token for the SDK has to carry, so
// it is pinned here for as long as legitimateQueries does not list them. Once
// it does, under these keys, its copies are the ones read and these can go.
var sdkDocuments = map[string]string{
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
			hasMore
			nextCursor
		}
	}`,
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

// newScopedTestApp is newTestApp for a caller holding exactly scopes.
func newScopedTestApp(t *testing.T, scopes ...string) *fiber.App {
	t.Helper()

	return newTestAppWithPrincipal(t, Config{}, &principal.Principal{
		Kind:           principal.KindOrganization,
		UserID:         uuid.New(),
		OrganizationID: uuid.New(),
		Scopes:         scopes,
	})
}

func callerHolding(scopes ...string) caller.OrganizationCaller {
	return caller.Static(uuid.New(), uuid.New(), scopes)
}

// readScopesExcept is every read scope an organization credential can carry,
// less one: the caller best placed to be let through by mistake.
func readScopesExcept(excluded string) []string {
	var scopes []string
	for _, module := range scope.OrganizationModules() {
		if read := scope.Read(module); read != excluded {
			scopes = append(scopes, read)
		}
	}

	return scopes
}

// postGraphQLRaw is postGraphQL without the assumption that the answer is a 200.
func postGraphQLRaw(t *testing.T, app *fiber.App, payload map[string]any) (int, http.Header, []byte) {
	t.Helper()

	encoded, err := json.Marshal(payload)
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/graphql", bytes.NewReader(encoded))
	req.Header.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)

	return do(t, app, req)
}

func do(t *testing.T, app *fiber.App, req *http.Request) (int, http.Header, []byte) {
	t.Helper()

	resp, err := app.Test(req)
	require.NoError(t, err)
	defer func() { assert.NoError(t, resp.Body.Close()) }()

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	return resp.StatusCode, resp.Header, body
}

// operationOf parses and validates document against the served schema, the way
// gqlgen does before the gate sees it, and returns the operation that would run.
func operationOf(t *testing.T, document, name string) *ast.OperationDefinition {
	t.Helper()

	doc, errs := gqlparser.LoadQueryWithRules(newExecutableSchema(nil, Config{}).Schema(), document, nil)
	require.Empty(t, errs, "the document must be valid against the schema")

	operation := doc.Operations.ForName(name)
	require.NotNil(t, operation, "no operation named %q", name)

	return operation
}

func requiredScopesOf(t *testing.T, document, name string) []string {
	t.Helper()

	scopes, err := requiredScopes(operationOf(t, document, name))
	require.NoError(t, err)

	return scopes
}

// copyOfServedSchema copies as much of the served schema as checkScopeTables
// reads, so a test can doctor it without touching the one every other test --
// and the server -- shares.
func copyOfServedSchema() *ast.Schema {
	served := newExecutableSchema(nil, Config{}).Schema()

	query := *served.Query
	query.Fields = slices.Clone(served.Query.Fields)

	schema := &ast.Schema{Query: &query, Types: maps.Clone(served.Types)}
	schema.Types[query.Name] = &query

	return schema
}

// pathsFromQuery finds, for every object type that can be reached from Query,
// the shortest chain of fields leading to it.
func pathsFromQuery(schema *ast.Schema) map[string][]*ast.FieldDefinition {
	paths := map[string][]*ast.FieldDefinition{schema.Query.Name: nil}

	for queue := []*ast.Definition{schema.Query}; len(queue) > 0; queue = queue[1:] {
		owner := queue[0]

		for _, field := range owner.Fields {
			target := schema.Types[field.Type.Name()]
			if target == nil || target.Kind != ast.Object || isIntrospection(target.Name) {
				continue
			}
			if _, found := paths[target.Name]; found {
				continue
			}

			paths[target.Name] = append(slices.Clone(paths[owner.Name]), field)
			queue = append(queue, target)
		}
	}

	return paths
}

// probeDocument selects path, one field inside the other, with the arguments
// each cannot be selected without and nothing else.
func probeDocument(schema *ast.Schema, path []*ast.FieldDefinition) string {
	var document strings.Builder

	document.WriteString("{ ")
	for _, field := range path {
		document.WriteString(field.Name)
		document.WriteString(probeArguments(schema, field))
		document.WriteString(" { ")
	}
	document.WriteString("__typename")
	document.WriteString(strings.Repeat(" }", len(path)+1))

	return document.String()
}

// probeArguments writes probeArgs as the argument list of a document.
func probeArguments(schema *ast.Schema, field *ast.FieldDefinition) string {
	args := probeArgs(schema, field)
	if len(args) == 0 {
		return ""
	}

	literals := make([]string, 0, len(args))
	for _, name := range slices.Sorted(maps.Keys(args)) {
		literal := ""
		switch value := args[name].(type) {
		case int:
			literal = strconv.Itoa(value)
		case bool:
			literal = strconv.FormatBool(value)
		case string:
			literal = strconv.Quote(value)
			// An enum value is written bare.
			if def := schema.Types[field.Arguments.ForName(name).Type.Name()]; def != nil && def.Kind == ast.Enum {
				literal = value
			}
		}
		literals = append(literals, name+": "+literal)
	}

	return "(" + strings.Join(literals, ", ") + ")"
}
