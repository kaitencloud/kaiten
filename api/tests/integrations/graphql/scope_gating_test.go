package graphql_test

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	gqlparser "github.com/vektah/gqlparser/v2"
	"github.com/vektah/gqlparser/v2/ast"

	kaitengraphql "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/generated"
	metadatafieldsdb "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

var (
	readCustomers = scope.Read(scope.Customers)
	readInstances = scope.Read(scope.Instances)
	readLicenses  = scope.Read(scope.Licenses)
)

// TestGraphQL_ScopeGating is the GraphQL counterpart of the REST scope-gating
// suites: what a credential holding some scopes and not others is served, end to
// end, against a real database.
//
// The package-level testServer holds every scope, so each case here runs against
// a server of its own whose principal holds exactly the scopes named.
func TestGraphQL_ScopeGating(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	customer := newCustomer(t, "Scope Gating Customer")
	license := newLicense(t, "Scope Gating License")
	instance := newInstance(t, "Scope Gating Instance", customer, license)

	t.Run("a token holding read:licenses alone", func(t *testing.T) {
		server := scopedServer(t, readLicenses)

		t.Run("reads licenses", func(t *testing.T) {
			answer := sendGraphQL(t, server, `{ licenses { items { slug } } }`, nil)

			var data struct {
				Licenses struct {
					Items []struct {
						Slug string `json:"slug"`
					} `json:"items"`
				} `json:"licenses"`
			}
			answer.decodeData(t, &data)

			require.Len(t, data.Licenses.Items, 1)
			assert.Equal(t, license.Slug, data.Licenses.Items[0].Slug)
		})

		t.Run("does not read customers", func(t *testing.T) {
			answer := sendGraphQL(t, server, `{ customers { items { slug } } }`, nil)

			answer.requireMissingScope(t, readCustomers)
		})

		t.Run("does not read a customer's instances", func(t *testing.T) {
			answer := sendGraphQL(t, server,
				`query ($slug: String!) { customer(slug: $slug) { instances { slug } } }`,
				map[string]any{"slug": customer.Slug})

			answer.requireMissingScope(t, readCustomers)
		})

		// Not a partial answer: the document is refused as a whole, so the
		// licenses this token may read are not in the response either.
		t.Run("is refused a document that also selects what it may read", func(t *testing.T) {
			answer := sendGraphQL(t, server, `{ licenses { items { slug } } customers { items { slug } } }`, nil)

			answer.requireMissingScope(t, readCustomers)
			assert.NotContains(t, string(answer.body), license.Slug)
		})
	})

	// The relation is what is refused here, not the root field: this token reads
	// the customer, and a customer's instances are another resource.
	t.Run("a token holding read:customers alone", func(t *testing.T) {
		server := scopedServer(t, readCustomers)
		variables := map[string]any{"slug": customer.Slug}

		t.Run("reads a customer", func(t *testing.T) {
			answer := sendGraphQL(t, server,
				`query ($slug: String!) { customer(slug: $slug) { name integrations createdBy { name } } }`, variables)

			var data struct {
				Customer struct {
					Name string `json:"name"`
				} `json:"customer"`
			}
			answer.decodeData(t, &data)

			assert.Equal(t, customer.Name, data.Customer.Name)
		})

		t.Run("does not read that customer's instances", func(t *testing.T) {
			answer := sendGraphQL(t, server,
				`query ($slug: String!) { customer(slug: $slug) { name instances { slug } } }`, variables)

			answer.requireMissingScope(t, readInstances)
			assert.NotContains(t, string(answer.body), instance.Slug)
		})
	})

	t.Run("a token holding both reads the customer and its instances", func(t *testing.T) {
		server := scopedServer(t, readCustomers, readInstances)

		answer := sendGraphQL(t, server,
			`query ($slug: String!) { customer(slug: $slug) { instances { slug } } }`,
			map[string]any{"slug": customer.Slug})

		var data struct {
			Customer struct {
				Instances []struct {
					Slug string `json:"slug"`
				} `json:"instances"`
			} `json:"customer"`
		}
		answer.decodeData(t, &data)

		require.Len(t, data.Customer.Instances, 1)
		assert.Equal(t, instance.Slug, data.Customer.Instances[0].Slug)
	})

	// write:<module> implies read:<module> on a REST operation, so it does here.
	t.Run("a token holding write:customers reads customers", func(t *testing.T) {
		server := scopedServer(t, scope.Write(scope.Customers))

		answer := sendGraphQL(t, server, `{ customers { items { slug } } }`, nil)

		var data struct {
			Customers struct {
				Items []struct {
					Slug string `json:"slug"`
				} `json:"items"`
			} `json:"customers"`
		}
		answer.decodeData(t, &data)

		require.Len(t, data.Customers.Items, 1)
	})
}

// TestGraphQL_MissingScopeIsTheProblemRESTAnswers puts the two surfaces side by
// side: the same credential, asking for the same resource, is refused by
// /api/graphql with the response /api/customers refuses it with -- the status,
// the media type and the whole body. `instance` names the route, and is the one
// member that differs.
func TestGraphQL_MissingScopeIsTheProblemRESTAnswers(t *testing.T) {
	server := scopedServer(t, readLicenses)

	request := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/customers", nil)
	response, err := server.App.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	restBody, err := io.ReadAll(response.Body)
	require.NoError(t, err)
	require.Equal(t, http.StatusForbidden, response.StatusCode, string(restBody))

	var fromREST apierrors.Problem
	require.NoError(t, json.Unmarshal(restBody, &fromREST))
	require.Equal(t, "/api/customers", fromREST.Instance)

	answer := sendGraphQL(t, server, `{ customers { items { slug } } }`, nil)

	var fromGraphQL apierrors.Problem
	require.NoError(t, json.Unmarshal(answer.body, &fromGraphQL))

	assert.Equal(t, response.StatusCode, answer.status)
	assert.Equal(t, response.Header.Get(fiber.HeaderContentType), answer.contentType)
	assert.Equal(t, "/api/graphql", fromGraphQL.Instance)

	fromGraphQL.Instance = fromREST.Instance
	assert.Equal(t, fromREST, fromGraphQL)

	// And spelled out, so the comparison above cannot pass on two empty bodies.
	assert.Equal(t, http.StatusForbidden, fromGraphQL.Status)
	assert.Equal(t, scope.ErrCodeMissingScope, fromGraphQL.Code)
	assert.Equal(t, scope.MissingScopeMessage(readCustomers), fromGraphQL.Detail)
}

// TestGraphQL_ServiceTokenIsHeldToItsScopes replays the defect the gate closes with
// a real credential and the production authenticator, where every other case here
// stubs the principal: a `ksh_` token minted with read:licenses alone, exchanged
// the way the gateway exchanges it, read every customer of its organization
// through /api/graphql while /api/customers refused it.
func TestGraphQL_ServiceTokenIsHeldToItsScopes(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	newCustomer(t, "Service Token Customer")
	license := newLicense(t, "Service Token License")

	// Minted through the API, by a caller allowed to: a service account, then a
	// token on it that carries one scope.
	account := postREST[struct {
		Slug string `json:"slug"`
	}](t, testServer, "/api/service-accounts", map[string]any{"name": "Catalog reader"}, nil)
	minted := postREST[struct {
		Value string `json:"token"`
	}](t, testServer, "/api/service-accounts/"+account.Slug+"/tokens",
		map[string]any{"name": "catalog", "scopes": []string{readLicenses}}, nil)
	require.True(t, strings.HasPrefix(minted.Value, "ksh_"), "expected a service token")

	server := tests.NewTestServer(testDb, tests.TestServerOptions{UseJWTAuth: true})
	t.Cleanup(func() { require.NoError(t, server.Close()) })

	// The gateway's half: ext_authz trades the token for the internal JWT and
	// forwards the request with it.
	exchange := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/tokens/validate", nil,
		map[string]string{fiber.HeaderAuthorization: "Bearer " + minted.Value})
	exchanged, err := server.App.Test(exchange, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, exchanged.Body)
	require.Equal(t, http.StatusOK, exchanged.StatusCode)

	authorization := map[string]string{fiber.HeaderAuthorization: exchanged.Header.Get(fiber.HeaderAuthorization)}
	require.NotEmpty(t, authorization[fiber.HeaderAuthorization], "the exchange must hand back a credential")

	t.Run("it reads licenses", func(t *testing.T) {
		answer := sendGraphQL(t, server, `{ licenses { items { slug } } }`, nil, authorization)

		var data struct {
			Licenses struct {
				Items []struct {
					Slug string `json:"slug"`
				} `json:"items"`
			} `json:"licenses"`
		}
		answer.decodeData(t, &data)

		require.Len(t, data.Licenses.Items, 1)
		assert.Equal(t, license.Slug, data.Licenses.Items[0].Slug)
	})

	t.Run("it is refused customers, as REST refuses it", func(t *testing.T) {
		answer := sendGraphQL(t, server, `{ customers { items { slug name } } }`, nil, authorization)
		answer.requireMissingScope(t, readCustomers)

		request := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/customers", nil, authorization)
		response, err := server.App.Test(request, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, response.Body)
		require.Equal(t, http.StatusForbidden, response.StatusCode)
	})
}

// TestGraphQL_RefusedDocumentReadsNothing: a refusal comes before any resolver,
// so nothing is read and nothing is metered -- not even the part of the document
// the credential could have read on its own.
func TestGraphQL_RefusedDocumentReadsNothing(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	newLicense(t, "Unread License")

	reporter := &recordingUsageReporter{}
	server := tests.NewTestServer(testDb, tests.TestServerOptions{
		Scopes:        []string{readLicenses},
		UsageReporter: reporter,
	})
	t.Cleanup(func() { require.NoError(t, server.Close()) })

	answer := sendGraphQL(t, server, `{ licenses { items { slug } } customers { items { slug } } }`, nil)
	answer.requireMissingScope(t, readCustomers)
	require.Empty(t, reporter.drain(), "a refused document must not have read the licenses it names")

	// The control: the same reporter does record the read once it happens.
	answer = sendGraphQL(t, server, `{ licenses { items { slug } } }`, nil)
	answer.decodeData(t, &struct{}{})
	require.Equal(t, []string{"licenses-read"}, reporter.drain())
}

// TestGraphQL_EveryReadScopeReadsEverything is the other end of the gate: a
// credential holding the read scope of every module is refused nothing. The
// documents below select every root field and every relation between two
// resources, over rows that exist, so each resolver behind them runs.
func TestGraphQL_EveryReadScopeReadsEverything(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	customer := newCustomer(t, "Read Everything Customer")
	license := newLicense(t, "Read Everything License")
	entitlement := newPresentedEntitlement(t, "read-everything-seats", 10)
	associateNumberEntitlement(t, license.Slug, entitlement.Slug, 10)
	newGroupWithMember(t, "read-everything-group", entitlement.Slug)
	zone := newDeploymentZone(t, "Read Everything Zone", "production")
	instance := newInstanceInDeploymentZone(t, "Read Everything Instance", customer, license, zone)
	release := newReleaseWithComponents(t, "v9.9.9", []string{"read-everything-api"})
	newDeployment(t, zone, release)
	newMetadataField(t, "region")

	var readScopes []string
	for _, module := range scope.OrganizationModules() {
		readScopes = append(readScopes, scope.Read(module))
	}
	server := scopedServer(t, readScopes...)

	variables := map[string]any{
		"customer":  customer.Slug,
		"license":   license.Slug,
		"instance":  instance.Slug,
		"zone":      zone.Slug,
		"release":   release.Slug,
		"component": release.Components[0].Slug,
	}

	documents := map[string]string{
		"customers": `query ($customer: String!) {
			_health
			customers(limit: 5) {
				items {
					slug integrations createdBy { name } updatedBy { name }
					instances {
						slug integrations
						customer { slug }
						license { slug }
						deploymentZone { slug }
						entitlementUsage { entitlementSlug value limit }
					}
				}
			}
			customer(slug: $customer) { slug }
		}`,
		"instances": `query ($instance: String!) {
			instances(limit: 5) {
				items {
					slug
					auditTrails(limit: 5) { items { id payload } }
					billing { status }
					addons { addonSlug }
				}
			}
			instance(slug: $instance) { slug }
			auditTrails(instanceSlug: $instance, limit: 5) { items { id payload } }
			organizationAuditTrails(limit: 5) { items { id payload } }
		}`,
		"licenses": `query ($license: String!) {
			licenses(limit: 5) {
				items {
					slug
					family { slug }
					instances { slug }
					prices { id }
					entitlements {
						entitlementSlug value unlimited
						entitlement { slug entitlementGroups { slug } }
					}
				}
			}
			license(slug: $license) { slug }
			licenseFamily(slug: $license) { slug currentVersion { slug } versions { slug } }
			entitlements(limit: 5) { items { slug entitlementGroups { slug } } }
		}`,
		"releases": `query ($release: String!, $component: String!, $zone: String!) {
			releases(limit: 5) {
				items {
					slug
					components { slug }
					deploymentZones { slug }
					instances { slug }
					deployments { id }
				}
			}
			release(slug: $release) { slug }
			components(limit: 5) { items { slug createdBy { name } } }
			component(slug: $component) { slug }
			deploymentZones(limit: 5) { items { slug } }
			deploymentZone(slug: $zone) { slug }
			metadataFields(resourceType: INSTANCE) { items { key } }
		}`,
	}

	schema := generated.NewExecutableSchema(generated.Config{}).Schema()
	selected := map[string]bool{}

	for name, document := range documents {
		parsed, errs := gqlparser.LoadQueryWithRules(schema, document, nil)
		require.Empty(t, errs, "the %s document must be valid against the schema", name)
		operation := parsed.Operations[0]
		collectSelectedFields(operation.SelectionSet, selected)

		t.Run(name, func(t *testing.T) {
			sent := map[string]any{}
			for _, variable := range operation.VariableDefinitions {
				sent[variable.Variable] = variables[variable.Variable]
			}

			answer := sendGraphQL(t, server, document, sent)

			var data map[string]json.RawMessage
			answer.decodeData(t, &data)
			for field, value := range data {
				assert.NotEqual(t, "null", string(value), "%s came back null", field)
			}
		})
	}

	// "Everything" is a claim about the schema, so it is checked against the
	// schema: a root field or a relation added later fails here until one of the
	// documents above selects it.
	for _, field := range schema.Query.Fields {
		if strings.HasPrefix(field.Name, "__") {
			continue
		}
		assert.True(t, selected["Query."+field.Name], "no document above selects Query.%s", field.Name)
	}
	for field := range kaitengraphql.FieldScopes() {
		assert.True(t, selected[field], "no document above selects %s, which requires a scope", field)
	}
}

// collectSelectedFields records every field set selects, as "<Type>.<field>".
func collectSelectedFields(set ast.SelectionSet, selected map[string]bool) {
	for _, selection := range set {
		field, ok := selection.(*ast.Field)
		if !ok || field.ObjectDefinition == nil {
			continue
		}
		selected[field.ObjectDefinition.Name+"."+field.Name] = true
		collectSelectedFields(field.SelectionSet, selected)
	}
}

// scopedServer is a test server whose principal holds exactly scopes. It is
// closed with the test that asked for it: each server holds database
// connections of its own for as long as it lives.
func scopedServer(t *testing.T, scopes ...string) *tests.TestServer {
	t.Helper()

	// An empty list means every scope to the stub, which is the opposite of what
	// a caller passing none would expect.
	require.NotEmpty(t, scopes, "scopedServer needs at least one scope")

	server := tests.NewTestServer(testDb, tests.TestServerOptions{Scopes: scopes})
	t.Cleanup(func() { require.NoError(t, server.Close()) })

	return server
}

// postREST posts body to path on server and decodes the 201 it expects.
func postREST[T any](t *testing.T, server *tests.TestServer, path string, body any, headers map[string]string) T {
	t.Helper()

	request := commonfixture.NewJSONRequest(t, http.MethodPost, path, body, headers)
	response, err := server.App.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	return commonfixture.AssertJSONResponse[T](t, response, http.StatusCreated)
}

// graphQLAnswer is a response from /api/graphql, read but not interpreted: a
// refusal by the scope gate is a problem, not a GraphQL envelope.
type graphQLAnswer struct {
	status      int
	contentType string
	body        []byte
}

func sendGraphQL(
	t *testing.T, server *tests.TestServer, query string, variables map[string]any, headers ...map[string]string,
) graphQLAnswer {
	t.Helper()

	payload := map[string]any{"query": query}
	if len(variables) > 0 {
		payload["variables"] = variables
	}

	request := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/graphql", payload, headers...)
	response, err := server.App.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	body, err := io.ReadAll(response.Body)
	require.NoError(t, err)

	return graphQLAnswer{
		status:      response.StatusCode,
		contentType: response.Header.Get(fiber.HeaderContentType),
		body:        body,
	}
}

// decodeData requires the answer to be a GraphQL response with no error, and
// decodes its data into target.
func (a graphQLAnswer) decodeData(t *testing.T, target any) {
	t.Helper()

	require.Equal(t, http.StatusOK, a.status, string(a.body))

	var envelope graphQLResponse
	require.NoError(t, json.Unmarshal(a.body, &envelope))
	require.Empty(t, envelope.Errors, string(a.body))
	require.NoError(t, json.Unmarshal(envelope.Data, target))
}

// requireMissingScope requires the answer to be the refusal a REST operation
// gives a caller that lacks required.
func (a graphQLAnswer) requireMissingScope(t *testing.T, required string) {
	t.Helper()

	require.Equal(t, http.StatusForbidden, a.status, string(a.body))
	require.Equal(t, "application/problem+json", a.contentType)

	var problem apierrors.Problem
	require.NoError(t, json.Unmarshal(a.body, &problem))
	require.Equal(t, apierrors.Problem{
		Type:     apierrors.TypeForbidden,
		Title:    http.StatusText(http.StatusForbidden),
		Status:   http.StatusForbidden,
		Detail:   scope.MissingScopeMessage(required),
		Instance: "/api/graphql",
		Code:     scope.ErrCodeMissingScope,
	}, problem)
}

// newMetadataField declares a string metadata field on instances.
func newMetadataField(t *testing.T, key string) {
	t.Helper()

	_, err := metadatafieldsdb.New(testServer.Dependencies.DB).InsertMetadataField(
		t.Context(),
		metadatafieldsdb.InsertMetadataFieldParams{
			OrganizationID: testDb.DefaultData.OrganizationID,
			ResourceType:   metadatafieldsdb.MetadataFieldResourceTypeINSTANCE,
			Key:            key,
			Label:          key,
			JsonSchema:     []byte(`{"type":"string"}`),
			DisplayOrder:   0,
			UserID:         testDb.DefaultData.UserID,
		},
	)
	require.NoError(t, err)
}
