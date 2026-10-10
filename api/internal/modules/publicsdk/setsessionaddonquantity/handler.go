// Package setsessionaddonquantity is PUT /public/session/addons/{addonSlug}
// (§14.4): the customer says how many of an add-on the session's instance
// holds. It is the vendor's attach, quantity change or detach, made on the
// customer's behalf, for what the public catalogue offers:
//
//   - 0 removes the add-on;
//   - a family the instance holds no version of is attached at the version
//     named, which must be the public one (the default PUBLISHED version of a
//     public family);
//   - a version the instance holds has its quantity changed, as long as its
//     family is still public;
//   - another version of the same family held already is refused: moving
//     between versions is the vendor's to do.
//
// The entitlement changes at once; billing follows the quantity held at each
// boundary, with no proration (D-45).
package setsessionaddonquantity

import (
	"context"
	"errors"
	"strings"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons/attachinstanceaddon"
	addoncatalogue "github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/getpubliccatalog"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "SetSessionAddonQuantity"

// SessionAddonQuantity is how many units the customer wants.
type SessionAddonQuantity struct {
	Quantity int32 `json:"quantity" minimum:"0" doc:"0 removes the add-on; otherwise at most its maxQuantity" example:"3"`
}

// Session is the customer session that changes the add-on.
type Session struct {
	InstanceSlug *string
}

// The add-ons module's operations, through ports this module owns.
type (
	Lister interface {
		Execute(ctx context.Context, instanceSlug string, includeRemoved bool) ([]addoncatalogue.InstanceAddon, error)
	}
	Attacher interface {
		Execute(ctx context.Context, instanceSlug string, command attachinstanceaddon.NewInstanceAddon) (*addoncatalogue.InstanceAddon, error)
	}
	QuantitySetter interface {
		Execute(ctx context.Context, instanceSlug, addonSlug string, quantity int32) (*addoncatalogue.InstanceAddon, error)
	}
	Detacher interface {
		Execute(ctx context.Context, instanceSlug, addonSlug string) error
	}
)

// Deps is what the operation needs.
type Deps struct {
	UserProvider currentuser.Provider
	Catalog      *getpubliccatalog.UseCase
	List         Lister
	Attach       Attacher
	SetQuantity  QuantitySetter
	Detach       Detacher
}

type UseCase struct{ deps Deps }

func NewUseCase(deps Deps) *UseCase { return &UseCase{deps: deps} }

// Execute sets the quantity the session's instance holds. Setting the one it
// holds changes nothing.
func (u *UseCase) Execute(ctx context.Context, session Session, addonSlug string, request SessionAddonQuantity) (*sessions.SessionAddon, error) {
	user, err := u.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	if session.InstanceSlug == nil {
		return nil, kaitenerrors.UnprocessableEntity(operation+".InstanceRequired",
			"add-ons are held by one instance: mint the session with an instanceSlug")
	}
	instanceSlug := *session.InstanceSlug
	catalog, err := u.deps.Catalog.Execute(ctx, user.OrganizationID, getpubliccatalog.Query{FamilySlug: nil, IncludeAddOns: true})
	if err != nil {
		return nil, err
	}

	// A concurrent attach can land between the read and the write; the
	// second look sees it and answers as if it had been there.
	for attempt := 0; ; attempt++ {
		held, err := u.deps.List.Execute(ctx, instanceSlug, false)
		if err != nil {
			return nil, err
		}
		out, err := u.set(ctx, catalog, held, instanceSlug, addonSlug, request.Quantity)
		if attempt == 0 && raced(err) {
			continue
		}
		if err != nil {
			return nil, translate(err)
		}
		return out, nil
	}
}

func (u *UseCase) set(ctx context.Context, catalog *getpubliccatalog.PublicCatalog, held []addoncatalogue.InstanceAddon,
	instanceSlug, addonSlug string, quantity int32,
) (*sessions.SessionAddon, error) {
	if current := find(held, func(a addoncatalogue.InstanceAddon) bool { return a.AddonSlug == addonSlug }); current != nil {
		if !publicFamily(catalog, current.FamilySlug) {
			return nil, notPublic(addonSlug)
		}
		if quantity == 0 {
			if err := u.deps.Detach.Execute(ctx, instanceSlug, addonSlug); err != nil {
				return nil, err
			}
			removed := sessions.AddonFrom(*current)
			removed.Quantity = 0
			return &removed, nil
		}
		changed, err := u.deps.SetQuantity.Execute(ctx, instanceSlug, addonSlug, quantity)
		if err != nil {
			return nil, err
		}
		shown := sessions.AddonFrom(*changed)
		return &shown, nil
	}

	public := publicVersion(catalog, addonSlug)
	if public == nil {
		return nil, notPublic(addonSlug)
	}
	if other := find(held, func(a addoncatalogue.InstanceAddon) bool { return a.FamilySlug == public.FamilySlug }); other != nil {
		return nil, kaitenerrors.Conflict(operation+".OtherVersionAttached",
			"the instance holds another version of this add-on ("+other.AddonSlug+"); change that one, or ask the vendor to move it")
	}
	if quantity == 0 {
		// Nothing held, nothing to remove.
		return &sessions.SessionAddon{
			AddonSlug: public.AddonSlug, FamilySlug: public.FamilySlug, Name: public.Name, Quantity: 0,
			MaxQuantity: public.MaxQuantity, Prices: public.Prices,
		}, nil
	}
	attached, err := u.deps.Attach.Execute(ctx, instanceSlug, attachinstanceaddon.NewInstanceAddon{AddonSlug: addonSlug, Quantity: quantity})
	if err != nil {
		return nil, err
	}
	shown := sessions.AddonFrom(*attached)
	return &shown, nil
}

func find(held []addoncatalogue.InstanceAddon, match func(addoncatalogue.InstanceAddon) bool) *addoncatalogue.InstanceAddon {
	for i := range held {
		if match(held[i]) {
			return &held[i]
		}
	}
	return nil
}

func publicVersion(catalog *getpubliccatalog.PublicCatalog, addonSlug string) *getpubliccatalog.PublicAddOn {
	for i := range catalog.AddOns {
		if catalog.AddOns[i].AddonSlug == addonSlug {
			return &catalog.AddOns[i]
		}
	}
	return nil
}

func publicFamily(catalog *getpubliccatalog.PublicCatalog, familySlug string) bool {
	for _, addon := range catalog.AddOns {
		if addon.FamilySlug == familySlug {
			return true
		}
	}
	return false
}

func notPublic(addonSlug string) error {
	return kaitenerrors.UnprocessableEntityf(operation+".AddonNotPublic", "%q is not an add-on of the public catalogue", addonSlug)
}

// raced reports a write that lost to a concurrent change of the same family:
// an attach that found the family attached meanwhile, a change or removal
// that found the attachment gone.
func raced(err error) bool {
	var refusal *kaitenerrors.Error
	return errors.As(err, &refusal) && (refusal.Code == "AttachInstanceAddon.FamilyAlreadyAttached" ||
		refusal.Code == "SetInstanceAddonQuantity.NotAttached" || refusal.Code == "DetachInstanceAddon.NotAttached")
}

// translate answers the add-on rules a write refused under this operation's
// public names (Appendix A: "public-surface variants of the attach rules").
func translate(err error) error {
	var refusal *kaitenerrors.Error
	if !errors.As(err, &refusal) {
		return err
	}
	_, reason, ok := strings.Cut(refusal.Code, ".")
	if !ok {
		return err
	}
	rename := func(kind func(code, message string) *kaitenerrors.Error, to string) error {
		out := kind(operation+"."+to, refusal.Message)
		out.Errors, out.RetryAfter = refusal.Errors, refusal.RetryAfter
		return out
	}
	switch reason {
	case "BoundaryPending":
		return rename(kaitenerrors.Conflict, "BoundaryPending")
	case "Incompatible", "IncompatibleWithScheduledPlan", "NoPriceForBillingPeriod", "MeteredEntitlementConflict":
		// It does not fit this subscription, whichever rule says so.
		return rename(kaitenerrors.UnprocessableEntity, "Incompatible")
	case "QuantityExceedsMax", "InvalidQuantity":
		return rename(kaitenerrors.UnprocessableEntity, "QuantityExceedsMax")
	case "CurrencyMismatch":
		return rename(kaitenerrors.UnprocessableEntity, "CurrencyMismatch")
	case "AddonArchived", "AddonNotPublished", "AddonNotFound":
		return rename(kaitenerrors.UnprocessableEntity, "AddonNotPublic")
	case "FamilyAlreadyAttached":
		return rename(kaitenerrors.Conflict, "OtherVersionAttached")
	}
	return err
}
