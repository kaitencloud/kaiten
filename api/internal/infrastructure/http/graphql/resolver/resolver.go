package resolver

//go:generate go tool gqlgen generate

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	auditdb "github.com/kaitencloud/kaiten/api/internal/modules/audittrail/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/audittrail/listforinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/audittrail/listfororganization"
	componentsdb "github.com/kaitencloud/kaiten/api/internal/modules/components/infrastructure/db"
	customersdb "github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	deploymentzonesdb "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
	entitlementsdb "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	instancesdb "github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	licensesdb "github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	metadatafieldsdb "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	releasesdb "github.com/kaitencloud/kaiten/api/internal/modules/releases/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

// Resolver is the root resolver for GraphQL queries. It holds dependencies
// needed by all resolvers -- each module's own typed db.Queries or public
// port, never a shared/global sqlc client.
type Resolver struct {
	UsageReporter services.UsageReporter

	InstancesQueries          *instancesdb.Queries
	AuditTrailForInstancePort *listforinstance.UseCase
	AuditTrailForOrgPort      *listfororganization.UseCase
	MetadataFieldsQueries     *metadatafieldsdb.Queries
	EntitlementsQueries       *entitlementsdb.Queries
	LicensesQueries           *licensesdb.Queries
	ReleasesQueries           *releasesdb.Queries
	CustomersQueries          *customersdb.Queries
	ComponentsQueries         *componentsdb.Queries
	DeploymentZonesQueries    *deploymentzonesdb.Queries
}

// NewResolver creates a new Resolver with the given dependencies. A nil
// usageReporter becomes a no-op one, so root resolvers report unconditionally.
func NewResolver(pool *pgxpool.Pool, usageReporter services.UsageReporter) *Resolver {
	return &Resolver{
		UsageReporter:             services.UsageReporterOrNoop(usageReporter),
		InstancesQueries:          instancesdb.New(pool),
		AuditTrailForInstancePort: listforinstance.NewUseCase(auditdb.New(pool)),
		AuditTrailForOrgPort:      listfororganization.NewUseCase(auditdb.New(pool)),
		MetadataFieldsQueries:     metadatafieldsdb.New(pool),
		EntitlementsQueries:       entitlementsdb.New(pool),
		LicensesQueries:           licensesdb.New(pool),
		ReleasesQueries:           releasesdb.New(pool),
		CustomersQueries:          customersdb.New(pool),
		ComponentsQueries:         componentsdb.New(pool),
		DeploymentZonesQueries:    deploymentzonesdb.New(pool),
	}
}

// reportIfNeeded bills a root resolver's own read, the way the REST handler
// behind the same data does. Nested traversals are not billed here: they are
// billed by the dataloader they go through (see dataloader.Metered), which is
// the one place every one of them passes. A root resolver must therefore
// never report a slug one of its nested fields' loaders also reports, or the
// same read is counted twice.
func (r *Resolver) reportIfNeeded(ctx context.Context, entitlementSlug string) {
	currentUser, ok := principal.FromContext(ctx)
	if !ok {
		return
	}

	r.UsageReporter.TrackAsync(currentUser.OrganizationID, entitlementSlug)
}
