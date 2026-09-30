package kaiten

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/archivemetadatafield"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/createmetadatafield"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/dryrunmetadatafield"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/getmetadatafields"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/reordermetadatafields"
	metadatafieldschema "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/unarchivemetadatafield"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/updatemetadatafield"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// MetadataFields is the metadatafields module's seven operations: a field is
// declared, edited, ordered and archived, and never deleted.
//
// There is no Delete, and that is the module's design rather than an omission:
// Archive sets archived_at and leaves the row, so metadata written under a field
// stays interpretable after the field leaves the active schema. Unarchive is the
// inverse and can fail on a key another active field has since taken.
//
// DryRun is the only read on this surface that answers about a write: it reports
// how many stored values would stop satisfying a candidate schema, which is what an
// edit dialog shows before it lets anyone save. It mutates nothing and requires the
// same scope as the update it previews, because a caller who may not edit a field
// has no business enumerating the resources that would break if they did.
//
// See Customers for the naming and argument-order convention.
type MetadataFields struct {
	uc *metadatafields.UseCases
}

// MetadataFields returns the metadata fields surface.
func (k *Kaiten) MetadataFields() MetadataFields {
	return MetadataFields{uc: k.modules.MetadataFields}
}

func (m MetadataFields) Create(
	ctx context.Context, cl caller.OrganizationCaller,
	cmd *createmetadatafield.CreateMetadataFieldInput,
) (*metadatafieldschema.MetadataField, error) {
	if err := cl.Require(createmetadatafield.RequiredScope); err != nil {
		return nil, err
	}

	return m.uc.CreateMetadataField.Execute(bindOrganization(ctx, cl), cmd)
}

// List takes a command rather than a bare resource type because the resource type
// is the query: a metadata field belongs to one kind of resource, and asking for
// "the fields" without saying which kind has no answer.
func (m MetadataFields) List(
	ctx context.Context, cl caller.OrganizationCaller,
	cmd *getmetadatafields.Command, limit int32, cursor *string,
) (pagination.Page[*metadatafieldschema.MetadataField], error) {
	if err := cl.Require(getmetadatafields.RequiredScope); err != nil {
		return pagination.Page[*metadatafieldschema.MetadataField]{}, err
	}

	return m.uc.GetMetadataFields.Execute(bindOrganization(ctx, cl), cmd, limit, cursor)
}

// Update carries the field's id inside cmd rather than beside it, because the
// operation's own input type does: see updatemetadatafield.UpdateMetadataFieldInput,
// whose ID field is filled by whoever calls and never sent in a request body.
func (m MetadataFields) Update(
	ctx context.Context, cl caller.OrganizationCaller,
	cmd *updatemetadatafield.UpdateMetadataFieldInput,
) (*metadatafieldschema.MetadataField, error) {
	if err := cl.Require(updatemetadatafield.RequiredScope); err != nil {
		return nil, err
	}

	return m.uc.UpdateMetadataField.Execute(bindOrganization(ctx, cl), cmd)
}

func (m MetadataFields) Archive(
	ctx context.Context, cl caller.OrganizationCaller, cmd *archivemetadatafield.Command,
) (*metadatafieldschema.MetadataField, error) {
	if err := cl.Require(archivemetadatafield.RequiredScope); err != nil {
		return nil, err
	}

	return m.uc.ArchiveMetadataField.Execute(bindOrganization(ctx, cl), cmd)
}

func (m MetadataFields) Unarchive(
	ctx context.Context, cl caller.OrganizationCaller, cmd *unarchivemetadatafield.Command,
) (*metadatafieldschema.MetadataField, error) {
	if err := cl.Require(unarchivemetadatafield.RequiredScope); err != nil {
		return nil, err
	}

	return m.uc.UnarchiveMetadataField.Execute(bindOrganization(ctx, cl), cmd)
}

// Reorder rewrites the display order of one resource type's fields wholesale: the
// i-th id in cmd is assigned position i, in one transaction.
func (m MetadataFields) Reorder(
	ctx context.Context, cl caller.OrganizationCaller,
	cmd *reordermetadatafields.ReorderMetadataFieldsInput,
) error {
	if err := cl.Require(reordermetadatafields.RequiredScope); err != nil {
		return err
	}

	return m.uc.ReorderMetadataFields.Execute(bindOrganization(ctx, cl), cmd)
}

// DryRun reports what a candidate schema would break, and writes nothing. See the
// type doc for why it is guarded like a write.
func (m MetadataFields) DryRun(
	ctx context.Context, cl caller.OrganizationCaller, cmd *dryrunmetadatafield.Command,
) (*dryrunmetadatafield.Impact, error) {
	if err := cl.Require(dryrunmetadatafield.RequiredScope); err != nil {
		return nil, err
	}

	return m.uc.DryRunMetadataField.Execute(bindOrganization(ctx, cl), cmd)
}
