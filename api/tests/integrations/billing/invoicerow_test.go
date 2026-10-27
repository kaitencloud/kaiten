package billing_test

import (
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
)

func pgxCollectInvoice(rows pgx.Rows) (db.InstanceInvoice, error) {
	return pgx.CollectExactlyOneRow(rows, pgx.RowToStructByPos[db.InstanceInvoice])
}
