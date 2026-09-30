package identity

import (
	"context"
	"log/slog"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/createplatformtoken"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/createserviceaccount"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/createtokenonserviceaccount"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/deletetokenonserviceaccount"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/getplatformcredential"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/getserviceaccount"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/getserviceaccounts"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/getserviceaccounttokens"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/listorganizationtokens"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/listplatformtokens"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/mintorganizationtoken"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/revokeorganizationtoken"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/revokeplatformtoken"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/tokencache"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/tokenretention"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/updateserviceaccount"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/validateplatformtoken"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/validatetoken"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/addmembership"
)

// UseCases contains all the use case handlers for the identity module.
type UseCases struct {
	CreateServiceAccount        *createserviceaccount.UseCase
	GetServiceAccount           *getserviceaccount.UseCase
	GetServiceAccounts          *getserviceaccounts.UseCase
	UpdateServiceAccount        *updateserviceaccount.UseCase
	CreateTokenOnServiceAccount *createtokenonserviceaccount.UseCase
	DeleteTokenOnServiceAccount *deletetokenonserviceaccount.UseCase
	GetServiceAccountTokens     *getserviceaccounttokens.UseCase

	// ValidateToken and ValidatePlatformToken are the two authentication
	// primitives, one per credential family, and they are deliberately two.
	//
	// ValidateToken backs the Core API's ext_authz endpoint and answers for `ksh_`.
	// ValidatePlatformToken backs auth.PlatformMiddleware on the internal listener
	// and answers for `ksm_`. Neither holds the other's query, so no single call
	// site can be pointed at the wrong credential table -- which is what the one
	// prefix-switching function they replaced could be.
	//
	// Both appear on no surface of their own: authentication precedes a caller, so
	// neither can go through the facade. See internal/kaiten's doc for that
	// exception, which now covers two use cases instead of one.
	ValidateToken         validatetoken.UseCase
	ValidatePlatformToken validateplatformtoken.UseCase

	// GetPlatformCredential, MintOrganizationToken and RevokeOrganizationToken are
	// published on the Platform API only. They are kept in this same struct because
	// they read the same token table through the same queries; which surface an
	// operation appears on is decided by the registration layer, and is not a reason
	// to split the module.
	GetPlatformCredential   *getplatformcredential.UseCase
	MintOrganizationToken   *mintorganizationtoken.UseCase
	RevokeOrganizationToken *revokeorganizationtoken.UseCase
	ListOrganizationTokens  *listorganizationtokens.UseCase

	// CreatePlatformToken, ListPlatformTokens and RevokePlatformToken appear on no
	// surface at all: they are published through kaiten.InProcess, whose whole
	// contract is that a transport counterpart is impossible rather than merely
	// absent. Each package's comment argues its own case -- you cannot mint the
	// first platform credential through an API that requires one, and listing or
	// revoking them by name is the cross-credential enumeration the Platform API
	// exists to prevent.
	//
	// In this same struct for the reason the three above are: they read and write the
	// same token table through the same queries, and the reachability of an operation
	// is decided outside the module.
	CreatePlatformToken *createplatformtoken.UseCase
	ListPlatformTokens  *listplatformtokens.UseCase
	RevokePlatformToken *revokeplatformtoken.UseCase
}

// NewUseCases creates a new UseCases instance with all handlers initialized.
func NewUseCases(svc services.Container) *UseCases {
	cache := tokencache.New()

	// Cross-replica invalidation: when any process revokes a token (see
	// deletetokenonserviceaccount.Execute), it NOTIFYs this channel with the
	// token's lookup hash; every replica -- including the one that made the
	// write, harmlessly -- evicts that key from its own local cache. Without
	// this, only the replica that handled the revocation would see it
	// immediately; every other replica would keep serving the revoked
	// token's cached JWT for up to tokencache.TTL. (Expiry is a different
	// question, answered by each entry's own ExpiresAt, not by the TTL.)
	//
	// This module owns its own pgnotify.Listener -- built, registered, and
	// started right here, the same way featureflags_module.go's
	// evaluationPublisher owns its own background worker -- rather than
	// sharing one built and started by the server.
	if listener := svc.NewPgNotifyListener("identity"); listener != nil {
		listener.Register(deletetokenonserviceaccount.TokenCacheInvalidationChannel, func(_ context.Context, lookupHash string) {
			cache.Delete(lookupHash)
		})
		if err := listener.Start(context.Background()); err != nil {
			slog.Error("identity: failed to start pgnotify listener; token cache invalidation falls back to TTL-only staleness", "error", err)
		} else {
			svc.WorkerRegistry.OnStop(listener.Stop)
		}
	}

	// Nothing else in Kaiten deletes a token row, and every SDK token refresh adds
	// one, so this module bounds its own table on a schedule -- the same shape as
	// the transport-table sweep in internal/infrastructure/retention, and owned
	// here for the same reason the listener above is: `token` is identity's table
	// and "retired" is identity's rule. New returns nil for a non-positive window,
	// and Start/Stop are nil-safe, so a deployment turns it off with one value.
	//
	// Guarded on BackgroundWorkers rather than on Pool != nil, which was never the
	// question: a driver can have a pool and still have no business sweeping. That
	// mismatch is why the seeder started this sweeper at all -- and, having passed
	// no WorkerRegistry, started one nothing could stop. It only ever got away
	// with it because its zero retention window made New return nil.
	if svc.BackgroundWorkers {
		retiredTokens := tokenretention.New(svc.Pool, tokenretention.Config{
			InitialDelay: svc.Config.Retention.InitialDelay,
			Interval:     svc.Config.Retention.Interval,
			BatchSize:    svc.Config.Retention.BatchSize,
			Window:       svc.Config.Retention.RetiredTokens,
		})
		retiredTokens.Start(context.Background())
		svc.WorkerRegistry.OnStop(retiredTokens.Stop)
	}

	queries := db.New(svc.Pool)

	// Named rather than inlined into the literal below, because CreatePlatformToken
	// composes it for --replace: a rotation retires the predecessor through the same
	// use case `platform-token revoke` uses, cascade included, instead of repeating
	// its two statements and forgetting the children.
	//
	// Shares this module's cache instance for the reason RevokeOrganizationToken
	// does: a revocation evicts the entry in this process before the NOTIFY even
	// leaves.
	revokePlatformToken := revokeplatformtoken.NewUseCase(revokeplatformtoken.Deps{
		Uof: svc.Uof,
	}, cache)

	return &UseCases{
		CreateServiceAccount: createserviceaccount.NewUseCase(createserviceaccount.Deps{
			UserProvider:  svc.UserProvider,
			UsageReporter: svc.UsageReporter,
			Uof:           svc.Uof,
			Membership:    addmembership.NewUseCase(svc.Uof),
		}),
		GetServiceAccount: getserviceaccount.NewUseCase(getserviceaccount.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			UsageReporter: svc.UsageReporter,
		}),
		GetServiceAccounts: getserviceaccounts.NewUseCase(getserviceaccounts.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			UsageReporter: svc.UsageReporter,
		}),
		UpdateServiceAccount: updateserviceaccount.NewUseCase(updateserviceaccount.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			UsageReporter: svc.UsageReporter,
		}),
		CreateTokenOnServiceAccount: createtokenonserviceaccount.NewUseCase(createtokenonserviceaccount.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			UsageReporter: svc.UsageReporter,
		}),
		DeleteTokenOnServiceAccount: deletetokenonserviceaccount.NewUseCase(deletetokenonserviceaccount.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			Pool:          svc.Pool,
			UsageReporter: svc.UsageReporter,
		}, cache),
		GetServiceAccountTokens: getserviceaccounttokens.NewUseCase(getserviceaccounttokens.Deps{
			UserProvider:  svc.UserProvider,
			Queries:       queries,
			UsageReporter: svc.UsageReporter,
		}),
		ValidateToken: validatetoken.NewUseCase(queries, cache),
		// The same cache instance, and that is the whole reason this is wired here
		// rather than assembled next to the middleware that calls it: revocation
		// evicts by lookup hash from THIS cache (see RevokePlatformToken below) and
		// the pgnotify listener above invalidates the same keys across replicas. A
		// second instance would leave a revoked platform credential authenticating
		// until its entry aged out.
		ValidatePlatformToken: validateplatformtoken.NewUseCase(queries, cache),
		GetPlatformCredential: getplatformcredential.NewUseCase(getplatformcredential.Deps{
			Queries: queries,
		}),
		// Uof, not queries: the credential row and the outbox row announcing it to
		// the target tenant are one transaction.
		//
		// The cache is this module's instance, for the same reason
		// RevokeOrganizationToken takes it: Command.Replace retires a predecessor, and
		// a retired credential that stayed cached would keep authenticating.
		MintOrganizationToken: mintorganizationtoken.NewUseCase(mintorganizationtoken.Deps{
			Uof: svc.Uof,
		}, cache),
		// Shares this module's cache instance, so a revocation evicts the entry in
		// this process before the NOTIFY even leaves -- exactly as
		// DeleteTokenOnServiceAccount does for tenant-issued tokens.
		RevokeOrganizationToken: revokeorganizationtoken.NewUseCase(revokeorganizationtoken.Deps{
			Queries: queries,
			Pool:    svc.Pool,
		}, cache),
		// No cache and no Pool: this one only reads, so there is no entry to evict
		// and no invalidation to publish.
		ListOrganizationTokens: listorganizationtokens.NewUseCase(listorganizationtokens.Deps{
			Queries: queries,
		}),
		// Uof, not queries: with --replace the predecessor's retirement and the
		// successor's insert are one transaction, and a rotation that committed half
		// of itself would leave either two live credentials of one name or none.
		CreatePlatformToken: createplatformtoken.NewUseCase(createplatformtoken.Deps{
			Uof:    svc.Uof,
			Revoke: revokePlatformToken,
		}),
		ListPlatformTokens: listplatformtokens.NewUseCase(listplatformtokens.Deps{
			Queries: queries,
		}),
		RevokePlatformToken: revokePlatformToken,
	}
}
