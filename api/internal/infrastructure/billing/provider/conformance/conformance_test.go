package conformance_test

import (
	"testing"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider/conformance"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider/fakeprovider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider/noop"
)

func TestNoop(t *testing.T) {
	conformance.Run(t, func(*testing.T) conformance.Subject {
		return conformance.Subject{Adapter: noop.New(), Ref: provider.Ref{OrganizationID: uuid.New(), Settings: nil}}
	})
}

func TestFakeProvider(t *testing.T) {
	conformance.Run(t, func(*testing.T) conformance.Subject {
		return conformance.Subject{Adapter: fakeprovider.New(provider.KindStripe), Ref: provider.Ref{OrganizationID: uuid.New(), Settings: nil}}
	})
}
