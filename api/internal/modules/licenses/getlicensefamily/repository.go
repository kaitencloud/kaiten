package getlicensefamily

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/familyview"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type QueryRepository struct {
	reader *familyview.Reader
}

func NewQueryRepository(repository *db.Queries) *QueryRepository {
	return &QueryRepository{
		reader: familyview.NewReader(repository),
	}
}

// GetFamily resolves one family to the version the caller asked for, and
// turns the view's empty answers into this endpoint's 404s.
func (r *QueryRepository) GetFamily(
	ctx context.Context, organizationID uuid.UUID, familySlug string, query *Query,
) (*schema.LicenseFamilyView, error) {
	view, found, err := r.reader.Get(ctx, organizationID, familySlug, familyview.Options{
		Version:         query.Version,
		IncludeVersions: query.IncludeVersions,
	})
	if errors.Is(err, familyview.ErrVersionNotFound) {
		return nil, kaitenerrors.NotFound("GetLicenseFamily.VersionNotFound",
			fmt.Sprintf("License family %q has no version %d", familySlug, *query.Version))
	}
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, kaitenerrors.NotFound("GetLicenseFamily.NotFound",
			fmt.Sprintf("License family with slug %q not found", familySlug))
	}

	// Nothing to serve. A caller that asked for the history asked a question the
	// view answers anyway: the family is the subject, and "nothing is published"
	// is a fact about it -- the same shape the family list gives this family,
	// present with no current version. The history is read before resolution for
	// that reason: ordered the other way, ?include=versions on a draft-only
	// family 404s and withholds the list from the caller looking for why.
	//
	// Without the history, the caller asked only for the current version and
	// there is none. The family exists, so this is not a 404 about the family but
	// about there being nothing to serve from it. The slug and version count go
	// in the message because Problem has no member for structured metadata; a
	// console wanting that for a whole catalogue reads GET /license-families.
	if view.CurrentVersion == nil && query.Version == nil && !query.IncludeVersions {
		return nil, kaitenerrors.NotFound("GetLicenseFamily.NoPublishedVersion",
			fmt.Sprintf("License family %q has no published version (%d version(s), all draft or archived)",
				view.Slug, view.VersionCount))
	}

	return view, nil
}
