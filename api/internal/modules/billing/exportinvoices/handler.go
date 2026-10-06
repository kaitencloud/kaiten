package exportinvoices

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoicelist"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "ExportInvoices"

type UseCase struct {
	deps access.Deps
}

func NewUseCase(deps access.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute checks an export request and returns the export, which reads
// nothing until it is written.
func (u *UseCase) Execute(ctx context.Context, params invoicelist.Params, instanceSlug, format, granularity string) (*Export, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	if format == "" {
		format = FormatCSV
	}
	if format != FormatCSV && format != FormatJSON {
		return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidFormat", "format is csv or json")
	}
	if granularity == "" {
		granularity = GranularityLine
	}
	if granularity != GranularityLine && granularity != GranularityInvoice {
		return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidGranularity", "granularity is line or invoice")
	}
	if err := invoicelist.Validate(operation, params); err != nil {
		return nil, err
	}
	q := u.deps.Queries(ctx)
	clock, err := q.BillingClock(ctx)
	if err != nil {
		return nil, err
	}
	return New(q, user.OrganizationID, params, instanceSlug, clock.Time.UTC(), format, granularity), nil
}
