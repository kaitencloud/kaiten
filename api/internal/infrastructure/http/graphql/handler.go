package graphql

import (
	"context"
	"net/http"
	"time"

	"github.com/99designs/gqlgen/graphql"
	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/extension"
	"github.com/99designs/gqlgen/graphql/handler/lru"
	"github.com/99designs/gqlgen/graphql/handler/transport"
	"github.com/99designs/gqlgen/graphql/playground"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/adaptor"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ravilushqa/otelgqlgen"
	"github.com/vektah/gqlparser/v2/ast"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/dataloader"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/generated"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/resolver"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	addonsGraphql "github.com/kaitencloud/kaiten/api/internal/modules/addons/graphql"
	addonsdb "github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	billingGraphql "github.com/kaitencloud/kaiten/api/internal/modules/billing/graphql"
	billingdb "github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/releaselink"
	customersGraphql "github.com/kaitencloud/kaiten/api/internal/modules/customers/graphql"
	customersdb "github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	deploymentzonesGraphql "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/graphql"
	deploymentzonesdb "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
	deploymentzonereleaselink "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/releaselink"
	entitlementsGraphql "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/graphql"
	entitlementsdb "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	instancesGraphql "github.com/kaitencloud/kaiten/api/internal/modules/instances/graphql"
	instancesdb "github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	instancereleaselink "github.com/kaitencloud/kaiten/api/internal/modules/instances/releaselink"
	licensesGraphql "github.com/kaitencloud/kaiten/api/internal/modules/licenses/graphql"
	licensesdb "github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	releasesGraphql "github.com/kaitencloud/kaiten/api/internal/modules/releases/graphql"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/pkg/fiberapi"
)

const (
	// queryCacheSize bounds the parsed-document LRU.
	queryCacheSize = 1000
	// persistedQueryCacheSize bounds the automatic persisted query LRU.
	persistedQueryCacheSize = 100
	// parserTokenLimit bounds parsing and validation before complexity is known.
	// Neither observes OperationTimeout, and nested inline fragments cost only
	// one complexity point while validation grows quadratically with depth.
	// Measured in handler_test.go: the console's documents use 14-81 tokens,
	// and the SDK's LicensingCatalog/Snapshot use 73/140. This leaves over 7x
	// headroom. At 1,000 tokens, 332 nested fragments parse and validate in
	// about 0.55 ms on an Apple M5 Pro; see BenchmarkParserTokenLimit.
	parserTokenLimit = 1_000
	// OperationTimeout is how long one GraphQL operation may run before its
	// context is cancelled. Exported because the listener's write budget is
	// derived from it -- see the server package's writeTimeout.
	//
	// It is a backstop, not a performance budget: complexityLimit is what
	// refuses expensive documents, and it does so before a resolver runs. This
	// catches what a static cost model cannot see -- a query that is cheap to
	// price and slow to answer because a table grew, an index went missing, or
	// Postgres chose a bad plan. Without it such a request has no end at all,
	// and at replicaCount 1 a few of them are the service.
	//
	// Generous on purpose. A document this refuses is one the complexity limit
	// admitted, so the reasonable assumption is that it is legitimate and
	// something underneath is wrong.
	OperationTimeout = 30 * time.Second
	// complexityLimit bounds the cost of a single operation. Since complexity.go
	// every list field is charged for its fan-out, so a point is one row's worth
	// of work rather than one line of query text, and the numbers below are row
	// counts.
	//
	// One measured number sets it, pinned in handler_test.go: the heaviest
	// document any client sends -- the console's GetReleaseManagementOverview,
	// which asks for the largest page pagination serves -- costs 262,200. That
	// is the ceiling. The limit sits above it with room for the schema and the
	// console to grow.
	//
	// The SDK's two documents are dearer per row than any of the console's: a
	// license expands into its grants, and each grant into its entitlement's
	// groups -- two unbounded lists, one inside the other. At the largest page
	// the dearer of the two costs 1,743,813 and both are refused, which is this
	// limit doing its job rather than a hole in it: that is more than four times
	// the work it admits from anyone. So they do not ask for that page. They
	// name one of 25 licenses and follow the cursor -- 236,363 for the dearer of
	// the two, which keeps them under the ceiling.
	//
	// What it refuses is the instance -> license -> instances cycle, at three
	// turns. That number is the whole point of the change: under the structural
	// cost model this replaced, the same cycle was admitted to 123 turns, and
	// each turn multiplies the objects gqlgen materializes.
	//
	// Note what is *not* the ceiling: a query asking for an organization in one
	// document, relations expanded, costs tens of millions and is refused. That
	// is correct, not a regression -- expanding every relation of an
	// organization at once is precisely the shape being priced out, and no
	// client has ever asked for it.
	complexityLimit = 400_000
)

// Config holds the configuration for the GraphQL handler.
type Config struct {
	EnablePlayground    bool
	EnableIntrospection bool
	UsageReporter       services.UsageReporter
}

// Handler creates a new GraphQL handler for Fiber.
type Handler struct {
	pool   *pgxpool.Pool
	config Config
	// srv is built once at setup: the executable schema, the parsed-document
	// cache and the automatic persisted query cache are process-wide. Both
	// caches only ever hit when they outlive the request that filled them --
	// rebuilding them per request makes persisted queries impossible.
	srv *handler.Server
}

// NewHandler creates a new GraphQL handler.
func NewHandler(pool *pgxpool.Pool, config Config) *Handler {
	return &Handler{
		pool:   pool,
		config: config,
		srv:    newServer(pool, config),
	}
}

// newServer builds the gqlgen server. The resolver holds no request state --
// principal, dataloaders and the like travel through the context -- so a single
// server instance serves every request.
func newServer(pool *pgxpool.Pool, config Config) *handler.Server {
	srv := handler.New(newExecutableSchema(pool, config))
	srv.SetParserTokenLimit(parserTokenLimit)

	// Add transports for HTTP requests. Each of these writes its whole answer
	// before it returns, and graphqlHandler relies on that to answer a scope
	// refusal itself: a transport that streams could not be added beside them
	// without changing how that refusal is answered.
	srv.AddTransport(transport.Options{})
	srv.AddTransport(transport.GET{})
	srv.AddTransport(transport.POST{})

	// Add query caching for performance
	srv.SetQueryCache(lru.New[*ast.QueryDocument](queryCacheSize))

	// Add extensions
	srv.Use(extension.FixedComplexityLimit(complexityLimit))
	// After the complexity limit, and after the validation gqlgen runs before
	// either: a document is refused for what it is before it is refused for who
	// sent it, which is the order a REST operation answers in too.
	srv.Use(scopeGate{})
	// Introspection is a development affordance: it is what turns the schema
	// into a map for composing an expensive query, so it stays off unless the
	// deployment asks for it.
	if config.EnableIntrospection {
		srv.Use(extension.Introspection{})
	}
	srv.Use(extension.AutomaticPersistedQuery{
		Cache: lru.New[string](persistedQueryCacheSize),
	})
	srv.Use(otelgqlgen.Middleware(
		otelgqlgen.WithoutVariables(),
	))

	// Present every resolver error through the shared API error shape, so
	// GraphQL and REST cannot disagree about what an error looks like -- and so
	// untyped errors never leak their text to the client.
	srv.SetErrorPresenter(presentError)

	return srv
}

// newExecutableSchema builds the schema, cost model included.
//
// It is a function rather than two lines inside newServer so that the
// complexity tests measure the schema this service actually serves. A test
// that builds its own generated.Config gets gqlgen's structural default --
// every list field priced at one point -- and pins numbers no request will
// ever be charged.
func newExecutableSchema(pool *pgxpool.Pool, config Config) graphql.ExecutableSchema {
	return generated.NewExecutableSchema(generated.Config{
		Resolvers:  resolver.NewResolver(pool, config.UsageReporter),
		Complexity: newComplexityRoot(),
	})
}

// RegisterRoutes registers the GraphQL routes on a Fiber router.
func (h *Handler) RegisterRoutes(router fiber.Router) {
	router.All("/graphql", h.graphqlHandler())

	if h.config.EnablePlayground {
		router.Get("/graphql/playground", h.playgroundHandler())
	}
}

// graphqlHandler creates the GraphQL HTTP handler. Only what is genuinely
// request-scoped -- the caller, the identity and the dataloaders -- is built per
// request; the gqlgen server itself comes from setup (see newServer).
func (h *Handler) graphqlHandler() fiber.Handler {
	return func(c fiber.Ctx) error {
		// This route's credential-class gate.
		//
		// Every other transport in this service opens by resolving a caller and
		// handing it to a facade method. This one resolves the same caller, for the
		// same refusal -- a platform credential establishes no organization, and
		// every resolver below dereferences one -- and hands it to the scope gate
		// instead, because the resolver tree takes none: it holds each module's
		// db.Queries directly and reads the principal out of context for its
		// OrganizationID. See scope.go for what the gate requires.
		//
		// Resolving it here rather than leaving it to a default-deny middleware over
		// the whole /api group is what let that middleware go: this was the one route
		// under it that reached a handler with no caller in it. It runs before gqlgen
		// is handed the request, so a wrong-class credential is still refused without
		// a document being parsed.
		cl, err := caller.Organization(c.Context())
		if err != nil {
			return fiberapi.Problem(c, err)
		}

		// Non-nil and of kind organization, by the line above.
		i, _ := principal.FromContext(c.Context())

		// Create dataloaders for this request. Their per-key cache must never
		// outlive the request it was filled for.
		loaders := h.newLoaders()

		check := &scopeCheck{caller: cl}

		// Fiber v2's adaptor does not propagate c.Context() by itself.
		// Wrap it so gqlgen starts from the OTEL-aware Fiber user context.
		httpHandler := httpHandlerWithUserContext(withOperationDeadline(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				// Propagate identity from Fiber context to GraphQL context
				ctx := principal.ContextWithPrincipal(r.Context(), i)
				// Add dataloaders to context
				ctx = dataloader.ContextWithLoaders(ctx, loaders)
				ctx = withScopeCheck(ctx, check)
				h.srv.ServeHTTP(w, r.WithContext(ctx))
			}),
		))

		if err := httpHandler(c); err != nil {
			return err
		}

		// gqlgen has answered by now, and it answered a refusal by the scope gate
		// the only way its transports can: a 200 with the error in the body. That
		// response is replaced here by the problem every other route answers a
		// missing scope with, status included. It is still whole in c's response at
		// this point, because the adaptor buffers what a net/http handler writes
		// until the handler returns.
		if check.refusal != nil {
			return fiberapi.Problem(c, check.refusal)
		}

		return nil
	}
}

// withOperationDeadline gives whatever it wraps OperationTimeout to finish in.
//
// It derives from the request context rather than replacing it, which is the
// property worth keeping: a client that hangs up still cancels the work at
// once, and the budget only binds a caller patient enough to wait for it. The
// cancel runs on the way out, so the timer is released as soon as the
// operation is answered rather than being held for the rest of the budget.
//
// It is a named wrapper, and applied outside the identity and dataloader
// plumbing, so that the two are separable: the deadline is a property of the
// request, not of the resolver tree's context, and neither has to be
// understood to check the other. TestOperationDeadlineBoundsEveryRequest is
// what pins the three properties above.
func withOperationDeadline(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), OperationTimeout)
		defer cancel()

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// newLoaders builds the request-scoped dataloaders.
// Each module registers its own dataloaders.
func (h *Handler) newLoaders() *dataloader.Loaders {
	loaders := dataloader.NewLoaders(h.config.UsageReporter)
	addonsGraphql.RegisterDataloaders(loaders, addonsdb.New(h.pool))
	billingGraphql.RegisterDataloaders(loaders, billingdb.New(h.pool))
	customersGraphql.RegisterDataloaders(loaders, customersdb.New(h.pool))
	deploymentzonesGraphql.RegisterDataloaders(loaders, deploymentzonesdb.New(h.pool))
	entitlementsGraphql.RegisterDataloaders(loaders, entitlementsdb.New(h.pool))
	instancesGraphql.RegisterDataloaders(loaders, instancesdb.New(h.pool))
	licensesGraphql.RegisterDataloaders(loaders, licensesdb.New(h.pool))
	releasesGraphql.RegisterDataloaders(loaders, releaselink.New(h.pool), deploymentzonereleaselink.New(h.pool), instancereleaselink.New(h.pool))

	return loaders
}

// playgroundHandler creates the GraphQL Playground handler.
func (h *Handler) playgroundHandler() fiber.Handler {
	playgroundHandler := playground.Handler("GraphQL Playground", "/api/graphql")
	return httpHandlerWithUserContext(playgroundHandler)
}

func httpHandlerWithUserContext(h http.Handler) fiber.Handler {
	return func(c fiber.Ctx) error {
		return adaptor.HTTPHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h.ServeHTTP(w, r.WithContext(c.Context()))
		})(c)
	}
}
