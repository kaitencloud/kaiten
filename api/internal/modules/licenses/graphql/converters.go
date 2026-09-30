package graphql

import (
	"errors"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
)

// ErrMissingIdentity is returned when identity is not in context.
var ErrMissingIdentity = errors.New("missing identity in context")

// toLicenseSchemas maps rows to DTOs through dbmap, the module's single
// row-to-DTO crossing.
//
// Hand-written converters here are how the GraphQL surface comes to disagree
// with itself: one that omits isDefault makes `license(id:)` report every
// license as non-default while `license(slug:)` reports the truth. Anything the
// API says about a license row is said in one place.
func toLicenseSchemas(licenses []db.License) ([]schema.License, error) {
	result := make([]schema.License, len(licenses))
	for i := range licenses {
		license, err := dbmap.ToLicense(&licenses[i])
		if err != nil {
			return nil, err
		}
		result[i] = *license
	}
	return result, nil
}
