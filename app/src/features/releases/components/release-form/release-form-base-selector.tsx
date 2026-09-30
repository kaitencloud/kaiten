import type { TFunction } from 'i18next';
import { Copy, Rocket } from 'lucide-react';
import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ReleaseFormValues } from '../../schemas/release.schema';
import type {
  ReleaseCreationMode,
  ReleaseManagementOverviewRelease,
} from '../../types';
import { ReleaseCreationModeCard } from './release-creation-mode-card';

function compareReleaseVersions(
  left: ReleaseManagementOverviewRelease,
  right: ReleaseManagementOverviewRelease,
) {
  return right.version.localeCompare(left.version, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

type ReleaseFormBaseSelectorProps = {
  onCreationModeChange: (mode: ReleaseCreationMode) => void;
  onPreviousReleaseChange: (releaseId: string) => void;
  releases: ReleaseManagementOverviewRelease[];
  t: TFunction;
  values: ReleaseFormValues;
};

export function ReleaseFormBaseSelector({
  onCreationModeChange,
  onPreviousReleaseChange,
  releases,
  t,
  values,
}: ReleaseFormBaseSelectorProps) {
  const releaseOptions = useMemo(
    () =>
      releases
        .slice()
        .sort(compareReleaseVersions)
        .map((release) => ({
          label: release.version,
          value: release.id,
        })),
    [releases],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-8">
      <div className="space-y-4 text-center">
        <h2 className="font-semibold text-2xl">
          {t('Pages.Releases.Deployments.Form.steps.base.title')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('Pages.Releases.Deployments.Form.steps.base.description')}
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <ReleaseCreationModeCard
          description={t(
            'Pages.Releases.Deployments.Form.modes.scratch.description',
          )}
          Icon={Rocket}
          isSelected={values.creationMode === 'scratch'}
          onClick={() => onCreationModeChange('scratch')}
          title={t('Pages.Releases.Deployments.Form.modes.scratch.title')}
        />
        <ReleaseCreationModeCard
          description={t(
            'Pages.Releases.Deployments.Form.modes.existing.description',
          )}
          Icon={Copy}
          isSelected={values.creationMode === 'existing'}
          onClick={() => onCreationModeChange('existing')}
          title={t('Pages.Releases.Deployments.Form.modes.existing.title')}
        />
      </div>

      {values.creationMode === 'existing' ? (
        <div className="space-y-3">
          <p className="font-medium text-sm">
            {t('Pages.Releases.Deployments.Form.previousRelease')}
          </p>
          <Select
            value={values.previousReleaseId}
            onValueChange={onPreviousReleaseChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={t(
                  'Pages.Releases.Deployments.Form.selectPreviousRelease',
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {releaseOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}
