package graphql

import (
	"errors"

	"github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

// ErrMissingIdentity is returned when identity is not in context.
var ErrMissingIdentity = errors.New("missing identity in context")

func toCustomerSchema(c db.GetCustomersByIDsRow) schema.Customer {
	return schema.Customer{
		ID:                 c.ID,
		Name:               c.Name,
		Slug:               c.Slug,
		ExternalCustomerID: c.ExternalCustomerID,
		Domain:             c.Domain,
		BillingEmail:       c.BillingEmail,
		CreatedBy:          shared.User{ID: c.CreatedByID, Name: c.CreatedByName},
		CreatedAt:          c.CreatedAt.Time,
		UpdatedBy:          shared.User{ID: c.UpdatedByID, Name: c.UpdatedByName},
		UpdatedAt:          c.UpdatedAt.Time,
	}
}

func toCustomerSchemaFromGetCustomersRow(c db.GetCustomersRow) schema.Customer {
	return schema.Customer{
		ID:                 c.ID,
		Name:               c.Name,
		Slug:               c.Slug,
		ExternalCustomerID: c.ExternalCustomerID,
		Domain:             c.Domain,
		BillingEmail:       c.BillingEmail,
		CreatedBy:          shared.User{ID: c.CreatedByID, Name: c.CreatedByName},
		CreatedAt:          c.CreatedAt.Time,
		UpdatedBy:          shared.User{ID: c.UpdatedByID, Name: c.UpdatedByName},
		UpdatedAt:          c.UpdatedAt.Time,
	}
}

func toCustomerSchemasFromGetCustomersRows(customers []db.GetCustomersRow) []schema.Customer {
	result := make([]schema.Customer, len(customers))
	for i, c := range customers {
		result[i] = toCustomerSchemaFromGetCustomersRow(c)
	}
	return result
}

func toCustomerSchemaFromGetCustomersByExternalIDRow(c db.GetCustomersByExternalIDRow) schema.Customer {
	return schema.Customer{
		ID:                 c.ID,
		Name:               c.Name,
		Slug:               c.Slug,
		ExternalCustomerID: c.ExternalCustomerID,
		Domain:             c.Domain,
		BillingEmail:       c.BillingEmail,
		CreatedBy:          shared.User{ID: c.CreatedByID, Name: c.CreatedByName},
		CreatedAt:          c.CreatedAt.Time,
		UpdatedBy:          shared.User{ID: c.UpdatedByID, Name: c.UpdatedByName},
		UpdatedAt:          c.UpdatedAt.Time,
	}
}

func toCustomerSchemaFromGetOneCustomerRow(c db.GetOneCustomerRow) schema.Customer {
	return schema.Customer{
		ID:                 c.ID,
		Name:               c.Name,
		Slug:               c.Slug,
		ExternalCustomerID: c.ExternalCustomerID,
		Domain:             c.Domain,
		BillingEmail:       c.BillingEmail,
		CreatedBy:          shared.User{ID: c.CreatedByID, Name: c.CreatedByName},
		CreatedAt:          c.CreatedAt.Time,
		UpdatedBy:          shared.User{ID: c.UpdatedByID, Name: c.UpdatedByName},
		UpdatedAt:          c.UpdatedAt.Time,
	}
}
