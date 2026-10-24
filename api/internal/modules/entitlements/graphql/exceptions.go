package graphql

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	dataloaderLib "github.com/graph-gophers/dataloader/v7"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/dataloader"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/exceptions"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

// EntitlementExceptionsLoaderName loads Instance.entitlementExceptions.
const EntitlementExceptionsLoaderName = "EntitlementExceptionsLoader"

// Filters of Instance.entitlementExceptions, as GraphQL spells them.
const (
	FilterActive = "ACTIVE"
	FilterAll    = "ALL"
)

// EntitlementException is an exception as GraphQL serves it (§13.14): the
// REST shape without the instance, which is the parent, and with the value in
// the {type, value} shape of a licence grant, as the provenance has it.
type EntitlementException struct {
	ID              uuid.UUID
	EntitlementSlug string
	EntitlementType schema.Type
	Kind            string
	// Value is nil for UNLIMITED.
	Value     map[string]any
	StartsAt  time.Time
	EndsAt    *time.Time
	Reason    string
	Status    string
	CreatedAt time.Time
	RevokedAt *time.Time
}

func newEntitlementExceptionsBatchFn(queries *db.Queries) dataloaderLib.BatchFunc[uuid.UUID, []EntitlementException] {
	return func(ctx context.Context, keys []uuid.UUID) []*dataloaderLib.Result[[]EntitlementException] {
		results := make([]*dataloaderLib.Result[[]EntitlementException], len(keys))
		fail := func(err error) []*dataloaderLib.Result[[]EntitlementException] {
			for i := range results {
				results[i] = &dataloaderLib.Result[[]EntitlementException]{Error: err}
			}
			return results
		}
		i, ok := principal.FromContext(ctx)
		if !ok {
			return fail(dataloader.ErrMissingIdentity)
		}
		now, err := exceptions.Now(ctx, queries)
		if err != nil {
			return fail(err)
		}
		rows, err := queries.ListEntitlementExceptionsByInstances(ctx, db.ListEntitlementExceptionsByInstancesParams{
			OrganizationID: i.OrganizationID, InstanceIds: keys,
		})
		if err != nil {
			return fail(err)
		}
		byInstance := map[uuid.UUID][]EntitlementException{}
		for _, row := range rows {
			x, err := toEntitlementException(row, now)
			if err != nil {
				return fail(err)
			}
			byInstance[row.InstanceID] = append(byInstance[row.InstanceID], x)
		}
		for n, key := range keys {
			list := byInstance[key]
			if list == nil {
				list = []EntitlementException{}
			}
			results[n] = &dataloaderLib.Result[[]EntitlementException]{Data: list}
		}
		return results
	}
}

func toEntitlementException(row db.ListEntitlementExceptionsByInstancesRow, now time.Time) (EntitlementException, error) {
	x := EntitlementException{
		ID: row.ID, EntitlementSlug: row.EntitlementSlug, EntitlementType: schema.Type(row.EntitlementType), Kind: string(row.Kind),
		Value: nil, StartsAt: row.StartsAt.Time, EndsAt: pgtime.PgTimeStampToTimePtr(row.EndsAt), Reason: row.Reason,
		Status: "", CreatedAt: row.CreatedAt.Time, RevokedAt: pgtime.PgTimeStampToTimePtr(row.RevokedAt),
	}
	x.Status = exceptions.StatusAt(x.StartsAt, x.EndsAt, x.RevokedAt, now)
	if len(row.Value) > 0 {
		var value any
		if err := json.Unmarshal(row.Value, &value); err != nil {
			return EntitlementException{}, err
		}
		x.Value = map[string]any{"type": valueType(x.EntitlementType), "value": value}
	}
	return x, nil
}

// valueType is the discriminator of an entitlement type's {type, value}.
func valueType(t schema.Type) string {
	switch {
	case schema.IsNumberFamily(t):
		return "number"
	case t == schema.Boolean:
		return "boolean"
	default:
		return "object"
	}
}

// LoadEntitlementExceptions is an instance's exceptions, latest start first:
// with filter ACTIVE (the default), those neither revoked nor ended,
// scheduled ones included.
func LoadEntitlementExceptions(ctx context.Context, instanceID uuid.UUID, filter *string) ([]EntitlementException, error) {
	loader, err := dataloader.GetLoader[uuid.UUID, []EntitlementException](dataloader.LoadersFromContext(ctx), EntitlementExceptionsLoaderName)
	if err != nil {
		return nil, err
	}
	all, err := loader.Load(ctx, instanceID)()
	if err != nil || (filter != nil && *filter == FilterAll) {
		return all, err
	}
	active := make([]EntitlementException, 0, len(all))
	for _, x := range all {
		if x.Status == exceptions.StatusActive || x.Status == exceptions.StatusScheduled {
			active = append(active, x)
		}
	}
	return active, nil
}
