package graphql

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/99designs/gqlgen/graphql"
	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/gqlerror"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/generated"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/listinstanceaddons"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getinstancebilling"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/getcomponent"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/getcomponents"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/getcustomer"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/getcustomers"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/getdeploymentzone"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/getdeploymentzones"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/getentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/getentitlements"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getaudittrails"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getentitlementsusagemetrics"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getinstances"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicenseentitlements"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicensefamily"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicenses"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/listlicenseprices"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/getmetadatafields"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/getrelease"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/getreleases"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

// This file is the scope gate: what makes /graphql require, for a piece of data,
// the scope the REST API requires for it.
//
// The resolvers read each module's rows directly and call no facade method, so
// caller.Require has nowhere to run inside them. It runs in front of them
// instead: once per request, against the operation gqlgen has just parsed and
// validated, and for the whole of it. A request that lacks one scope is refused
// before any resolver has read anything, which is when a REST operation is
// refused too.

// typeScopes is the scope a caller must hold to be served a value of each object
// type in the schema.
//
// The rule it supports is that a field requires the scope of the type it
// returns. It is keyed by type rather than by field because that is what makes
// the rule total: a Customer is only ever reached through a field that returns
// one, so a root field, a relation on another resource, a resolver and a plain
// struct field are all covered by one entry -- and so is the relation somebody
// adds later, by the type it already names.
//
// A value is the RequiredScope of the REST operation that serves the same
// resource, named rather than spelled out, so that GraphQL cannot ask for a
// different scope than REST does. The entries with no such operation say why
// they take the scope they take.
//
// The rule has no exception, which makes it stricter than REST in one place:
// GET /releases returns a release's components under read:releases alone, and
// Release.components requires read:components as well.
var typeScopes = map[string]string{
	"AuditTrail":     getaudittrails.RequiredScope,
	"AuditTrailPage": getaudittrails.RequiredScope,
	"Component":      getcomponent.RequiredScope,
	"ComponentPage":  getcomponents.RequiredScope,
	"Customer":       getcustomer.RequiredScope,
	"CustomerPage":   getcustomers.RequiredScope,
	// No REST operation serves a zone's deployment log. It is part of the zone,
	// and read under the zone's scope.
	"Deployment":         getdeploymentzone.RequiredScope,
	"DeploymentZone":     getdeploymentzone.RequiredScope,
	"DeploymentZonePage": getdeploymentzones.RequiredScope,
	"Entitlement":        getentitlement.RequiredScope,
	// REST returns an entitlement's groups inside the entitlement.
	"EntitlementGroupSummary": getentitlement.RequiredScope,
	"EntitlementPage":         getentitlements.RequiredScope,
	"EntitlementUsage":        getentitlementsusagemetrics.RequiredScope,
	"Instance":                getinstance.RequiredScope,
	"InstanceAddon":           listinstanceaddons.RequiredScope,
	// Billing data: an instance list that selects it needs read:billing too,
	// so the console fetches it in a document of its own (§13.14).
	"InstanceBillingSummary": getinstancebilling.RequiredScope,
	"InstancePage":           getinstances.RequiredScope,
	"License":                getlicense.RequiredScope,
	"LicenseEntitlement":     getlicenseentitlements.RequiredScope,
	"LicenseFamily":          getlicensefamily.RequiredScope,
	"LicenseFamilyView":      getlicensefamily.RequiredScope,
	"LicensePage":            getlicenses.RequiredScope,
	"LicensePrice":           listlicenseprices.RequiredScope,
	"MetadataField":          getmetadatafields.RequiredScope,
	"MetadataFieldPage":      getmetadatafields.RequiredScope,
	// No REST operation serves the organization-wide audit trail. It records
	// every event of the organization, whichever resource the event is about, and
	// an entry's payload is the event itself: the customer that was created, the
	// license that changed. So no single resource's scope stands for it, and the
	// scope it takes is enough to read, through those payloads, what happened to
	// every other resource. It takes the organization's own.
	"OrganizationAuditTrail":     organizationAuditTrailScope,
	"OrganizationAuditTrailPage": organizationAuditTrailScope,
	"Release":                    getrelease.RequiredScope,
	"ReleasePage":                getreleases.RequiredScope,
}

var organizationAuditTrailScope = scope.Read(scope.Organizations)

// unscopedTypes are the object types that require no scope, each with the reason.
// A type is here because it holds nothing of its own to protect, never because
// nobody decided.
var unscopedTypes = map[string]string{
	"User": "the id and name of whoever created or last updated the value it sits on, " +
		"which REST returns inside that value",
}

// publicRootFields are the fields of Query that return no scoped type, and are
// therefore served to a caller holding no scope at all -- each with the reason
// that is acceptable.
var publicRootFields = map[string]string{
	"_health": "answers a constant and reads nothing",
}

// errUnreadableSelection is returned for a selection the gate cannot attribute to
// a type. Validation resolves every field against the schema before the gate
// runs, so this is unreachable for a document gqlgen accepted -- and refused
// rather than skipped if that ever stops being true, because a field the gate
// cannot read is a field it has not checked.
var errUnreadableSelection = errors.New("graphql: a selection reached the scope gate unresolved against the schema")

// errNoScopeCheck is returned when an operation reaches the gate with no caller
// to check: the server was handed a request by something other than
// graphqlHandler, which is the only thing that resolves one.
var errNoScopeCheck = errors.New("graphql: an operation reached the scope gate with no caller to check")

// scopeCheck carries one request through the gate: the caller going in, and the
// refusal, if there is one, coming out.
//
// The refusal comes back out because gqlgen's transports cannot answer it. They
// send every error raised while an operation is prepared as a GraphQL error
// under a 200, and a missing scope is answered with the problem REST returns,
// status included. So the gate records why it refused, and graphqlHandler
// answers.
type scopeCheck struct {
	caller  caller.OrganizationCaller
	refusal error
}

type scopeCheckKey struct{}

func withScopeCheck(ctx context.Context, check *scopeCheck) context.Context {
	return context.WithValue(ctx, scopeCheckKey{}, check)
}

// scopeGate refuses an operation whose caller lacks a scope one of the selected
// fields requires.
//
// It is an operation context mutator, like the complexity limit, for the same
// reason: that hook runs once the document is parsed and validated and before a
// resolver is reached, on every transport and for a persisted query as for an
// inline one. It sees exactly the operation that is about to run, so there is no
// second reading of the request that could disagree with gqlgen's.
type scopeGate struct{}

var _ interface {
	graphql.HandlerExtension
	graphql.OperationContextMutator
} = scopeGate{}

func (scopeGate) ExtensionName() string { return "ScopeGate" }

// Validate refuses to serve a schema the tables above do not account for. gqlgen
// calls it when the extension is installed and panics on an error, so a type
// added without a scope stops the server from being built -- in the first test
// that builds one -- rather than being served to whoever asks.
func (scopeGate) Validate(schema graphql.ExecutableSchema) error {
	return checkScopeTables(schema.Schema())
}

func (scopeGate) MutateOperationContext(ctx context.Context, opCtx *graphql.OperationContext) *gqlerror.Error {
	check, ok := ctx.Value(scopeCheckKey{}).(*scopeCheck)
	if !ok {
		return gqlerror.Wrap(errNoScopeCheck)
	}

	if err := requireScopes(check.caller, opCtx.Operation); err != nil {
		check.refusal = err
		return gqlerror.Wrap(err)
	}

	return nil
}

// requireScopes reports the first scope op requires that cl does not hold, as
// the error caller.Require returns for it: the one a REST operation answers
// with.
func requireScopes(cl caller.OrganizationCaller, op *ast.OperationDefinition) error {
	required, err := requiredScopes(op)
	if err != nil {
		return err
	}

	for _, s := range required {
		if err := cl.Require(s); err != nil {
			return err
		}
	}

	return nil
}

// requiredScopes returns the scopes op requires, each once, in the order the
// document first needs them.
//
// It reads every field the operation names, through every fragment, and takes no
// account of @skip or @include: a field a directive would leave out still needs
// its scope. That is a superset of what will run, and deliberately so -- the
// answer then depends on the document alone, not on the variables sent with it.
func requiredScopes(op *ast.OperationDefinition) ([]string, error) {
	walk := scopeWalk{fragments: map[string]struct{}{}}
	if err := walk.selectionSet(op.SelectionSet); err != nil {
		return nil, err
	}

	return walk.scopes, nil
}

type scopeWalk struct {
	scopes []string
	// fragments is every fragment already walked. A fragment requires the same
	// scopes wherever it is spread, so reading it once is enough -- and is what
	// keeps a document that spreads fragments inside fragments from costing more
	// to read than it is long.
	fragments map[string]struct{}
}

func (w *scopeWalk) selectionSet(set ast.SelectionSet) error {
	for _, selection := range set {
		switch selection := selection.(type) {
		case *ast.Field:
			if selection.Definition == nil || selection.Definition.Type == nil {
				return fmt.Errorf("%w: field %q", errUnreadableSelection, selection.Name)
			}
			if required, scoped := typeScopes[selection.Definition.Type.Name()]; scoped &&
				!slices.Contains(w.scopes, required) {
				w.scopes = append(w.scopes, required)
			}
			if err := w.selectionSet(selection.SelectionSet); err != nil {
				return err
			}

		case *ast.InlineFragment:
			if err := w.selectionSet(selection.SelectionSet); err != nil {
				return err
			}

		case *ast.FragmentSpread:
			if selection.Definition == nil {
				return fmt.Errorf("%w: fragment %q", errUnreadableSelection, selection.Name)
			}
			if _, walked := w.fragments[selection.Name]; walked {
				continue
			}
			w.fragments[selection.Name] = struct{}{}
			if err := w.selectionSet(selection.Definition.SelectionSet); err != nil {
				return err
			}

		default:
			return fmt.Errorf("%w: %T", errUnreadableSelection, selection)
		}
	}

	return nil
}

// checkScopeTables reports everything about schema that typeScopes,
// unscopedTypes and publicRootFields do not account for, and every entry of
// theirs the schema no longer has.
//
// Three shapes are refused outright because the rule has nothing to say about
// them yet: an interface or a union, whose fields return one type and serve
// another; and a Mutation or Subscription type, since every scope here is a read
// scope. Each needs a decision, and this is where adding one asks for it.
func checkScopeTables(schema *ast.Schema) error {
	var problems []string

	if schema.Mutation != nil || schema.Subscription != nil {
		problems = append(problems,
			"the schema has a Mutation or a Subscription type, and the scope gate only knows what a read requires")
	}

	for name, def := range schema.Types {
		if isIntrospection(name) || def == schema.Query {
			continue
		}

		switch def.Kind {
		case ast.Object:
			_, scoped := typeScopes[name]
			_, unscoped := unscopedTypes[name]
			switch {
			case scoped && unscoped:
				problems = append(problems, fmt.Sprintf("type %s is in both typeScopes and unscopedTypes", name))
			case !scoped && !unscoped:
				problems = append(problems, fmt.Sprintf(
					"type %s has no entry in typeScopes: give it the scope of the REST operation serving the "+
						"same resource, or list it in unscopedTypes with the reason it needs none", name))
			}

		case ast.Interface, ast.Union:
			problems = append(problems, fmt.Sprintf(
				"type %s is an interface or a union, which the scope gate has no rule for: a field returning "+
					"it would be checked against %s and serve the types behind it unchecked", name, name))

		case ast.Scalar, ast.Enum, ast.InputObject:
			// Values, not resources: they are read as part of the object holding them.
		}
	}

	if schema.Query != nil {
		for _, field := range schema.Query.Fields {
			if isIntrospection(field.Name) {
				continue
			}

			_, scoped := typeScopes[field.Type.Name()]
			_, public := publicRootFields[field.Name]
			switch {
			case scoped && public:
				problems = append(problems, fmt.Sprintf(
					"Query.%s is in publicRootFields and returns %s, which requires a scope",
					field.Name, field.Type.Name()))
			case !scoped && !public:
				problems = append(problems, fmt.Sprintf(
					"Query.%s returns %s, which requires no scope: return a type that does, or list the field "+
						"in publicRootFields with the reason anyone may read it", field.Name, field.Type.Name()))
			}
		}
	}

	for name, required := range typeScopes {
		if def := schema.Types[name]; def == nil || def.Kind != ast.Object {
			problems = append(problems, fmt.Sprintf("typeScopes names %s, which is not an object type of the schema", name))
		}
		// read:* grants exactly the read scopes, so this asks the scope package
		// what a read scope is instead of taking the string apart here.
		if !scope.IsValidScope(required) || !scope.HasScope([]string{scope.ReadAll()}, required) {
			problems = append(problems, fmt.Sprintf("typeScopes gives %s the scope %q, which is not a read scope", name, required))
		}
	}
	for name := range unscopedTypes {
		if def := schema.Types[name]; def == nil || def.Kind != ast.Object {
			problems = append(problems, fmt.Sprintf("unscopedTypes names %s, which is not an object type of the schema", name))
		}
	}
	for name := range publicRootFields {
		if schema.Query == nil || schema.Query.Fields.ForName(name) == nil {
			problems = append(problems, fmt.Sprintf("publicRootFields names %s, which is not a field of Query", name))
		}
	}

	if len(problems) == 0 {
		return nil
	}

	slices.Sort(problems)
	return fmt.Errorf("graphql: the scope gate does not cover the schema:\n  %s", strings.Join(problems, "\n  "))
}

// isIntrospection reports whether name belongs to GraphQL's own meta-schema,
// which describes the schema and holds no organization's data.
func isIntrospection(name string) bool {
	return strings.HasPrefix(name, "__")
}

// FieldScopes lists every field of the served schema that requires a scope, as
// "<Type>.<field>", with the scope it requires.
//
// It is derived from the schema and typeScopes, never kept beside them, so it
// cannot list a field the gate does not check or miss one it does. Exported for
// tests/architecture, which pins the resolver surface against it.
func FieldScopes() map[string]string {
	return fieldScopes(generated.NewExecutableSchema(generated.Config{}).Schema())
}

func fieldScopes(schema *ast.Schema) map[string]string {
	scopes := map[string]string{}

	for name, def := range schema.Types {
		if def.Kind != ast.Object || isIntrospection(name) {
			continue
		}
		for _, field := range def.Fields {
			if required, scoped := typeScopes[field.Type.Name()]; scoped {
				scopes[name+"."+field.Name] = required
			}
		}
	}

	return scopes
}
