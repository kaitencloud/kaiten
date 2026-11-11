package aihistory

import (
	"time"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
)

// FilterQuery are the query parameters every inference listing shares, as
// the transport received them: empty is absent. Huma has already checked the
// enums, so the conversions below cannot see an unknown value.
type FilterQuery struct {
	From, To      time.Time
	Status        string
	TransactionID string
	Authorized    string
	ModelSlug     string
	Model         string
	RequestType   string
	Cursor        string
	Limit         int32
}

// FilterOf turns the shared query parameters into a Filter.
func FilterOf(p FilterQuery) Filter {
	filter := Filter{From: p.From, To: p.To, Limit: p.Limit}
	if p.Status != "" {
		s := db.AiInferenceStatus(p.Status)
		filter.Status = &s
	}
	if p.TransactionID != "" {
		filter.TransactionID = &p.TransactionID
	}
	if p.Authorized != "" {
		authorized := p.Authorized == "true"
		filter.Authorized = &authorized
	}
	if p.ModelSlug != "" {
		filter.ModelSlug = &p.ModelSlug
	}
	if p.Model != "" {
		filter.Model = &p.Model
	}
	if p.RequestType != "" {
		t := db.AiRequestType(p.RequestType)
		filter.RequestType = &t
	}
	if p.Cursor != "" {
		filter.Cursor = &p.Cursor
	}
	return filter
}
