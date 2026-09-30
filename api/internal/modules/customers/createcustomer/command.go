package createcustomer

import "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"

type Command struct {
	Name               string                                `json:"name" example:"Awesome customer"`
	ExternalCustomerID *string                               `json:"externalCustomerID" example:"external-customer-id-12345"`
	Domain             *string                               `json:"domain,omitempty"`
	Slug               *string                               `json:"slug,omitempty"`
	Integrations       map[string]schema.CustomerIntegration `json:"integrations,omitempty"`
}
