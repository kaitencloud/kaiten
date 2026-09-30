// Package listorganizations lists every organization in the deployment, across
// tenants.
//
// It has no endpoint.go, and this is the one operation in the tree that could
// never acquire one. A cross-tenant list is exactly the enumeration the Platform
// API's invisibility tests exist to prevent: no credential, organization or
// platform, may learn that another tenant exists -- and a platform credential is
// not an exception, it is the case those tests were written for. What makes this
// list legitimate is not a scope but the position of its caller: an operator at a
// shell on the deployment's own database, about to name a tenant to a destructive
// command, who should not have to open a psql session to find its external id.
// Somebody who can run this can already read the table. Reachable only through
// kaiten.InProcess.
package listorganizations

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/schema"
)

type UseCase struct {
	repository *QueryRepository
}

func NewUseCase(queries *db.Queries) *UseCase {
	return &UseCase{repository: NewQueryRepository(queries)}
}

// Execute returns every organization, unpaginated and unfiltered.
//
// No page and no cursor: the caller is an operator reading a table whose size is
// the deployment's tenant count, and the completion it backs needs the whole set
// to filter locally. If a deployment ever has enough tenants for that to hurt,
// the answer is a prefix filter on the query, not a page an operator has to walk.
func (h *UseCase) Execute(ctx context.Context) ([]schema.Organization, error) {
	return h.repository.ListOrganizations(ctx)
}
