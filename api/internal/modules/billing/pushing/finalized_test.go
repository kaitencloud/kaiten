package pushing

import (
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
)

func TestDueDateDrift(t *testing.T) {
	due := time.Date(2027, 4, 30, 9, 15, 0, 0, time.UTC)
	row := db.InstanceInvoice{
		CollectionMethod: db.CollectionMethodSENDINVOICE,
		DueAt:            pgtype.Timestamp{Time: due, InfinityModifier: pgtype.Finite, Valid: true},
	}
	at := func(d time.Duration) provider.Invoice {
		provided := due.Add(d)
		return provider.Invoice{DueAt: &provided}
	}

	for _, tc := range []struct {
		name  string
		row   db.InstanceInvoice
		read  provider.Invoice
		drift time.Duration
		want  bool
	}{
		{name: "the same instant", row: row, read: at(0), want: false},
		{name: "seconds apart, as two clocks are", row: row, read: at(-3 * time.Second), want: false},
		{name: "a draft finalized three days after Stripe started counting", row: row, read: at(-72 * time.Hour), drift: -72 * time.Hour, want: true},
		{name: "a day later in the provider", row: row, read: at(25 * time.Hour), drift: 25 * time.Hour, want: true},
		{name: "no due date in the provider", row: row, read: provider.Invoice{}, want: false},
		{name: "charged automatically: no due date to compare", row: db.InstanceInvoice{
			CollectionMethod: db.CollectionMethodCHARGEAUTOMATICALLY, DueAt: row.DueAt,
		}, read: at(-72 * time.Hour), want: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			drift, got := dueDateDrift(tc.row, tc.read)
			if got != tc.want || drift != tc.drift {
				t.Fatalf("dueDateDrift = %v, %v; want %v, %v", drift, got, tc.drift, tc.want)
			}
		})
	}
}
