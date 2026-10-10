// Package graphql is billing's part of the GraphQL schema (§13.14): an
// instance's subscription summary, for the console's instance lists.
package graphql

import (
	"context"
	"time"

	"github.com/google/uuid"
	dataloaderLib "github.com/graph-gophers/dataloader/v7"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/dataloader"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

// InstanceBillingSummaryLoaderName loads Instance.billing.
const InstanceBillingSummaryLoaderName = "InstanceBillingSummaryLoader"

// InstanceBillingSummary is what an instance list shows of a subscription.
type InstanceBillingSummary struct {
	Status            string
	ProviderKind      string
	CurrentPeriodEnd  time.Time
	CancelAtPeriodEnd bool
	PastDueSince      *time.Time
	TrialEndsAt       *time.Time
}

// RegisterDataloaders registers billing's loaders. Not metered: a summary of
// an instance already read.
func RegisterDataloaders(loaders *dataloader.Loaders, queries *db.Queries) {
	loaders.Register(InstanceBillingSummaryLoaderName, dataloaderLib.NewBatchedLoader(newSummaryBatchFn(queries)))
}

func newSummaryBatchFn(queries *db.Queries) dataloaderLib.BatchFunc[uuid.UUID, *InstanceBillingSummary] {
	return func(ctx context.Context, keys []uuid.UUID) []*dataloaderLib.Result[*InstanceBillingSummary] {
		results := make([]*dataloaderLib.Result[*InstanceBillingSummary], len(keys))
		fail := func(err error) []*dataloaderLib.Result[*InstanceBillingSummary] {
			for i := range results {
				results[i] = &dataloaderLib.Result[*InstanceBillingSummary]{Error: err}
			}
			return results
		}
		i, ok := principal.FromContext(ctx)
		if !ok {
			return fail(dataloader.ErrMissingIdentity)
		}
		rows, err := queries.ListInstanceBillingSummaries(ctx, db.ListInstanceBillingSummariesParams{OrganizationID: i.OrganizationID, InstanceIds: keys})
		if err != nil {
			return fail(err)
		}
		byInstance := make(map[uuid.UUID]*InstanceBillingSummary, len(rows))
		for _, row := range rows {
			byInstance[row.InstanceID] = &InstanceBillingSummary{
				Status: string(row.Status), ProviderKind: string(row.ProviderKind), CurrentPeriodEnd: row.CurrentPeriodEnd.Time.UTC(),
				CancelAtPeriodEnd: row.CancelAtPeriodEnd, PastDueSince: instant(row.PastDueSince.Time, row.PastDueSince.Valid),
				TrialEndsAt: instant(row.TrialEndsAt.Time, row.TrialEndsAt.Valid),
			}
		}
		for n, key := range keys {
			results[n] = &dataloaderLib.Result[*InstanceBillingSummary]{Data: byInstance[key]}
		}
		return results
	}
}

// LoadInstanceBilling is an instance's subscription summary; nil when it was
// never subscribed.
func LoadInstanceBilling(ctx context.Context, instanceID uuid.UUID) (*InstanceBillingSummary, error) {
	loader, err := dataloader.GetLoader[uuid.UUID, *InstanceBillingSummary](dataloader.LoadersFromContext(ctx), InstanceBillingSummaryLoaderName)
	if err != nil {
		return nil, err
	}
	return loader.Load(ctx, instanceID)()
}

func instant(t time.Time, valid bool) *time.Time {
	if !valid {
		return nil
	}
	utc := t.UTC()
	return &utc
}
