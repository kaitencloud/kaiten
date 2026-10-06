package schema

import (
	"regexp"

	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// selfServeCtaURLPattern mirrors license_self_serve_cta_url_check: an http(s)
// URL with no whitespace.
var selfServeCtaURLPattern = regexp.MustCompile(`^https?://\S+$`)

const maxSelfServeCtaURLLength = 2048

// ValidateTrialPeriodDays refuses a trial that is not at least one day, with
// <operation>.InvalidTrialPeriodDays.
func ValidateTrialPeriodDays(operation string, days int32) error {
	if days < 1 {
		return kaitenerrors.UnprocessableEntity(operation+".InvalidTrialPeriodDays", "trialPeriodDays must be at least 1")
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
