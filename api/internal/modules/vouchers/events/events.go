// Package events names the events the voucher module records.
package events

import "github.com/kaitencloud/kaiten/api/internal/infrastructure/events"

var (
	VoucherCreated   = events.New("VOUCHER_CREATED", "com.kaiten.voucher.v1.created")
	VoucherUpdated   = events.New("VOUCHER_UPDATED", "com.kaiten.voucher.v1.updated")
	VoucherPublished = events.New("VOUCHER_PUBLISHED", "com.kaiten.voucher.v1.published")
	VoucherArchived  = events.New("VOUCHER_ARCHIVED", "com.kaiten.voucher.v1.archived")
	VoucherExhausted = events.New("VOUCHER_EXHAUSTED", "com.kaiten.voucher.v1.exhausted")

	InstanceVoucherRedeemed = events.New("INSTANCE_VOUCHER_REDEEMED", "com.kaiten.instance.voucher.v1.redeemed")
	InstanceVoucherRevoked  = events.New("INSTANCE_VOUCHER_REVOKED", "com.kaiten.instance.voucher.v1.revoked")
	InstanceVoucherExpired  = events.New("INSTANCE_VOUCHER_EXPIRED", "com.kaiten.instance.voucher.v1.expired")
)
