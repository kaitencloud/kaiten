package resolver

//go:generate go tool gqlgen generate

import (
	"github.com/jackc/pgx/v5/pgxpool"
	modelsdb "github.com/kaitencloud/kaiten/api/internal/modules/models/infrastructure/db"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	addonsdb "github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
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
)

// Resolver is the root resolver for GraphQL queries. It holds dependencies
// needed by all resolvers -- each module's own typed db.Queries or public
// port, never a shared/global sqlc client.
type Resolver struct {
	ModelsQueries *modelsdb.Queries
	// BillingGate keeps the add-on catalogue behind the billing switch, as REST
	// keeps it. The zero Gate refuses every organization.
	BillingGate gate.Gate

	AddonsQueries             *addonsdb.Queries
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

// NewResolver creates a new Resolver with the given dependencies.
func NewResolver(pool *pgxpool.Pool, billingGate gate.Gate) *Resolver {
	return &Resolver{
		ModelsQueries:             modelsdb.New(pool),
		BillingGate:               billingGate,
		AddonsQueries:             addonsdb.New(pool),
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
