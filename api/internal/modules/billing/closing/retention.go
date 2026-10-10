package closing

import (
	"context"
	"time"

	"github.com/google/uuid"

	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// refuseOutsideRetention refuses, for a read a user makes (operation), a
// period that reads the usage journal from before the organization's usage
// history (§6.5 rule 3, D-32): 422 <operation>.OutsideRetention, naming
// retentionStart. The system's own reads (operation "") are never refused:
// the close bills protected rows whatever their age (D-33).
func (c *Closer) refuseOutsideRetention(ctx context.Context, operation string, organizationID uuid.UUID, from, now time.Time) error {
	if operation == "" {
		return nil
	}
	start := c.deps.Usage.RetentionStart(ctx, organizationID, now)
	if start == nil || !from.Before(*start) {
		return nil
	}
	return OutsideRetention(operation, *start, "the period starts before the organization's usage history: its usage reports are gone")
}

// OutsideRetention is <operation>.OutsideRetention, naming retentionStart as
// every such answer does (Appendix A).
func OutsideRetention(operation string, retentionStart time.Time, detail string, more ...*kaitenerrors.ErrorDetail) error {
	errs := append([]*kaitenerrors.ErrorDetail{{
		Message: "retentionStart", Location: "retentionStart", Value: retentionStart.UTC().Format(time.RFC3339Nano),
	}}, more...)
	return kaitenerrors.UnprocessableEntityWithErrors(operation+".OutsideRetention", detail, errs...)
}
