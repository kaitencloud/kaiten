package usagehistory

import (
	"time"

	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// DefaultSpan is how far back from `to` a request without `from` reads.
const DefaultSpan = 30 * 24 * time.Hour

// Range is a resolved [From, To) over reported_at, in UTC.
type Range struct {
	From, To time.Time
}

// ResolveRange applies the defaults to a requested range and refuses the ones
// that cannot be served, with error codes prefixed by operation (such as
// "ListUsageReports"):
//
//   - `to` defaults to now, `from` to `to` minus 30 days;
//   - an explicit `from` before retentionStart is refused with
//     <operation>.OutsideRetention, naming retentionStart; a defaulted one is
//     moved up to it, so a request with no range never fails on retention;
//   - an empty range is <operation>.InvalidRange, or OutsideRetention when it
//     ends before the history starts;
//   - longer than maxSpan (0 for no bound) is <operation>.RangeTooLarge.
//
// retentionStart is nil when nothing restricts the read.
func ResolveRange(operation string, from, to *time.Time, now time.Time, retentionStart *time.Time, maxSpan time.Duration) (Range, error) {
	r := Range{To: now.UTC()}
	if to != nil {
		r.To = to.UTC()
	}

	switch {
	case from != nil:
		r.From = from.UTC()
		if retentionStart != nil && r.From.Before(*retentionStart) {
			return Range{}, outsideRetention(operation, *retentionStart)
		}
	default:
		r.From = r.To.Add(-DefaultSpan)
		if retentionStart != nil && r.From.Before(*retentionStart) {
			r.From = *retentionStart
		}
	}

	if !r.From.Before(r.To) {
		if retentionStart != nil && !r.To.After(*retentionStart) {
			return Range{}, outsideRetention(operation, *retentionStart)
		}
		return Range{}, apierrors.UnprocessableEntity(operation+".InvalidRange", "from must be before to")
	}
	if maxSpan > 0 && r.To.Sub(r.From) > maxSpan {
		return Range{}, apierrors.UnprocessableEntityf(operation+".RangeTooLarge",
			"the range spans more than %d days; split it", int(maxSpan/(24*time.Hour)))
	}
	return r, nil
}

func outsideRetention(operation string, retentionStart time.Time) error {
	start := retentionStart.UTC().Format(timeLayout)
	return apierrors.UnprocessableEntityWithErrors(operation+".OutsideRetention",
		"the usage history is kept from "+start+": from must not be earlier",
		&apierrors.ErrorDetail{Message: "retentionStart", Location: "query.from", Value: start})
}
