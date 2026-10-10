package listaddons

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

type UseCase struct{ deps catalogue.Deps }

func NewUseCase(deps catalogue.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute lists the organization's add-on versions, newest first.
func (u *UseCase) Execute(ctx context.Context, lifecycleState, familySlug, cursor string, limit int32) (pagination.Page[catalogue.Addon], error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return pagination.Page[catalogue.Addon]{}, err
	}
	page, err := pagination.ParseKeyset(cursor, limit, "Addons")
	if err != nil {
		return pagination.Page[catalogue.Addon]{}, err
	}
	params := db.ListAddonsParams{
		OrganizationID: user.OrganizationID, LifecycleState: nil, FamilySlug: nil,
		CursorAt: page.CursorAt, CursorID: page.CursorID, RowLimit: page.RowLimit,
	}
	if lifecycleState != "" {
		state := db.LicenseLifecycleState(lifecycleState)
		params.LifecycleState = &state
	}
	if familySlug != "" {
		params.FamilySlug = &familySlug
	}
	rows, err := u.deps.Queries(ctx).ListAddons(ctx, params)
	if err != nil {
		return pagination.Page[catalogue.Addon]{}, err
	}
	addons := make([]catalogue.Addon, len(rows))
	for i, r := range rows {
		addons[i] = catalogue.ToAddon(db.Addon{
			ID: r.ID, OrganizationID: r.OrganizationID, FamilyID: r.FamilyID, Name: r.Name, Slug: r.Slug,
			Description: r.Description, Version: r.Version, VersionName: r.VersionName, IsDefault: r.IsDefault,
			LifecycleState: r.LifecycleState, PricingType: r.PricingType, MaxQuantity: r.MaxQuantity,
			CreatedAt: r.CreatedAt, CreatedByID: r.CreatedByID, UpdatedAt: r.UpdatedAt, UpdatedByID: r.UpdatedByID,
		}, r.FamilySlug)
	}
	return pagination.KeysetPage(addons, page, func(a catalogue.Addon) (time.Time, uuid.UUID) { return a.CreatedAt, a.ID })
}
