// Package createcheckoutsession is POST /public/checkout-sessions, the start
// of an anonymous checkout (Tier 2, V32-01, §14.8): a visitor the vendor's
// backend does not know yet picks a public plan on the vendor's page, passes
// a Turnstile challenge, and gets a session and its ksc_.
//
// The start writes one checkout_session row and nothing else (INV-34): no
// customer, no instance, no provider customer -- the completion creates them
// (§9.12). The cheap refusals come before the Turnstile verification, so a
// refused call never costs one.
package createcheckoutsession

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/turnstile"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscribeinstance"
	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/getpubliccatalog"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	"github.com/kaitencloud/kaiten/api/internal/shared/random"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "CreateCheckoutSession"

// tokenBodyLength is 43 base64url characters: 32 random bytes.
const tokenBodyLength = 43

// Activation prices a subscription with no instance yet.
type Activation interface {
	PreviewActivation(ctx context.Context, organizationID uuid.UUID, cmd subscribeinstance.PreviewCommand) (*subscribeinstance.ActivationPreview, error)
}

// Deps is what the start reads and writes.
type Deps struct {
	Uof        *uow.UnitOfWork
	Catalog    *getpubliccatalog.UseCase
	Activation Activation
	Secrets    keys.SecretStore
	Turnstile  turnstile.Verifier
	// Limits bound the starts, dryRun included, before the Turnstile
	// verification (§14.3).
	Limits *checkout.Limits
}

type UseCase struct {
	deps   Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Start is who starts the checkout: the key, its organization, and the
// visitor's address as the gateway saw it.
type Start struct {
	OrganizationID   uuid.UUID
	PublishableKeyID uuid.UUID
	RemoteIP         string
}

// Execute starts a checkout, or previews one with dryRun.
func (u *UseCase) Execute(ctx context.Context, start Start, draft checkout.CheckoutSessionDraft) (*checkout.CheckoutSessionStart, error) {
	q := db.New(u.deps.Uof.DBTX(ctx))
	key, err := q.GetPublishableKeyCheckout(ctx, db.GetPublishableKeyCheckoutParams{OrganizationID: start.OrganizationID, ID: start.PublishableKeyID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, disabled()
	}
	if err != nil {
		return nil, err
	}
	if !key.AnonymousCheckout {
		return nil, disabled()
	}
	if err := u.deps.Limits.Take(ctx, operation, start.PublishableKeyID, start.RemoteIP); err != nil {
		return nil, err
	}
	if err := u.verifyTurnstile(ctx, start, key, draft.TurnstileToken); err != nil {
		return nil, err
	}

	catalog, err := u.deps.Catalog.Execute(ctx, start.OrganizationID, getpubliccatalog.Query{FamilySlug: nil, IncludeAddOns: true, PublishableKeyID: nil})
	if err != nil {
		return nil, err
	}
	plan, price, err := selectPrice(catalog, draft)
	if err != nil {
		return nil, err
	}
	free := plan.PricingType == "FREE"
	if err := CheckPlan(ctx, operation, u.deps.Catalog, start.OrganizationID, catalog, plan, price, draft.AddOns, free); err != nil {
		return nil, err
	}
	if draft.Email != nil {
		if err := customerschema.ValidateBillingEmail(operation, *draft.Email); err != nil {
			return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidEmail", "email must be an e-mail address of at most 254 characters")
		}
	}
	if draft.ReturnURL != nil && !allowedReturn(*draft.ReturnURL, key.AllowedOrigins) {
		return nil, invalidReturnURL()
	}
	if !draft.DryRun {
		switch {
		case draft.Email == nil:
			return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidEmail", "email is required to start a checkout")
		case draft.ReturnURL == nil:
			return nil, invalidReturnURL()
		}
	}
	if draft.VoucherCode != nil {
		// An anonymous visitor has no customer to check a voucher's
		// restrictions against yet: refused, opaquely, until that check
		// exists, rather than letting a reserved code through.
		return nil, kaitenerrors.UnprocessableEntity(operation+".VoucherInvalid", "this voucher cannot be applied")
	}

	licenseID, err := uuid.Parse(plan.LicenseID)
	if err != nil {
		return nil, err
	}
	priceID, err := uuid.Parse(price.ID)
	if err != nil {
		return nil, err
	}
	// The licence's trial, unless declined, and one per e-mail and family
	// (INV-35): a preview without an e-mail shows it unchecked.
	var trialDays *int32
	var trialRefused *string
	if draft.Trial != nil && !*draft.Trial {
		none := int32(0)
		trialDays = &none
	} else if plan.TrialPeriodDays != nil && draft.Email != nil {
		consumed, err := q.TrialConsumedByEmail(ctx, db.TrialConsumedByEmailParams{OrganizationID: start.OrganizationID, LicenseID: licenseID, Email: *draft.Email})
		if err != nil {
			return nil, err
		}
		if consumed {
			none := int32(0)
			trialDays, trialRefused = &none, ptr(checkout.TrialRefusedAlreadyConsumed)
		}
	}

	preview, err := u.deps.Activation.PreviewActivation(ctx, start.OrganizationID, subscribeinstance.PreviewCommand{
		BasePriceID: priceID, AddOns: draft.AddOns, TrialDays: trialDays,
	})
	if err != nil {
		return nil, rename(err)
	}
	due := sessions.DueToday{
		Currency: preview.Currency, Subtotal: preview.Composition.Subtotal, DiscountTotal: preview.Composition.DiscountTotal,
		Total: preview.Composition.Total, Lines: sessions.LinesFrom(preview.Composition.Lines),
	}
	requiresMethod := !free && (due.Total > 0 || plan.RequiresPaymentMethod)
	if due.Total > 0 {
		// A Tier 2 instance never holds a paid plan before payment: it is
		// created on the fallback's free version, switched at PAID (§9.12).
		ok, err := q.HasCheckoutFallback(ctx, db.HasCheckoutFallbackParams{OrganizationID: start.OrganizationID, LicenseID: licenseID})
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, kaitenerrors.UnprocessableEntity(operation+".FallbackRequired",
				"this plan has an amount due today, so its family needs a fallback family with a default PUBLISHED version")
		}
	}
	out := &checkout.CheckoutSessionStart{
		Status: checkout.StartPreview, SessionID: nil, Token: nil, ExpiresAt: nil, DueToday: due,
		TrialEndsAt: preview.TrialEndsAt, TrialRefusedReason: trialRefused, RequiresPaymentMethod: requiresMethod,
	}
	if draft.DryRun {
		return out, nil
	}

	plaintext, err := random.GeneratePrefixed(token.PrefixCheckoutSession, tokenBodyLength)
	if err != nil {
		return nil, fmt.Errorf("checkout session: %w", err)
	}
	selection := checkout.Selection{AddOns: []checkout.SelectedAddon{}, Voucher: nil, TrialEndsAt: preview.TrialEndsAt, DueToday: &due}
	for _, addon := range draft.AddOns {
		i := slices.IndexFunc(catalog.AddOns, func(a getpubliccatalog.PublicAddOn) bool { return a.AddonSlug == addon.AddonSlug })
		addonID, err := uuid.Parse(catalog.AddOns[i].AddonID)
		if err != nil {
			return nil, err
		}
		quantity := addon.Quantity
		if quantity == 0 {
			quantity = 1
		}
		selection.AddOns = append(selection.AddOns, checkout.SelectedAddon{AddonID: addonID, AddonSlug: addon.AddonSlug, Quantity: quantity})
	}
	stored, err := json.Marshal(selection)
	if err != nil {
		return nil, err
	}
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		row, err := db.New(u.deps.Uof.DBTX(ctx)).InsertCheckoutSession(ctx, db.InsertCheckoutSessionParams{
			OrganizationID: start.OrganizationID, PublishableKeyID: start.PublishableKeyID, LookupHash: token.LookupHash(plaintext),
			Email: *draft.Email, ClientReferenceID: draft.ClientReferenceID, LicensePriceID: priceID, Selection: stored,
			DueTodayMinor: due.Total, Currency: due.Currency, TrialRefusedReason: trialRefused, ReturnUrl: *draft.ReturnURL,
		})
		if err != nil {
			return err
		}
		expires := row.ExpiresAt.Time.UTC()
		out.Status, out.SessionID, out.Token, out.ExpiresAt = checkout.StartOpen, &row.ID, &plaintext, &expires
		return u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(start.OrganizationID,
			events.CheckoutSessionStarted.Name, events.CheckoutSessionStarted.Type, checkout.SessionEvent{
				SessionID: row.ID, Email: row.Email, ClientReferenceID: row.ClientReferenceID, LicenseSlug: plan.LicenseSlug,
				BillingPeriod: deref(price.BillingPeriod), CustomerSlug: nil, InstanceSlug: nil, Status: checkout.StatusOpen,
			}, nil))
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// verifyTurnstile verifies the token with the key's secret, passing the
// visitor's address, and checks the widget was solved on one of the key's
// origins (§14.8 rule 1).
func (u *UseCase) verifyTurnstile(ctx context.Context, start Start, key db.GetPublishableKeyCheckoutRow, tok string) error {
	if key.TurnstileSiteKey == nil || !key.SecretSet || u.deps.Secrets == nil || u.deps.Turnstile == nil {
		return turnstileNotConfigured()
	}
	secret, err := u.deps.Secrets.Get(ctx, start.OrganizationID, start.PublishableKeyID)
	if err != nil {
		return turnstileNotConfigured()
	}
	result, err := u.deps.Turnstile.Verify(ctx, secret, tok, start.RemoteIP)
	if errors.Is(err, turnstile.ErrUnavailable) {
		return kaitenerrors.Unavailable(operation+".TurnstileUnavailable", "the challenge could not be verified: try again").WithRetryAfter(30 * time.Second)
	}
	if err != nil {
		return err
	}
	if !result.Success || !slices.ContainsFunc(key.AllowedOrigins, func(origin string) bool { return hostOf(origin) == result.Hostname }) {
		return kaitenerrors.UnprocessableEntity(operation+".TurnstileFailed", "the challenge was not passed: solve it again")
	}
	return nil
}

// FindPrice is the public plan and the ACTIVE price priceID names.
func FindPrice(catalog *getpubliccatalog.PublicCatalog, priceID uuid.UUID) (getpubliccatalog.PublicPlan, getpubliccatalog.PublicPrice, bool) {
	for _, plan := range catalog.Plans {
		for _, price := range plan.Prices {
			if price.ID == priceID.String() {
				return plan, price, true
			}
		}
	}
	return getpubliccatalog.PublicPlan{}, getpubliccatalog.PublicPrice{}, false
}

// selectPrice is the plan and price the draft names: priceId, or licenseSlug
// with billingPeriod for that version's default ACTIVE FLAT_FEE price of the
// period (§14.8 rule 2).
func selectPrice(catalog *getpubliccatalog.PublicCatalog, draft checkout.CheckoutSessionDraft) (getpubliccatalog.PublicPlan, getpubliccatalog.PublicPrice, error) {
	byPrice := draft.PriceID != nil
	bySlug := draft.LicenseSlug != nil || draft.BillingPeriod != nil
	if byPrice == bySlug || (bySlug && (draft.LicenseSlug == nil || draft.BillingPeriod == nil)) {
		return getpubliccatalog.PublicPlan{}, getpubliccatalog.PublicPrice{}, kaitenerrors.UnprocessableEntity(operation+".InvalidPriceSelection",
			"name the price by priceId, or by licenseSlug with billingPeriod: one of the two")
	}
	for _, plan := range catalog.Plans {
		for _, price := range plan.Prices {
			switch {
			case byPrice && price.ID == draft.PriceID.String():
				return plan, price, nil
			case bySlug && plan.LicenseSlug == *draft.LicenseSlug && price.IsDefault && price.BillingModel == "FLAT_FEE" &&
				price.BillingPeriod != nil && *price.BillingPeriod == *draft.BillingPeriod:
				return plan, price, nil
			}
		}
	}
	return getpubliccatalog.PublicPlan{}, getpubliccatalog.PublicPrice{}, kaitenerrors.UnprocessableEntity(operation+".PriceNotPublic",
		"this is not an ACTIVE price of a plan in the public catalogue")
}

// CheckPlan applies the Tier 3 checks under op (§14.8 rule 2): the start's,
// and the confirm's re-validation of the stored selection.
func CheckPlan(ctx context.Context, op string, catalogue *getpubliccatalog.UseCase, organizationID uuid.UUID, catalog *getpubliccatalog.PublicCatalog,
	plan getpubliccatalog.PublicPlan, price getpubliccatalog.PublicPrice, wanted []subscribeinstance.SubscriptionAddon, free bool,
) error {
	if price.BillingModel != "FLAT_FEE" {
		return kaitenerrors.UnprocessableEntity(op+".PriceNotFlatFee", "a subscription is bought on a flat-fee price; metered prices come with it")
	}
	if plan.PricingType == "CUSTOM" {
		return kaitenerrors.UnprocessableEntity(op+".NotSelfServe", "this plan is priced on request: send the visitor to its selfServeCtaUrl")
	}
	for _, w := range wanted {
		i := slices.IndexFunc(catalog.AddOns, func(a getpubliccatalog.PublicAddOn) bool { return a.AddonSlug == w.AddonSlug })
		if i < 0 || !slices.Contains(catalog.AddOns[i].CompatibleLicenseFamilies, plan.FamilySlug) {
			return kaitenerrors.UnprocessableEntityf(op+".AddonNotPublic", "%q is not a public add-on that fits this plan", w.AddonSlug)
		}
		addon := catalog.AddOns[i]
		if w.Quantity < 0 || (addon.MaxQuantity != nil && w.Quantity > *addon.MaxQuantity) {
			return kaitenerrors.UnprocessableEntityf(op+".QuantityExceedsMax", "between 1 and the add-on's maximum of %q", w.AddonSlug)
		}
		for _, p := range addon.Prices {
			if p.BillingModel != "FLAT_FEE" || p.BillingPeriod == nil || price.BillingPeriod == nil || *p.BillingPeriod != *price.BillingPeriod {
				continue
			}
			if amount, err := decimal.NewFromString(p.UnitAmountDecimal); free && (err != nil || amount.IsPositive()) {
				// A FREE plan subscribes on NOOP, which charges nothing.
				return kaitenerrors.UnprocessableEntityf(op+".AddonNotPublic", "%q is not free, and this plan charges nothing", w.AddonSlug)
			}
			if p.Currency != price.Currency {
				return kaitenerrors.UnprocessableEntityf(op+".CurrencyMismatch", "%q is not priced in %s", w.AddonSlug, price.Currency)
			}
		}
	}
	if plan.PricingType == "PAID" {
		if _, captures := catalogue.CapturingProvider(ctx, organizationID); !captures {
			return kaitenerrors.UnprocessableEntity(op+".ProviderCannotCapturePayment",
				"no billing provider that captures payment methods is connected: a paid plan cannot be checked out")
		}
	}
	return nil
}

// rename answers the subscribe's refusals under this use case.
func rename(err error) error {
	return sessions.Rename(err, "SubscribeInstance", operation)
}

// allowedReturn is a return URL on an origin the key allows: https, or http
// on localhost, at most 2048 characters (§14.8 rule 3).
func allowedReturn(raw string, origins []string) bool {
	u, err := url.Parse(raw)
	if err != nil || len(raw) > 2048 {
		return false
	}
	host := strings.ToLower(u.Hostname())
	if u.Scheme != "https" && (u.Scheme != "http" || (host != "localhost" && host != "127.0.0.1")) {
		return false
	}
	return sessions.AllowedReturn(raw, origins)
}

// hostOf is an origin's host, for the hostname Turnstile answers.
func hostOf(origin string) string {
	u, err := url.Parse(origin)
	if err != nil {
		return ""
	}
	return strings.ToLower(u.Hostname())
}

func disabled() error {
	return kaitenerrors.Forbidden(operation+".AnonymousCheckoutDisabled", "this publishable key does not start anonymous checkouts")
}

func turnstileNotConfigured() error {
	return kaitenerrors.UnprocessableEntity(operation+".TurnstileNotConfigured", "this publishable key has no usable Turnstile site key and secret")
}

func invalidReturnURL() error {
	return kaitenerrors.UnprocessableEntity(operation+".InvalidReturnUrl",
		"returnUrl is https (http on localhost only), at most 2048 characters, on an origin the publishable key allows")
}

func ptr[T any](v T) *T { return &v }

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
