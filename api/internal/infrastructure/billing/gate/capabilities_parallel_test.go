package gate_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getbillingcapabilities"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

type waitingCapabilities struct {
	started chan string
	release chan struct{}
}

func (p waitingCapabilities) Entitled(ctx context.Context, _ uuid.UUID, slug string) (bool, error) {
	if slug == dogfooding.BillingEntitlementSlug {
		return true, nil
	}
	p.started <- slug
	select {
	case <-p.release:
		return false, errors.New("licensing unavailable")
	case <-ctx.Done():
		return false, ctx.Err()
	}
}

func TestCapabilitiesWaitForIndependentGrantsTogether(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), time.Second)
	defer cancel()
	source := waitingCapabilities{started: make(chan string, 2), release: make(chan struct{})}
	m := member{currentuser.User{ID: uuid.New(), OrganizationID: uuid.New()}}
	u := getbillingcapabilities.NewUseCase(access.Deps{UserProvider: m, Gate: gate.New(true, source), Usage: retention{}}, 24*time.Hour)
	type answer struct {
		capabilities *getbillingcapabilities.BillingCapabilities
		err          error
	}
	done := make(chan answer, 1)
	go func() { value, err := u.Execute(ctx); done <- answer{value, err} }()
	var started []string
	for range 2 {
		select {
		case slug := <-source.started:
			started = append(started, slug)
		case <-ctx.Done():
			t.Fatal("one feature check blocked the other from starting")
		}
	}
	require.ElementsMatch(t, []string{dogfooding.VouchersEntitlementSlug, dogfooding.AddonsEntitlementSlug}, started)
	close(source.release)
	result := <-done
	require.NoError(t, result.err)
	require.True(t, result.capabilities.Enabled)
	require.False(t, result.capabilities.Features.Vouchers)
	require.False(t, result.capabilities.Features.Addons)
	require.Equal(t, []string{dogfooding.VouchersEntitlementSlug, dogfooding.AddonsEntitlementSlug}, result.capabilities.FeatureCheckUnavailable)
}
