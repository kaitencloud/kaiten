// Package refundaiinference gives back credits charged for one AI inference.
//
// A refund is evidence correction, not a new kind of counter movement. The
// movement is an ordinary negative numeric report on the pool, written by the
// report use case itself (reportentitlementusagemetric), composed into this
// use case's transaction: the journal row, the report_seq, the counter, the
// window and its rollover, and the events are the report's own. What this
// package adds is the check, under the pair's lock, that the inference was
// charged and has that much left to give back, and the append-only link from
// the movement to the inference (ai_inference_refund).
package refundaiinference

import (
	"context"
	"crypto/sha256"
	"errors"
	"regexp"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/aihistory"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/reportentitlementusagemetric"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const (
	operation = "RefundAiInference"

	// MaxReasonLength is the longest reason a refund keeps, in characters.
	MaxReasonLength = 500

	// refundOfMetadata is the member of the journal row's metadata that names
	// the inference a refund corrects. The reason is not copied there: the
	// journal's metadata must hold no personal data, and a reason is free text.
	refundOfMetadata = "refundOf"
)

var (
	// keyPattern is the format of a numeric report's Idempotency-Key: the
	// refund's key is the journal row's transactionId.
	keyPattern = regexp.MustCompile(`^[A-Za-z0-9._:-]{1,128}$`)
	// creditsPattern is the precision credits are charged with.
	creditsPattern = regexp.MustCompile(`^[0-9]{1,12}(\.[0-9]{1,6})?$`)
)

// Reporter is the report use case: the one writer of a counter movement.
type Reporter interface {
	Execute(ctx context.Context, instanceSlug, entitlementSlug string, command *reportentitlementusagemetric.Command) (*reportentitlementusagemetric.Result, error)
}

type Deps struct {
	AIPolicy     aiusage.Policy
	UserProvider currentuser.Provider
	Uof          *uow.UnitOfWork
	Reporter     Reporter
}

// Command is one refund request.
type Command struct {
	// Key is the refund's idempotency key, in a numeric report's format.
	Key string
	// Credits is the amount to give back, a positive decimal string; nil is
	// everything the inference still has to give back.
	Credits *string
	// Reason is why, in the caller's words; nil when none.
	Reason *string
}

// Result is the refund, and whether it is the replay of an earlier request
// sent under the same key.
type Result struct {
	Refund   schema.AiInferenceRefund
	Replayed bool
}

type UseCase struct{ deps Deps }

func NewUseCase(deps Deps) *UseCase { return &UseCase{deps: deps} }

// Execute refunds credits on the inference transactionID names on the pair.
func (u *UseCase) Execute(ctx context.Context, instanceSlug, entitlementSlug, transactionID string, command Command) (*Result, error) {
	user, err := u.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	ctx = u.deps.AIPolicy.Resolve(ctx, user.OrganizationID)
	if err := u.deps.AIPolicy.RequireEnabled(ctx); err != nil {
		return nil, err
	}
	requested, err := validate(command)
	if err != nil {
		return nil, err
	}
	hash := requestHash(transactionID, requested, command.Reason)

	var result *Result
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := db.New(u.deps.Uof.DBTX(ctx))
		pair, err := q.ResolveAIReadPair(ctx, db.ResolveAIReadPairParams{OrganizationID: user.OrganizationID, InstanceSlug: instanceSlug, EntitlementSlug: entitlementSlug})
		if errors.Is(err, pgx.ErrNoRows) {
			return apierrors.NotFound(operation+".ContextNotFound", "instance or AI credit pool not found")
		}
		if err != nil {
			return err
		}
		// The pair's lock, the one every report takes: what is left to refund
		// is read and consumed under it, and the report below takes it again
		// (an advisory transaction lock is re-entrant).
		if err := q.LockEntitlementUsage(ctx, db.LockEntitlementUsageParams(pair)); err != nil {
			return err
		}

		key := db.GetAIInferenceRefundByKeyParams{OrganizationID: user.OrganizationID, InstanceID: pair.InstanceID, EntitlementID: pair.EntitlementID, RefundKey: command.Key}
		existing, err := q.GetAIInferenceRefundByKey(ctx, key)
		if err == nil {
			if string(existing.AiInferenceRefund.RequestHash) != string(hash) {
				return keyReused()
			}
			result = &Result{Refund: aihistory.PresentRefund(existing.AiInferenceRefund, existing.CreatedByName), Replayed: true}
			return nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}

		inference, err := q.GetAIInferenceForRefund(ctx, db.GetAIInferenceForRefundParams{OrganizationID: user.OrganizationID, InstanceID: pair.InstanceID, EntitlementID: pair.EntitlementID, TransactionID: transactionID})
		if errors.Is(err, pgx.ErrNoRows) {
			return apierrors.NotFound(operation+".InferenceNotFound", "no AI inference with this transactionId on this instance and credit pool")
		}
		if err != nil {
			return err
		}
		if inference.Status != db.AiInferenceStatusCOMMITTED {
			return apierrors.Conflict(operation+".NotCommitted", "only a COMMITTED inference can be refunded; this one is "+string(inference.Status))
		}
		already, err := q.SumAIInferenceRefunds(ctx, db.SumAIInferenceRefundsParams{OrganizationID: user.OrganizationID, InferenceID: inference.ID})
		if err != nil {
			return err
		}
		remaining := number(inference.CreditsCharged).Sub(number(already))
		if !remaining.IsPositive() {
			return apierrors.Conflict(operation+".NothingToRefund", "the inference was charged nothing, or its charge is already refunded in full")
		}
		credits := remaining
		if requested != nil {
			credits = *requested
		}
		if credits.GreaterThan(remaining) {
			return apierrors.ConflictWithErrors(operation+".ExceedsRefundable", "the refund exceeds what the inference still has to give back",
				&apierrors.ErrorDetail{Message: "credits left to refund on this inference", Location: "body.credits", Value: remaining.String()})
		}

		// The movement: a negative append report under the refund's key. Its
		// float is the counter's own precision, as a commit's charge is; the
		// exact amount is the link's.
		amount, _ := credits.Neg().Float64()
		reported, err := u.deps.Reporter.Execute(ctx, instanceSlug, entitlementSlug, &reportentitlementusagemetric.Command{
			AI: nil, Value: amount, Behavior: reportentitlementusagemetric.BehaviorAppend,
			Metadata: map[string]any{refundOfMetadata: transactionID}, TransactionID: &command.Key,
		})
		if err != nil {
			return reportError(err)
		}
		// No refund holds this key, so a report answered as a replay means a
		// plain numeric report already took it: it moved nothing here.
		if reported.Replayed || reported.ReportSeq == nil || reported.ReportedAt == nil {
			return keyReused()
		}

		var stored pgtype.Numeric
		if err := stored.Scan(credits.String()); err != nil {
			return err
		}
		if err := q.InsertAIInferenceRefund(ctx, db.InsertAIInferenceRefundParams{
			OrganizationID: user.OrganizationID, InstanceID: pair.InstanceID, EntitlementID: pair.EntitlementID,
			InferenceID: inference.ID, TransactionID: transactionID, RefundKey: command.Key, RequestHash: hash,
			Credits: stored, Reason: command.Reason, ReportSeq: *reported.ReportSeq,
			CreatedAt: pgtype.Timestamp{Time: *reported.ReportedAt, Valid: true}, CreatedByID: user.ID,
		}); err != nil {
			return err
		}
		created, err := q.GetAIInferenceRefundByKey(ctx, key)
		if err != nil {
			return err
		}
		result = &Result{Refund: aihistory.PresentRefund(created.AiInferenceRefund, created.CreatedByName), Replayed: false}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// validate checks what the request carries, for every caller of the facade:
// HTTP schema validation is not the domain's. It returns the amount asked
// for, nil when the request leaves it to what is left.
func validate(command Command) (*decimal.Decimal, error) {
	if command.Key == "" {
		return nil, apierrors.UnprocessableEntityWithErrors(operation+".IdempotencyKeyRequired", "a refund needs an Idempotency-Key: sent twice without one, it would refund twice",
			&apierrors.ErrorDetail{Message: "the refund's key", Location: idempotencyKeyLocation})
	}
	if !keyPattern.MatchString(command.Key) {
		return nil, apierrors.UnprocessableEntityWithErrors(operation+".InvalidIdempotencyKey", "Idempotency-Key must be 1 to 128 characters of letters, digits, '.', '_', ':' and '-'",
			&apierrors.ErrorDetail{Message: "the key's format", Location: idempotencyKeyLocation, Value: command.Key})
	}
	if command.Reason != nil {
		if length := utf8.RuneCountInString(*command.Reason); length == 0 || length > MaxReasonLength {
			return nil, apierrors.UnprocessableEntity(operation+".InvalidReason", "reason must be 1 to 500 characters; omit it to give none")
		}
	}
	if command.Credits == nil {
		return nil, nil
	}
	if !creditsPattern.MatchString(*command.Credits) {
		return nil, invalidAmount()
	}
	credits, err := decimal.NewFromString(*command.Credits)
	if err != nil || !credits.IsPositive() {
		return nil, invalidAmount()
	}
	return &credits, nil
}

func invalidAmount() error {
	return apierrors.UnprocessableEntity(operation+".InvalidAmount", "credits must be a positive decimal string with at most 12 integer and 6 fractional digits; omit it to refund everything left")
}

func keyReused() error {
	return apierrors.ConflictWithErrors(operation+".IdempotencyKeyReused", "Idempotency-Key already used for another refund or report on this pool; send this refund under a new key",
		&apierrors.ErrorDetail{Message: "the key already used", Location: idempotencyKeyLocation})
}

// requestHash identifies a refund request: the inference, the amount asked
// for (or that none was) and the reason. Amounts are compared as numbers, so
// "3.4" and "3.40" are one request.
func requestHash(transactionID string, credits *decimal.Decimal, reason *string) []byte {
	h := sha256.New()
	field := func(present bool, value string) {
		if present {
			h.Write([]byte{1})
		} else {
			h.Write([]byte{0})
		}
		h.Write([]byte(value))
		h.Write([]byte{0})
	}
	field(true, transactionID)
	if credits != nil {
		field(true, credits.String())
	} else {
		field(false, "")
	}
	if reason != nil {
		field(true, *reason)
	} else {
		field(false, "")
	}
	return h.Sum(nil)
}

// reportError names, for this operation, the report's refusals a refund can
// meet. Everything else -- the AI gate, a missing journal partition, the
// rollover cap -- is the report's own answer.
func reportError(err error) error {
	switch apierrors.GetCode(err) {
	case "ReportEntitlementUsageMetric.TransactionIdReused":
		return keyReused()
	case "ReportEntitlementUsageMetric.ContextNotFound":
		return apierrors.Conflict(operation+".PoolNotGranted", "the instance no longer holds this credit pool: a report, and so a refund, needs the pool to be granted")
	}
	return err
}

func number(n pgtype.Numeric) decimal.Decimal {
	if !n.Valid || n.Int == nil {
		return decimal.Zero
	}
	return decimal.NewFromBigInt(n.Int, n.Exp)
}
