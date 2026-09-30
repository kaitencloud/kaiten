package attio

import (
	"context"
	"errors"
	"strings"
	"testing"

	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	deploymentzoneschema "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Function adapters for the nine use-case ports, so a test states the one answer it
// cares about instead of declaring a struct per port.
type (
	customerGetterFunc func(ctx context.Context, slug string) (*customerschema.Customer, error)
	licenseGetterFunc  func(ctx context.Context, slug string) (*licenseschema.License, error)
	zoneGetterFunc     func(ctx context.Context, slug string) (*deploymentzoneschema.DeploymentZone, error)
	customerLinkFunc   func(ctx context.Context, slug, integration string) (*customerschema.CustomerIntegration, error)
	customerCreateFunc func(ctx context.Context, slug, integration string,
		body customerschema.CustomerIntegration) (*customerschema.CustomerIntegration, error)
	customerUpdateFunc func(ctx context.Context, slug, integration string,
		body customerschema.CustomerIntegration) (*customerschema.CustomerIntegration, error)
	instanceLinkFunc   func(ctx context.Context, slug, integration string) (*instanceschema.InstanceIntegration, error)
	instanceCreateFunc func(ctx context.Context, slug, integration string,
		body instanceschema.InstanceIntegration) (*instanceschema.InstanceIntegration, error)
	instanceUpdateFunc func(ctx context.Context, slug, integration string,
		body instanceschema.InstanceIntegration) (*instanceschema.InstanceIntegration, error)
)

func (f customerGetterFunc) Execute(ctx context.Context, slug string) (*customerschema.Customer, error) {
	return f(ctx, slug)
}

func (f licenseGetterFunc) Execute(ctx context.Context, slug string) (*licenseschema.License, error) {
	return f(ctx, slug)
}

func (f zoneGetterFunc) Execute(ctx context.Context, slug string) (*deploymentzoneschema.DeploymentZone, error) {
	return f(ctx, slug)
}

func (f customerLinkFunc) Execute(ctx context.Context, slug, integration string) (*customerschema.CustomerIntegration, error) {
	return f(ctx, slug, integration)
}

func (f customerCreateFunc) Execute(ctx context.Context, slug, integration string,
	body customerschema.CustomerIntegration,
) (*customerschema.CustomerIntegration, error) {
	return f(ctx, slug, integration, body)
}

func (f customerUpdateFunc) Execute(ctx context.Context, slug, integration string,
	body customerschema.CustomerIntegration,
) (*customerschema.CustomerIntegration, error) {
	return f(ctx, slug, integration, body)
}

func (f instanceLinkFunc) Execute(ctx context.Context, slug, integration string) (*instanceschema.InstanceIntegration, error) {
	return f(ctx, slug, integration)
}

func (f instanceCreateFunc) Execute(ctx context.Context, slug, integration string,
	body instanceschema.InstanceIntegration,
) (*instanceschema.InstanceIntegration, error) {
	return f(ctx, slug, integration, body)
}

func (f instanceUpdateFunc) Execute(ctx context.Context, slug, integration string,
	body instanceschema.InstanceIntegration,
) (*instanceschema.InstanceIntegration, error) {
	return f(ctx, slug, integration, body)
}

func stringPtr(value string) *string { return &value }

// --- record reads -------------------------------------------------------------

func TestStoreReadsTheRecordsAnEventOnlyReferences(t *testing.T) {
	store := NewStore(StoreDeps{
		Customer: customerGetterFunc(func(_ context.Context, slug string) (*customerschema.Customer, error) {
			if slug != "acme" {
				t.Errorf("unexpected customer slug: %q", slug)
			}
			return &customerschema.Customer{Name: "Acme Corp", Domain: stringPtr("acme.com")}, nil
		}),
		License: licenseGetterFunc(func(_ context.Context, _ string) (*licenseschema.License, error) {
			return &licenseschema.License{Name: "Enterprise License", Type: licenseschema.Type("PAID")}, nil
		}),
		DeploymentZone: zoneGetterFunc(func(_ context.Context, slug string) (*deploymentzoneschema.DeploymentZone, error) {
			if slug != "aws-eu-west-1" {
				t.Errorf("expected the zone to be resolved by slug, got %q", slug)
			}
			return &deploymentzoneschema.DeploymentZone{Name: "AWS eu-west-1"}, nil
		}),
	})

	customer, err := store.Customer(context.Background(), "acme")
	if err != nil {
		t.Fatalf("read customer: %v", err)
	}
	if customer.Name != "Acme Corp" || customer.Domain != "acme.com" {
		t.Fatalf("unexpected customer: %+v", customer)
	}

	licence, err := store.License(context.Background(), "enterprise")
	if err != nil {
		t.Fatalf("read licence: %v", err)
	}
	if licence.Name != "Enterprise License" || licence.Type != "PAID" {
		t.Fatalf("unexpected licence: %+v", licence)
	}

	zone, err := store.DeploymentZoneName(context.Background(), "aws-eu-west-1")
	if err != nil {
		t.Fatalf("read deployment zone: %v", err)
	}
	if zone != "AWS eu-west-1" {
		t.Fatalf("unexpected zone name: %q", zone)
	}
}

func TestStoreReportsACustomerWithoutADomain(t *testing.T) {
	// The column is nullable and the connector's Customer is not, so the nil has to
	// be flattened here rather than at the two call sites that read the domain.
	store := NewStore(StoreDeps{
		Customer: customerGetterFunc(func(_ context.Context, _ string) (*customerschema.Customer, error) {
			return &customerschema.Customer{Name: "Acme Corp"}, nil
		}),
	})

	customer, err := store.Customer(context.Background(), "acme")
	if err != nil {
		t.Fatalf("read customer: %v", err)
	}
	if customer.Domain != "" {
		t.Fatalf("expected no domain, got %q", customer.Domain)
	}
}

func TestStoreTranslatesAVanishedRecordAndPassesEverythingElseThrough(t *testing.T) {
	notFound := kaitenerrors.NotFound("GetCustomer.NotFound", "customer not found")
	unavailable := kaitenerrors.Unavailable("GetCustomer.Unavailable", "database unavailable")

	// ErrRecordNotFound is terminal for the connector and everything else asks for a
	// redelivery, so this translation is what decides whether an event comes back.
	store := NewStore(StoreDeps{
		Customer: customerGetterFunc(func(_ context.Context, _ string) (*customerschema.Customer, error) {
			return nil, notFound
		}),
	})
	if _, err := store.Customer(context.Background(), "acme"); !errors.Is(err, ErrRecordNotFound) {
		t.Fatalf("expected ErrRecordNotFound, got: %v", err)
	}

	store = NewStore(StoreDeps{
		Customer: customerGetterFunc(func(_ context.Context, _ string) (*customerschema.Customer, error) {
			return nil, unavailable
		}),
	})
	if _, err := store.Customer(context.Background(), "acme"); !errors.Is(err, unavailable) {
		t.Fatalf("expected the original error to pass through, got: %v", err)
	}
}

// --- link reads ---------------------------------------------------------------

func TestStoreReadsTheLinkAndTheErrorRecordedOnIt(t *testing.T) {
	store := NewStore(StoreDeps{
		CustomerLink: customerLinkFunc(func(_ context.Context, slug, integration string) (*customerschema.CustomerIntegration, error) {
			if slug != "acme" || integration != Name {
				t.Errorf("unexpected link read: %q / %q", slug, integration)
			}
			return &customerschema.CustomerIntegration{
				ExternalID: "rec_1",
				WebURL:     stringPtr("https://app.attio.com/w/acme"),
				LastError:  stringPtr("invalid name"),
			}, nil
		}),
		InstanceLink: instanceLinkFunc(func(_ context.Context, _, _ string) (*instanceschema.InstanceIntegration, error) {
			return &instanceschema.InstanceIntegration{ExternalID: "ws_1"}, nil
		}),
	})

	link, err := store.CustomerLink(context.Background(), "acme")
	if err != nil {
		t.Fatalf("read customer link: %v", err)
	}
	if link.ExternalID != "rec_1" || link.WebURL != "https://app.attio.com/w/acme" || link.LastError != "invalid name" {
		t.Fatalf("unexpected link: %+v", link)
	}

	// Both optional columns absent is the ordinary case for a link written before
	// either was recorded, and it must not read as a link with an error.
	instanceLink, err := store.InstanceLink(context.Background(), "acme-prod")
	if err != nil {
		t.Fatalf("read instance link: %v", err)
	}
	if instanceLink.WebURL != "" || instanceLink.LastError != "" {
		t.Fatalf("expected empty optionals, got %+v", instanceLink)
	}
}

func TestStoreTellsAMissingLinkFromAMissingRecord(t *testing.T) {
	// Both answer 404 and the connector branches differently: a missing record is
	// terminal, a missing link is the ordinary state of anything not yet synced. The
	// owning module spells them apart in the code, which is what this reads.
	cases := map[string]struct {
		code     string
		expected error
	}{
		"the customer is gone": {"GetCustomerIntegration.CustomerNotFound", ErrRecordNotFound},
		"the link is absent":   {"GetCustomerIntegration.NotFound", ErrLinkNotFound},
	}

	for name, testCase := range cases {
		t.Run(name, func(t *testing.T) {
			store := NewStore(StoreDeps{
				CustomerLink: customerLinkFunc(func(_ context.Context, _, _ string) (*customerschema.CustomerIntegration, error) {
					return nil, kaitenerrors.NotFound(testCase.code, "not found")
				}),
			})

			if _, err := store.CustomerLink(context.Background(), "acme"); !errors.Is(err, testCase.expected) {
				t.Fatalf("expected %v, got: %v", testCase.expected, err)
			}
		})
	}
}

func TestStoreTellsAMissingInstanceFromAMissingInstanceLink(t *testing.T) {
	for code, expected := range map[string]error{
		"GetInstanceIntegration.InstanceNotFound": ErrRecordNotFound,
		"GetInstanceIntegration.NotFound":         ErrLinkNotFound,
	} {
		store := NewStore(StoreDeps{
			InstanceLink: instanceLinkFunc(func(_ context.Context, _, _ string) (*instanceschema.InstanceIntegration, error) {
				return nil, kaitenerrors.NotFound(code, "not found")
			}),
		})

		if _, err := store.InstanceLink(context.Background(), "acme-prod"); !errors.Is(err, expected) {
			t.Fatalf("%s: expected %v, got: %v", code, expected, err)
		}
	}
}

// --- the upsert ---------------------------------------------------------------

func TestSetCustomerLinkRefreshesAnExistingLinkInOneCall(t *testing.T) {
	updates := 0
	store := NewStore(StoreDeps{
		UpdateCustomerLink: customerUpdateFunc(func(_ context.Context, slug, integration string,
			body customerschema.CustomerIntegration,
		) (*customerschema.CustomerIntegration, error) {
			updates++
			if slug != "acme" || integration != Name {
				t.Errorf("unexpected link write: %q / %q", slug, integration)
			}
			if body.ExternalID != "rec_1" || body.WebURL == nil || *body.WebURL != "https://app.attio.com/w/acme" {
				t.Errorf("unexpected update body: %+v", body)
			}
			return nil, nil
		}),
		// No creator: the common case is a link that already exists being refreshed
		// after every sync, and update-before-create is what makes that one call.
	})

	err := store.SetCustomerLink(context.Background(), "acme",
		Link{ExternalID: "rec_1", WebURL: "https://app.attio.com/w/acme"})
	if err != nil {
		t.Fatalf("set customer link: %v", err)
	}
	if updates != 1 {
		t.Fatalf("expected exactly one update, got %d", updates)
	}
}

func TestSetCustomerLinkCreatesTheLinkWhenThereIsNone(t *testing.T) {
	creates := 0
	store := NewStore(StoreDeps{
		UpdateCustomerLink: customerUpdateFunc(func(_ context.Context, _, _ string,
			_ customerschema.CustomerIntegration,
		) (*customerschema.CustomerIntegration, error) {
			return nil, kaitenerrors.NotFound("UpdateCustomerIntegration.NotFound", "no integration")
		}),
		CreateCustomerLink: customerCreateFunc(func(_ context.Context, _, _ string,
			body customerschema.CustomerIntegration,
		) (*customerschema.CustomerIntegration, error) {
			creates++
			if body.ExternalID != "rec_1" {
				t.Errorf("unexpected create body: %+v", body)
			}
			return nil, nil
		}),
	})

	if err := store.SetCustomerLink(context.Background(), "acme", Link{ExternalID: "rec_1"}); err != nil {
		t.Fatalf("set customer link: %v", err)
	}
	if creates != 1 {
		t.Fatalf("expected exactly one create, got %d", creates)
	}
}

func TestSetCustomerLinkUpdatesAfterLosingTheCreateRace(t *testing.T) {
	updates := 0
	store := NewStore(StoreDeps{
		UpdateCustomerLink: customerUpdateFunc(func(_ context.Context, _, _ string,
			_ customerschema.CustomerIntegration,
		) (*customerschema.CustomerIntegration, error) {
			updates++
			if updates == 1 {
				return nil, kaitenerrors.NotFound("UpdateCustomerIntegration.NotFound", "no integration")
			}
			return nil, nil
		}),
		CreateCustomerLink: customerCreateFunc(func(_ context.Context, _, _ string,
			_ customerschema.CustomerIntegration,
		) (*customerschema.CustomerIntegration, error) {
			return nil, kaitenerrors.Conflict("CreateCustomerIntegration.AlreadyExists", "already linked")
		}),
	})

	// Two deliveries of the same event can reach this at once, and neither should
	// fail: the conflict means somebody else created the link, which is the state
	// this was trying to reach.
	if err := store.SetCustomerLink(context.Background(), "acme", Link{ExternalID: "rec_1"}); err != nil {
		t.Fatalf("expected the lost create race to be recovered, got: %v", err)
	}
	if updates != 2 {
		t.Fatalf("expected the update to be retried after the conflict, got %d updates", updates)
	}
}

func TestSetCustomerLinkGivesUpWhenTheCustomerIsGone(t *testing.T) {
	store := NewStore(StoreDeps{
		UpdateCustomerLink: customerUpdateFunc(func(_ context.Context, _, _ string,
			_ customerschema.CustomerIntegration,
		) (*customerschema.CustomerIntegration, error) {
			return nil, kaitenerrors.NotFound("UpdateCustomerIntegration.CustomerNotFound", "customer not found")
		}),
		// No creator: creating a link for a customer that no longer exists would
		// fail on the same foreign key, so a call here is a bug this test catches.
	})

	err := store.SetCustomerLink(context.Background(), "acme", Link{ExternalID: "rec_1"})
	if !errors.Is(err, ErrRecordNotFound) {
		t.Fatalf("expected ErrRecordNotFound, got: %v", err)
	}
}

func TestSetLinkAlwaysWritesTheErrorFieldEvenWhenItIsEmpty(t *testing.T) {
	var body customerschema.CustomerIntegration
	store := NewStore(StoreDeps{
		UpdateCustomerLink: customerUpdateFunc(func(_ context.Context, _, _ string,
			received customerschema.CustomerIntegration,
		) (*customerschema.CustomerIntegration, error) {
			body = received
			return nil, nil
		}),
	})

	if err := store.SetCustomerLink(context.Background(), "acme", Link{ExternalID: "rec_1"}); err != nil {
		t.Fatalf("set customer link: %v", err)
	}

	// These bodies are not patches -- the integration store writes every field it is
	// handed -- so a nil here would leave the previous sync's error on the record
	// forever. A successful sync clears it by writing the empty string.
	if body.LastError == nil {
		t.Fatal("expected the empty error to be written rather than omitted")
	}
	if *body.LastError != "" {
		t.Fatalf("expected an empty error, got %q", *body.LastError)
	}
	if body.WebURL == nil || *body.WebURL != "" {
		t.Fatalf("expected an empty web url to be written, got %v", body.WebURL)
	}
}

func TestSetInstanceLinkFollowsTheSameThreeSteps(t *testing.T) {
	updates, creates := 0, 0
	store := NewStore(StoreDeps{
		UpdateInstanceLink: instanceUpdateFunc(func(_ context.Context, slug, integration string,
			body instanceschema.InstanceIntegration,
		) (*instanceschema.InstanceIntegration, error) {
			updates++
			if slug != "acme-prod" || integration != Name {
				t.Errorf("unexpected link write: %q / %q", slug, integration)
			}
			if updates == 1 {
				return nil, kaitenerrors.NotFound("UpdateInstanceIntegration.NotFound", "no integration")
			}
			if body.LastError == nil || *body.LastError != "invalid workspace" {
				t.Errorf("expected the recorded error to survive the retry, got %+v", body)
			}
			return nil, nil
		}),
		CreateInstanceLink: instanceCreateFunc(func(_ context.Context, _, _ string,
			_ instanceschema.InstanceIntegration,
		) (*instanceschema.InstanceIntegration, error) {
			creates++
			return nil, kaitenerrors.Conflict("CreateInstanceIntegration.AlreadyExists", "already linked")
		}),
	})

	err := store.SetInstanceLink(context.Background(), "acme-prod",
		Link{ExternalID: "ws_1", LastError: "invalid workspace"})
	if err != nil {
		t.Fatalf("set instance link: %v", err)
	}
	if updates != 2 || creates != 1 {
		t.Fatalf("expected update, create, update: got %d updates and %d creates", updates, creates)
	}
}

// The other half of the conflict, and the one the recovery update must not be tried
// for: the external id belongs to a different record, so no number of updates to THIS
// record's link will ever reach the state being asked for -- and the transaction the
// failed insert aborted answers 25P02 to the attempt, which is what would reach the
// log instead of the error that says what is actually wrong.
func TestSetLinkDoesNotRetryWhenAnotherRecordOwnsTheExternalID(t *testing.T) {
	t.Run("customer", func(t *testing.T) {
		updates := 0
		store := NewStore(StoreDeps{
			UpdateCustomerLink: customerUpdateFunc(func(_ context.Context, _, _ string,
				_ customerschema.CustomerIntegration,
			) (*customerschema.CustomerIntegration, error) {
				updates++

				return nil, kaitenerrors.NotFound("UpdateCustomerIntegration.NotFound", "no integration")
			}),
			CreateCustomerLink: customerCreateFunc(func(_ context.Context, _, _ string,
				_ customerschema.CustomerIntegration,
			) (*customerschema.CustomerIntegration, error) {
				return nil, kaitenerrors.Conflict("CreateCustomerIntegration.ExternalIDConflict",
					`Integration external_id "rec_1" is already used for adapter "kaiten.integration.crm.attio"`)
			}),
		})

		err := store.SetCustomerLink(context.Background(), "acme", Link{ExternalID: "rec_1"})

		if err == nil {
			t.Fatal("expected the conflict to be reported, got nil")
		}
		if updates != 1 {
			t.Fatalf("expected the update NOT to be retried, got %d updates", updates)
		}
		// The message an operator reads has to be this one and not 25P02, which is
		// the whole reason the retry is skipped.
		if !strings.Contains(err.Error(), "already used") {
			t.Fatalf("expected the real cause to survive, got: %v", err)
		}
	})

	t.Run("instance", func(t *testing.T) {
		updates := 0
		store := NewStore(StoreDeps{
			UpdateInstanceLink: instanceUpdateFunc(func(_ context.Context, _, _ string,
				_ instanceschema.InstanceIntegration,
			) (*instanceschema.InstanceIntegration, error) {
				updates++

				return nil, kaitenerrors.NotFound("UpdateInstanceIntegration.NotFound", "no integration")
			}),
			CreateInstanceLink: instanceCreateFunc(func(_ context.Context, _, _ string,
				_ instanceschema.InstanceIntegration,
			) (*instanceschema.InstanceIntegration, error) {
				return nil, kaitenerrors.Conflict("CreateInstanceIntegration.ExternalIDConflict",
					`Integration external_id "ws_1" is already used for adapter "kaiten.integration.crm.attio"`)
			}),
		})

		err := store.SetInstanceLink(context.Background(), "acme-prod", Link{ExternalID: "ws_1"})

		if err == nil {
			t.Fatal("expected the conflict to be reported, got nil")
		}
		if updates != 1 {
			t.Fatalf("expected the update NOT to be retried, got %d updates", updates)
		}
		if !strings.Contains(err.Error(), "already used") {
			t.Fatalf("expected the real cause to survive, got: %v", err)
		}
	})
}
