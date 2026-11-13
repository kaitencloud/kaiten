// Package listentitlementexceptions lists an instance's entitlement
// exceptions with their status at the read (§13.16).
package listentitlementexceptions

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/exceptions"
)

const operation = "ListEntitlementExceptions"

// Filters of the list: the default leaves out the revoked and the ended.
const (
	FilterActive = "active"
	FilterAll    = "all"
)

type UseCase struct {
	deps exceptions.Deps
}

func NewUseCase(deps exceptions.Deps) *UseCase {
	return &UseCase{deps: deps}
}

// Execute is the instance's exceptions, latest start first: those neither
// revoked nor ended (scheduled ones included), or all of them.
func (u *UseCase) Execute(ctx context.Context, instanceSlug string, all bool) ([]exceptions.EntitlementException, error) {
	user, err := u.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	ctx = u.deps.AIPolicy.Resolve(ctx, user.OrganizationID)
	q := u.deps.Queries(ctx)
	instance, err := exceptions.FindInstance(ctx, q, user.OrganizationID, instanceSlug, false, operation)
	if err != nil {
		return nil, err
	}
	now, err := exceptions.Now(ctx, q)
	if err != nil {
		return nil, err
	}
	rows, err := exceptions.List(ctx, q, user.OrganizationID, instance, nil, !all, now)
	if err != nil {
		return nil, err
	}
	visible := make([]exceptions.EntitlementException, 0, len(rows))
	for _, row := range rows {
		if u.deps.AIPolicy.RequireType(ctx, row.EntitlementType) == nil {
			visible = append(visible, row)
		}
	}
	return visible, nil
}
