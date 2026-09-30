import type { ComponentFormValues } from '@/domains/release-management';
import type { ReleaseManagementOverviewComponent } from '../../types';

export type ReleaseComponentDialogState =
  | {
      mode: 'create';
      initialValues?: Partial<ComponentFormValues>;
      replaceAddedPatchIndex?: number;
    }
  | {
      mode: 'edit';
      componentSlug: string;
      initialValues: Partial<ComponentFormValues>;
      target:
        | { kind: 'catalog'; oldComponentId: string }
        | { kind: 'added'; patchIndex: number }
        | { kind: 'inherited'; component: ReleaseManagementOverviewComponent };
    };
