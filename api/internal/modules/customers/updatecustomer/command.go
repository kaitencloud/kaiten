package updatecustomer

type Command struct {
	Name               string  `json:"name" example:"Awesome customer"`
	ExternalCustomerID *string `json:"externalCustomerID" example:"external-customer-id-12345"`
	Domain             *string `json:"domain,omitempty"`
}
