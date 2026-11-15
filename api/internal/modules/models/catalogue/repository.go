// Package catalogue holds the model catalogue's shared persistence and
// presentation. Queries never leave the module; all writes join the caller's UOW.
package catalogue

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/modules/models/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

var costPattern = regexp.MustCompile(`^[0-9]{1,6}(\.[0-9]{1,12})?$`)

// Prepare validates non-HTTP callers too, and normalizes optional fields to
// their creation defaults. On PUT these defaults replace, not merge, old values.
func Prepare(model schema.Model, operation string) (schema.Model, db.CreateModelParams, error) {
	if model.Name == "" || utf8.RuneCountInString(model.Name) > 100 || model.Vendor == "" || utf8.RuneCountInString(model.Vendor) > 100 || !slugutil.Validate(model.Slug) {
		return model, db.CreateModelParams{}, apierrors.UnprocessableEntity(operation+".InvalidModel", "name, vendor and a valid slug are required")
	}
	switch model.Modality {
	case schema.Text, schema.Image, schema.Audio, schema.Video, schema.Embedding, schema.Multimodal:
	default:
		return model, db.CreateModelParams{}, apierrors.UnprocessableEntity(operation+".InvalidModel", "invalid model modality")
	}
	if model.Status == "" {
		model.Status = schema.Active
	}
	switch model.Status {
	case schema.Active, schema.Deprecated, schema.Archived:
	default:
		return model, db.CreateModelParams{}, apierrors.UnprocessableEntity(operation+".InvalidModel", "invalid model status")
	}
	if model.VendorCosts.Currency == "" {
		model.VendorCosts.Currency = "USD"
	}
	if model.VendorCosts.Currency != "USD" {
		return model, db.CreateModelParams{}, apierrors.UnprocessableEntity(operation+".InvalidModel", "vendor costs must use USD")
	}
	if model.Metadata == nil {
		model.Metadata = map[string]interface{}{}
	}
	metadata, err := json.Marshal(model.Metadata)
	if err != nil {
		return model, db.CreateModelParams{}, apierrors.UnprocessableEntity(operation+".InvalidModel", "metadata must be a JSON object")
	}
	ids := make([]string, 0, len(model.ExternalIDs))
	seen := make(map[string]bool, len(model.ExternalIDs))
	for _, id := range model.ExternalIDs {
		if strings.ContainsRune(id, 0) || utf8.RuneCountInString(id) < 1 || utf8.RuneCountInString(id) > 255 {
			return model, db.CreateModelParams{}, apierrors.UnprocessableEntity(operation+".InvalidModel", "external IDs must be 1–255 characters without NUL")
		}
		if seen[id] {
			return model, db.CreateModelParams{}, apierrors.Conflict(operation+".ExternalIdConflict", "external IDs must be unique")
		}
		seen[id] = true
		ids = append(ids, id)
	}
	sort.Strings(ids)
	model.ExternalIDs = ids
	costs := []*string{model.VendorCosts.PerInputToken, model.VendorCosts.PerCachedInputToken, model.VendorCosts.PerCacheWriteToken, model.VendorCosts.PerOutputToken, model.VendorCosts.PerRequest, model.VendorCosts.PerUnit}
	numbers := make([]pgtype.Numeric, len(costs))
	for i, cost := range costs {
		if cost == nil {
			continue
		}
		if !costPattern.MatchString(*cost) {
			return model, db.CreateModelParams{}, apierrors.UnprocessableEntity(operation+".InvalidModel", "vendor costs must be nonnegative decimal strings with at most 6 integer and 12 fractional digits")
		}
		if err := numbers[i].Scan(*cost); err != nil {
			return model, db.CreateModelParams{}, err
		}
	}
	return model, db.CreateModelParams{
		OrganizationID: uuid.Nil, UserID: uuid.Nil, // Filled from the authenticated actor by the write use case.
		Name: model.Name, Slug: model.Slug, Description: model.Description, Vendor: model.Vendor,
		Modality: db.ModelModality(model.Modality), Status: db.ModelStatus(model.Status), Metadata: metadata,
		VendorCostCurrency:      model.VendorCosts.Currency,
		VendorCostPerInputToken: numbers[0], VendorCostPerCachedInputToken: numbers[1], VendorCostPerCacheWriteToken: numbers[2],
		VendorCostPerOutputToken: numbers[3], VendorCostPerRequest: numbers[4], VendorCostPerUnit: numbers[5],
	}, nil
}

func Get(ctx context.Context, q *db.Queries, orgID uuid.UUID, slug, operation string) (*schema.Model, error) {
	row, err := q.GetModel(ctx, db.GetModelParams{OrganizationID: orgID, Slug: slug})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apierrors.NotFound(operation+".NotFound", "model not found")
	}
	if err != nil {
		return nil, err
	}
	models, err := Present(ctx, q, orgID, []db.Model{row})
	if err != nil {
		return nil, err
	}
	return models[0], nil
}

// CheckExternalIDs must run under LockModelCatalogue, before replacing the IDs.
// The model's own slug is allowed as an external ID: slug-first lookup resolves
// the same entry. IDs belonging to another model are never allowed.
func CheckExternalIDs(ctx context.Context, q *db.Queries, orgID, modelID uuid.UUID, ids []string, operation string) error {
	conflict, err := q.ModelExternalIDsConflict(ctx, db.ModelExternalIDsConflictParams{OrganizationID: orgID, ModelID: modelID, ExternalIds: ids})
	if err != nil {
		return err
	}
	if conflict {
		return apierrors.Conflict(operation+".ExternalIdConflict", "external ID belongs to another model or shadows its slug")
	}
	return nil
}

func ReplaceExternalIDs(ctx context.Context, q *db.Queries, orgID, modelID uuid.UUID, ids []string) error {
	if err := q.DeleteModelExternalIDs(ctx, db.DeleteModelExternalIDsParams{OrganizationID: orgID, ModelID: modelID}); err != nil {
		return err
	}
	return q.InsertModelExternalIDs(ctx, db.InsertModelExternalIDsParams{OrganizationID: orgID, ModelID: modelID, ExternalIds: ids})
}

// WriteError also maps constraint races with non-catalogue writers. In particular
// the rule FK is the last line of defense if a rule is inserted during deletion.
func WriteError(err error, operation string) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch {
		case pgErr.Code == "23505" && pgErr.ConstraintName == "model_organization_id_slug_key":
			return apierrors.Conflict("CreateModel.SlugConflict", "model slug already exists")
		case pgErr.Code == "23505" && pgErr.ConstraintName == "model_external_id_pkey":
			return apierrors.Conflict(operation+".ExternalIdConflict", "external ID already exists")
		case pgErr.Code == "23503" && pgErr.ConstraintName == "ccr_model_id_fkey" && operation == "DeleteModel":
			return apierrors.Conflict("DeleteModel.InUse", "model is referenced by a conversion rule")
		}
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return apierrors.Forbidden("CurrentUser.NotInOrganization", "actor is not an active member of this organization")
	}
	return err
}

// Present fetches all external IDs in one organization-scoped query. Decimal
// formatting is exact (no float64) and empty collections are never null.
func Present(ctx context.Context, q *db.Queries, orgID uuid.UUID, rows []db.Model) ([]*schema.Model, error) {
	models := make([]*schema.Model, 0, len(rows))
	ids := make([]uuid.UUID, 0, len(rows))
	byID := make(map[uuid.UUID]*schema.Model, len(rows))
	for _, row := range rows {
		model := &schema.Model{
			ID: row.ID, Name: row.Name, Slug: row.Slug, Description: row.Description, Vendor: row.Vendor,
			Modality: schema.Modality(row.Modality), Status: schema.Status(row.Status), CreatedAt: row.CreatedAt.Time, UpdatedAt: row.UpdatedAt.Time,
			ExternalIDs: []string{}, Metadata: map[string]interface{}{},
			VendorCosts: schema.VendorCosts{
				Currency:      row.VendorCostCurrency,
				PerInputToken: decimalString(row.VendorCostPerInputToken), PerCachedInputToken: decimalString(row.VendorCostPerCachedInputToken),
				PerCacheWriteToken: decimalString(row.VendorCostPerCacheWriteToken), PerOutputToken: decimalString(row.VendorCostPerOutputToken),
				PerRequest: decimalString(row.VendorCostPerRequest), PerUnit: decimalString(row.VendorCostPerUnit),
			},
		}
		if err := json.Unmarshal(row.Metadata, &model.Metadata); err != nil {
			return nil, err
		}
		models = append(models, model)
		ids = append(ids, row.ID)
		byID[row.ID] = model
	}
	if len(ids) == 0 {
		return models, nil
	}
	externalIDs, err := q.GetModelExternalIDs(ctx, db.GetModelExternalIDsParams{OrganizationID: orgID, ModelIds: ids})
	if err != nil {
		return nil, err
	}
	for _, row := range externalIDs {
		byID[row.ModelID].ExternalIDs = append(byID[row.ModelID].ExternalIDs, row.ExternalID)
	}
	return models, nil
}

func decimalString(n pgtype.Numeric) *string {
	if !n.Valid {
		return nil
	}
	digits := n.Int.String()
	exp := int(n.Exp)
	if exp >= 0 {
		digits += strings.Repeat("0", exp)
	} else {
		if len(digits) <= -exp {
			digits = strings.Repeat("0", -exp-len(digits)+1) + digits
		}
		point := len(digits) + exp
		digits = digits[:point] + "." + digits[point:]
		digits = strings.TrimRight(strings.TrimRight(digits, "0"), ".")
	}
	return &digits
}
