package seedkit

import (
	"context"
	"fmt"

	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/seeder"
)

// LicenseCreationState is the state to create a license version in when it is
// meant to end up in state. Only DRAFT and PUBLISHED are creation states:
// create-license refuses ARCHIVED (CreateLicense.LifecycleStateNotSettable),
// because a version is archived by withdrawing it from sale. A version meant to
// end archived is therefore created PUBLISHED and passed to ArchiveLicenses
// afterwards, which is also how a vendor's catalogue gets there.
func LicenseCreationState(state licenseschema.LifecycleState) licenseschema.LifecycleState {
	if state == licenseschema.Archived {
		return licenseschema.Published
	}
	return state
}

// ArchiveLicenses withdraws each version from sale through archive-license, so
// the seed records a LICENSE_ARCHIVED for it like any archive. Call it once the
// family's later versions exist: that way the family is never left without a
// version on sale in between. A family's default cannot be archived.
func ArchiveLicenses(ctx context.Context, sc *seeder.SeederContext, slugs []string) error {
	for _, slug := range slugs {
		if _, err := sc.Licenses.ArchiveLicense.Execute(ctx, slug); err != nil {
			return fmt.Errorf("archive license %q: %w", slug, err)
		}
	}
	return nil
}
