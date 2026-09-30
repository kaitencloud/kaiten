package dbmap_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
)

// The single normalization the create and update repositories share. Spelled
// differently in each, neither checking the result against the enum, the
// generated Scan accepts any string.
func TestNormalizeType(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		val     schema.Type
		want    db.LicenseType
		wantErr bool
	}{
		{"already upper-case", schema.Paid, db.LicenseTypePAID, false},
		{"lower-case", "trial", db.LicenseTypeTRIAL, false},
		{"mixed case", "cOmMuNiTy", db.LicenseTypeCOMMUNITY, false},
		{"development", schema.Development, db.LicenseTypeDEVELOPMENT, false},
		{"empty", "", "", true},
		{"not a member of the enum", "ENTERPRISE", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := dbmap.NormalizeType(tt.val)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("NormalizeType(%q) error = nil, want error", tt.val)
				}
				return
			}
			if err != nil {
				t.Fatalf("NormalizeType(%q) error = %v, want nil", tt.val, err)
			}
			if got != tt.want {
				t.Errorf("NormalizeType(%q) = %q, want %q", tt.val, got, tt.want)
			}
		})
	}
}

// TestToLicense pins what the DTO carries about the family, which is the one
// asymmetric pair in it: FamilyID comes out of the row on every read, and
// FamilySlug never does -- it is an input on create and nothing else. A mapper
// that filled FamilySlug from anywhere would be promising a value every other
// read path would return empty.
func TestToLicense(t *testing.T) {
	t.Parallel()

	familyID := uuid.New()
	createdAt := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)
	updatedAt := time.Date(2026, 9, 2, 12, 0, 0, 0, time.UTC)

	got, err := dbmap.ToLicense(&db.License{
		ID:             uuid.New(),
		Name:           "Pro",
		Slug:           "pro-v2",
		Description:    "Second version",
		Type:           db.LicenseTypePAID,
		Version:        2,
		VersionName:    ptr.To("Autumn 2026"),
		IsDefault:      true,
		FamilyID:       familyID,
		OrganizationID: uuid.New(),
		CreatedAt:      pgtype.Timestamp{Time: createdAt, Valid: true},
		UpdatedAt:      pgtype.Timestamp{Time: updatedAt, Valid: true},
	})
	if err != nil {
		t.Fatalf("ToLicense() error = %v, want nil", err)
	}

	if got.FamilyID != familyID {
		t.Errorf("ToLicense().FamilyID = %v, want %v", got.FamilyID, familyID)
	}
	if got.FamilySlug != "" {
		t.Errorf("ToLicense().FamilySlug = %q, want empty: the family slug is not a property of the version", got.FamilySlug)
	}
	if got.Version != "2" {
		t.Errorf("ToLicense().Version = %q, want %q", got.Version, "2")
	}
	if got.Type != schema.Paid {
		t.Errorf("ToLicense().Type = %q, want %q", got.Type, schema.Paid)
	}
	if !got.IsDefault {
		t.Error("ToLicense().IsDefault = false, want true")
	}
	if !got.CreatedAt.Equal(createdAt) || !got.UpdatedAt.Equal(updatedAt) {
		t.Errorf("ToLicense() timestamps = (%v, %v), want (%v, %v)", got.CreatedAt, got.UpdatedAt, createdAt, updatedAt)
	}
}
