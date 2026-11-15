package refundaiinference

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage/aitest"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func text(v string) *string { return &v }

func TestValidate(t *testing.T) {
	t.Parallel()
	for name, test := range map[string]struct {
		command Command
		code    string
		want    string
	}{
		"everything left":       {command: Command{Key: "k"}},
		"an amount":             {command: Command{Key: "refund:req-42.1_a-b", Credits: text("3.4")}, want: "3.4"},
		"the smallest amount":   {command: Command{Key: "k", Credits: text("0.000001")}, want: "0.000001"},
		"the largest amount":    {command: Command{Key: "k", Credits: text("999999999999.999999")}, want: "999999999999.999999"},
		"a reason":              {command: Command{Key: "k", Reason: text(strings.Repeat("é", MaxReasonLength))}},
		"no key":                {command: Command{}, code: "RefundAiInference.IdempotencyKeyRequired"},
		"a key with a space":    {command: Command{Key: "a b"}, code: "RefundAiInference.InvalidIdempotencyKey"},
		"a key too long":        {command: Command{Key: strings.Repeat("k", 129)}, code: "RefundAiInference.InvalidIdempotencyKey"},
		"zero":                  {command: Command{Key: "k", Credits: text("0")}, code: "RefundAiInference.InvalidAmount"},
		"zero with decimals":    {command: Command{Key: "k", Credits: text("0.000000")}, code: "RefundAiInference.InvalidAmount"},
		"negative":              {command: Command{Key: "k", Credits: text("-1")}, code: "RefundAiInference.InvalidAmount"},
		"seven decimals":        {command: Command{Key: "k", Credits: text("1.0000001")}, code: "RefundAiInference.InvalidAmount"},
		"an exponent":           {command: Command{Key: "k", Credits: text("1e2")}, code: "RefundAiInference.InvalidAmount"},
		"not a number":          {command: Command{Key: "k", Credits: text("NaN")}, code: "RefundAiInference.InvalidAmount"},
		"empty":                 {command: Command{Key: "k", Credits: text("")}, code: "RefundAiInference.InvalidAmount"},
		"thirteen digits":       {command: Command{Key: "k", Credits: text("1000000000000")}, code: "RefundAiInference.InvalidAmount"},
		"an empty reason":       {command: Command{Key: "k", Reason: text("")}, code: "RefundAiInference.InvalidReason"},
		"a reason too long":     {command: Command{Key: "k", Reason: text(strings.Repeat("r", MaxReasonLength+1))}, code: "RefundAiInference.InvalidReason"},
		"the key comes first":   {command: Command{Credits: text("0")}, code: "RefundAiInference.IdempotencyKeyRequired"},
		"the reason comes next": {command: Command{Key: "k", Credits: text("0"), Reason: text("")}, code: "RefundAiInference.InvalidReason"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			credits, err := validate(test.command)
			if test.code != "" {
				require.Error(t, err)
				require.Equal(t, test.code, apierrors.GetCode(err))
				require.Equal(t, 422, apierrors.GetHTTPStatus(err))
				return
			}
			require.NoError(t, err)
			if test.want == "" {
				require.Nil(t, credits)
				return
			}
			require.Equal(t, test.want, credits.String())
		})
	}
}

// A replay is recognised by what the request asked for: the inference, the
// amount as a number (or that none was named) and the reason.
func TestRequestHash(t *testing.T) {
	t.Parallel()
	amount := func(v string) *decimal.Decimal {
		d := decimal.RequireFromString(v)
		return &d
	}
	base := requestHash("req-42", amount("3.4"), text("duplicate"))
	require.Len(t, base, 32)
	require.Equal(t, base, requestHash("req-42", amount("3.40"), text("duplicate")), "one amount, two spellings")
	for name, other := range map[string][]byte{
		"another inference":    requestHash("req-43", amount("3.4"), text("duplicate")),
		"another amount":       requestHash("req-42", amount("3.5"), text("duplicate")),
		"no amount":            requestHash("req-42", nil, text("duplicate")),
		"another reason":       requestHash("req-42", amount("3.4"), text("other")),
		"no reason":            requestHash("req-42", amount("3.4"), nil),
		"fields do not bleed":  requestHash("req-423.4", nil, text("duplicate")),
		"absent is not empty":  requestHash("req-42", amount("3.4"), text("")),
		"reason is not amount": requestHash("req-42", nil, text("3.4")),
	} {
		require.NotEqual(t, base, other, name)
	}
}

func TestReportErrorNamesWhatARefundCanMeet(t *testing.T) {
	t.Parallel()
	reused := reportError(apierrors.Conflict("ReportEntitlementUsageMetric.TransactionIdReused", "x"))
	require.Equal(t, "RefundAiInference.IdempotencyKeyReused", apierrors.GetCode(reused))
	require.Equal(t, 409, apierrors.GetHTTPStatus(reused))
	ungranted := reportError(apierrors.NotFound("ReportEntitlementUsageMetric.ContextNotFound", "x"))
	require.Equal(t, "RefundAiInference.PoolNotGranted", apierrors.GetCode(ungranted))
	require.Equal(t, 409, apierrors.GetHTTPStatus(ungranted))
	unavailable := apierrors.Unavailable("ReportEntitlementUsageMetric.LedgerUnavailable", "x")
	require.Equal(t, error(unavailable), reportError(unavailable), "the report's own answer otherwise")
	plain := errors.New("boom")
	require.Equal(t, plain, reportError(plain))
}

type fixedUser struct{ user currentuser.User }

func (f fixedUser) GetUser(context.Context) (*currentuser.User, error) { return &f.user, nil }

// The gate and the request are checked before any transaction: with AI usage
// off nothing is read, and an invalid request never reaches the database
// (Uof and Reporter are nil here, so reaching them would panic).
func TestExecuteRefusesBeforeAnyTransaction(t *testing.T) {
	t.Parallel()
	user := fixedUser{user: currentuser.User{ID: uuid.New(), OrganizationID: uuid.New()}}

	off := NewUseCase(Deps{AIPolicy: aiusage.Policy{Flags: aitest.Flags(false)}, UserProvider: user, Uof: nil, Reporter: nil})
	_, err := off.Execute(t.Context(), "instance", "pool", "req-42", Command{Key: "k"})
	require.Equal(t, "AIUsage.Disabled", apierrors.GetCode(err))
	require.Equal(t, 403, apierrors.GetHTTPStatus(err))

	on := NewUseCase(Deps{AIPolicy: aiusage.Policy{Flags: aitest.Flags(true)}, UserProvider: user, Uof: nil, Reporter: nil})
	_, err = on.Execute(t.Context(), "instance", "pool", "req-42", Command{Key: "k", Credits: text("0")})
	require.Equal(t, "RefundAiInference.InvalidAmount", apierrors.GetCode(err))
}
