package schema

import (
	"regexp"

	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// selfServeCtaURLPattern mirrors license_self_serve_cta_url_check: an http(s)
// URL with no whitespace.
var selfServeCtaURLPattern = regexp.MustCompile(`^https?://\S+$`)

const maxSelfServeCtaURLLength = 2048

// MaxTrialDays is the longest trial a licence or a subscription may carry
// (V31-08). It also keeps trialDays × 24 h well inside a time.Duration.
const MaxTrialDays = 365

// ValidateTrialPeriodDays refuses a trial outside 1 to MaxTrialDays days, with
// <operation>.InvalidTrialDays.
func ValidateTrialPeriodDays(operation string, days int32) error {
	if days < 1 || days > MaxTrialDays {
		return kaitenerrors.UnprocessableEntity(operation+".InvalidTrialDays", "trialPeriodDays is between 1 and 365")
	}
	return nil
}

// ValidateSelfServeCtaURL refuses what license_self_serve_cta_url_check would,
// with <operation>.InvalidSelfServeCtaUrl.
func ValidateSelfServeCtaURL(operation, url string) error {
	if len(url) > maxSelfServeCtaURLLength || !selfServeCtaURLPattern.MatchString(url) {
		return kaitenerrors.UnprocessableEntity(operation+".InvalidSelfServeCtaUrl",
			"selfServeCtaUrl must be an http(s) URL of at most 2048 characters")
	}
	return nil
}
