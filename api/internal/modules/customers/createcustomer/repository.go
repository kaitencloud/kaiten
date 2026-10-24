package createcustomer

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/integrationurl"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type CommandRepository struct {
	uof *uow.UnitOfWork
}

func NewCommandRepository(uof *uow.UnitOfWork) *CommandRepository {
	return &CommandRepository{uof: uof}
}

// q resolves the sqlc Queries bound to whatever DBTX is active for
// ctx -- the caller's transaction if Transact opened one, the pool
// otherwise.
func (r *CommandRepository) q(ctx context.Context) *db.Queries {
	return db.New(r.uof.DBTX(ctx))
}

func (r *CommandRepository) CreateCustomer(ctx context.Context, name string, slug string, externalCustomID *string, domain *string, organizationID uuid.UUID, userID uuid.UUID, billingEmail ...string) (*schema.Customer, error) {
	customer := db.CreateCustomerParams{
		Name:               name,
		Slug:               slug,
		ExternalCustomerID: externalCustomID,
		Domain:             domain,
		OrganizationID:     organizationID,
		UserID:             userID,
		BillingEmail:       nil,
	}
	if len(billingEmail) > 0 && billingEmail[0] != "" {
		customer.BillingEmail = &billingEmail[0]
	}

	c, err := r.q(ctx).CreateCustomer(ctx, customer)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.Forbidden(
				"CurrentUser.NotInOrganization",
				fmt.Sprintf("User %s does not belong to organization %s", userID, organizationID),
			)
		}
		if kaitenerrors.IsUniqueViolation(err) {
			// customer's only UNIQUE constraint besides the primary key is
			// (organization_id, slug) -- see the initial migration -- so
			// any unique violation here is a slug conflict. Wrapping
			// slugutil.ErrConflict (rather than kaitenerrors.Conflict
			// directly) lets slugutil.Retry recognize this as retryable
			// when the slug was auto-generated.
			return nil, kaitenerrors.Wrap(slugutil.ErrConflict, kaitenerrors.KindConflict,
				"CreateCustomer.SlugConflict", fmt.Sprintf("Customer with slug %q already exists in this organization", slug))
		}
		return nil, err
	}

	return &schema.Customer{
		ID:                 c.ID,
		Name:               c.Name,
		Slug:               c.Slug,
		ExternalCustomerID: c.ExternalCustomerID,
		Domain:             c.Domain,
		BillingEmail:       c.BillingEmail,
		CreatedBy:          shared.User{ID: c.CreatedByID, Name: c.CreatedByName},
		UpdatedBy:          shared.User{ID: c.UpdatedByID, Name: c.UpdatedByName},
		CreatedAt:          c.CreatedAt.Time,
		UpdatedAt:          c.UpdatedAt.Time,
	}, nil
}

func (r *CommandRepository) UpsertCustomerIntegrations(ctx context.Context, organizationID, customerID uuid.UUID, input map[string]schema.CustomerIntegration) (map[string]schema.CustomerIntegration, error) {
	// nil (not an empty map) so created entities match what GET endpoints
	// return: `integrations` is omitted from JSON when there is none.
	if len(input) == 0 {
		return nil, nil
	}
	integrations := make(map[string]schema.CustomerIntegration, len(input))
	queries := r.q(ctx)

	for rawAdapter, integration := range input {
		adapter := strings.TrimSpace(rawAdapter)
		if adapter == "" {
			return nil, kaitenerrors.Validation("CreateCustomer.InvalidIntegrationAdapter", "Integration adapter key cannot be empty")
		}
		if _, exists := integrations[adapter]; exists {
			return nil, kaitenerrors.Validation("CreateCustomer.DuplicateIntegrationAdapter", fmt.Sprintf("Duplicate integration adapter %q", adapter))
		}

		externalID := strings.TrimSpace(integration.ExternalID)
		if externalID == "" {
			return nil, kaitenerrors.Validation("CreateCustomer.InvalidIntegrationExternalID", fmt.Sprintf("Integration %q external_id is required", adapter))
		}

		metadata := integration.Metadata
		if metadata == nil {
			metadata = map[string]any{}
		}

		metadataBytes, err := json.Marshal(metadata)
		if err != nil {
			return nil, kaitenerrors.Validation("CreateCustomer.InvalidIntegrationMetadata", fmt.Sprintf("Integration %q metadata must be a valid JSON object", adapter))
		}

		webURL, err := integrationurl.Normalize(integration.WebURL)
		if err != nil {
			return nil, kaitenerrors.Validation("CreateCustomer.InvalidIntegrationWebURL", fmt.Sprintf("Integration %q web_url must be an absolute http(s) URL", adapter))
		}

		lastError := normalizeOptionalString(integration.LastError)
		syncedAt := time.Now().UTC()

		rows, err := queries.UpsertCustomerIntegration(ctx, db.UpsertCustomerIntegrationParams{
			OrganizationID: organizationID,
			CustomerID:     customerID,
			Adapter:        adapter,
			ExternalID:     externalID,
			Metadata:       metadataBytes,
			WebUrl:         webURL,
			SyncedAt:       pgtime.TimePtrToPgTimestamptz(&syncedAt),
			LastError:      lastError,
		})
		if err != nil {
			return nil, err
		}
		if rows == 0 {
			return nil, kaitenerrors.NotFound("CreateCustomer.NotFound", fmt.Sprintf("Customer with ID %s not found", customerID))
		}

		integrations[adapter] = schema.CustomerIntegration{
			ExternalID: externalID,
			Metadata:   metadata,
			WebURL:     webURL,
			SyncedAt:   syncedAt,
			LastError:  lastError,
		}
	}

	return integrations, nil
}

func normalizeOptionalString(value *string) *string {
	if value == nil {
		return nil
	}

	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}

	return &trimmed
}
