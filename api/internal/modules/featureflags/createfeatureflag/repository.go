package createfeatureflag

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
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

func (r *CommandRepository) CreateFeatureFlag(ctx context.Context, flag *schema.FeatureFlag, organizationID uuid.UUID) (*schema.FeatureFlag, error) {
	defaultVariantBytes, err := json.Marshal(flag.DefaultVariant)
	if err != nil {
		return nil, err
	}

	variantsBytes, err := json.Marshal(flag.Variants)
	if err != nil {
		return nil, err
	}

	targetingRulesBytes, err := json.Marshal(flag.Targetings)
	if err != nil {
		return nil, err
	}

	metadataBytes, err := dbmap.MetadataColumn(flag.Metadata)
	if err != nil {
		return nil, err
	}

	params := db.CreateFeatureFlagParams{
		Type:           flag.Type,
		Variants:       variantsBytes,
		TargetingRules: targetingRulesBytes,
		Name:           flag.Name,
		Description:    flag.Description,
		Slug:           flag.Slug,
		Metadata:       metadataBytes,
		Enabled:        flag.Enabled,
		EventName:      flag.EventName,
		DefaultVariant: defaultVariantBytes,
		OrganizationID: organizationID,
	}

	res, err := r.q(ctx).CreateFeatureFlag(ctx, params)
	if err != nil {
		if kaitenerrors.IsUniqueViolation(err) {
			// feature_flags' only UNIQUE constraint besides the primary key
			// is (slug, organization_id), so any unique violation here is a
			// slug conflict. Wrapping slugutil.ErrConflict lets
			// slugutil.Retry recognize this as retryable when the slug was
			// auto-generated.
			return nil, kaitenerrors.Wrap(slugutil.ErrConflict, kaitenerrors.KindConflict,
				"CreateFeatureFlag.SlugConflict", fmt.Sprintf("Feature flag with slug %q already exists", flag.Slug))
		}
		return nil, err
	}

	return dbmap.ToFeatureFlag(res)
}
