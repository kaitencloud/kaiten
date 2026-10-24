package confirmcheckoutsession

import (
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// A confirm answers what the subscription, customer and instance it creates
// refuse under its own name (Appendix A): the ksc_ caller never sees a Core
// prefix.
func TestTranslateAnswersUnderTheConfirmsName(t *testing.T) {
	for _, tc := range []struct {
		from   error
		code   string
		status int
	}{
		{kaitenerrors.UnprocessableEntity("SubscribeInstance.VoucherInvalid", "x"), operation + ".VoucherInvalid", 422},
		{kaitenerrors.UnprocessableEntity("SubscribeInstance.ProviderNotConnected", "x"), operation + ".ProviderCannotCapturePayment", 422},
		{kaitenerrors.UnprocessableEntity("SubscribeInstance.PaymentMethodRequired", "x"), operation + ".ProviderCannotCapturePayment", 422},
		{kaitenerrors.UnprocessableEntity("SubscribeInstance.UnsupportedCurrency", "x"), operation + ".ProviderCannotCapturePayment", 422},
		{kaitenerrors.UnprocessableEntity("SubscribeInstance.PriceDeprecated", "x"), operation + ".PriceNotPublic", 422},
		{kaitenerrors.UnprocessableEntity("SubscribeInstance.AddonInvalid", "x"), operation + ".PriceNotPublic", 422},
		{kaitenerrors.Unavailable("SubscribeInstance.ProviderUnavailable", "x"), operation + ".ProviderUnavailable", 503},
		{kaitenerrors.UnprocessableEntity("SubscribeInstance.InvalidTrialDays", "x"), operation + ".InvalidTrialDays", 422},
		{kaitenerrors.UnprocessableEntity("CreateCustomer.InvalidBillingEmail", "x"), operation + ".InvalidBillingEmail", 422},
		{kaitenerrors.NotFound("CreateInstance.LicenseNotFound", "x"), operation + ".LicenseNotFound", 404},
		{kaitenerrors.Conflict(operation+".DueTodayChanged", "x"), operation + ".DueTodayChanged", 409},
		{kaitenerrors.Unavailable("Entitlement.VerificationUnavailable", "x"), "Entitlement.VerificationUnavailable", 503},
	} {
		var refusal *kaitenerrors.Error
		require.True(t, errors.As(translate(tc.from), &refusal), kaitenerrors.GetCode(tc.from))
		require.Equal(t, tc.code, refusal.Code, kaitenerrors.GetCode(tc.from))
		require.Equal(t, tc.status, refusal.HTTPStatus(), kaitenerrors.GetCode(tc.from))
	}

	unavailable := kaitenerrors.Unavailable("SubscribeInstance.ProviderUnavailable", "x")
	require.Equal(t, 30, translate(unavailable).(*kaitenerrors.Error).RetryAfterSeconds(), "Appendix A: Retry-After: 30")
	require.Equal(t, 45, translate(unavailable.WithRetryAfter(45*time.Second)).(*kaitenerrors.Error).RetryAfterSeconds())

	plain := errors.New("database down")
	require.Same(t, plain, translate(plain))
}
