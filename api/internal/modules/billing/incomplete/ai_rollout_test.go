package incomplete

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage/aitest"
)

// Characterizes the narrow exception's admission floor without a database:
// neither a non-activation payment nor an unpaid activation can enter it.
func TestPaidFulfilmentExceptionRejectsOtherInvoicesBeforeAnyDependency(t *testing.T) {
	for _, enabled := range []bool{false, true} {
		for _, invoice := range []db.InstanceInvoice{
			{Kind: db.InvoiceKind("RENEWAL"), Status: db.InvoiceStatusPAID},
			{Kind: db.InvoiceKindACTIVATION, Status: db.InvoiceStatus("DRAFT")},
		} {
			applied, err := Settle(t.Context(), access.Deps{AIPolicy: aiusage.Policy{Flags: aitest.Flags(enabled)}}, nil, nil, invoice, invoice.BoundaryAt.Time)
			require.NoError(t, err)
			require.False(t, applied)
		}
	}
}
