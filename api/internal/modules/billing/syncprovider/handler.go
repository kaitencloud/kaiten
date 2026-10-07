package syncprovider

import (
	"context"
	"errors"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/syncing"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "SyncProvider"

// SyncReport is one pass per provider the organization has connected.
type SyncReport struct {
	Providers []syncing.Outcome `json:"providers" nullable:"false"`
}

type UseCase struct {
	deps   access.Deps
	syncer *syncing.Syncer
}

func NewUseCase(deps access.Deps, syncer *syncing.Syncer) *UseCase {
	return &UseCase{deps: deps, syncer: syncer}
}

// Execute runs one sync pass now for each provider the organization has
// connected that issues invoices.
func (u *UseCase) Execute(ctx context.Context) (*SyncReport, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	report := &SyncReport{Providers: []syncing.Outcome{}}
	if u.deps.Providers != nil {
		for _, kind := range u.deps.Providers.Kinds() {
			if capabilities, ok := u.deps.Providers.Capabilities(kind); !ok || !capabilities.PushesInvoices {
				continue
			}
			outcome, err := u.syncer.Organization(ctx, user.OrganizationID, db.BillingProviderKind(kind))
			if errors.Is(err, provider.ErrNotConnected) {
				continue
			}
			if err != nil {
				return nil, err
			}
			report.Providers = append(report.Providers, outcome)
		}
	}
	if len(report.Providers) == 0 {
		return nil, kaitenerrors.Conflict(operation+".NotConnected", "no payment provider that issues invoices is connected")
	}
	return report, nil
}
