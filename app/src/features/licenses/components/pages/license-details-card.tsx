import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Star, StarOff } from 'lucide-react';
import type { useTranslation } from 'react-i18next';
import type { License } from '@/api-client';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { capitalizeFromUpperCase } from '@/lib/utils';
import { useLicenseDefault } from '../../hooks/use-license-default';
import { canBecomeDefault } from '../../utils/license-lifecycle.utils';
import { LicenseDeleteDraftAction } from '../license-delete-draft-action';
import { LicenseLifecycleAction } from '../license-lifecycle-action';
import { LicenseLifecycleBadge } from '../license-lifecycle-badge';

function getLicenseTypeBadgeVariant(licenseType: License['type']) {
  if (licenseType === 'PAID') {
    return 'default';
  }

  if (licenseType === 'DEVELOPMENT') {
    return 'secondary';
  }

  return 'outline';
}

type Translate = ReturnType<typeof useTranslation>['t'];

// The header's right-hand control: the default badge with the way to unset
// it, the "set as default" button, or that button disabled with the reason --
// only a PUBLISHED version may become the default, and the API refuses the
// rest with UpdateLicense.DefaultMustBePublished.
function SetDefaultControl({ license, t }: { license: License; t: Translate }) {
  const { isPending, setDefault, unsetDefault } = useLicenseDefault(license);

  if (license.isDefault) {
    return (
      <>
        <Badge variant="default" className="gap-1">
          <Star className="size-3" />
          {t('Pages.Licenses.Detail.defaultBadge')}
        </Badge>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={unsetDefault}
          disabled={isPending}
        >
          <StarOff className="size-3" />
          {t('Pages.Licenses.DefaultActions.unset')}
        </Button>
      </>
    );
  }

  if (!canBecomeDefault(license)) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A disabled button emits no pointer events, so the wrapper is what
              the tooltip listens to; focusable so keyboard users get the
              reason too. */}
          <span tabIndex={0} className="inline-flex rounded-md">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              disabled
            >
              <Star className="size-3" />
              {t('Pages.Licenses.Detail.setDefaultButton')}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {t('Pages.Licenses.Detail.setDefaultUnavailable')}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1"
      onClick={setDefault}
      disabled={isPending}
    >
      <Star className="size-3" />
      {t('Pages.Licenses.Detail.setDefaultButton')}
    </Button>
  );
}

export function LicenseDetailsCard({
  license,
  onDraftDeleted,
  t,
}: {
  license: License;
  onDraftDeleted: () => void;
  t: Translate;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{t('Pages.Licenses.Detail.cardTitle')}</CardTitle>
            <CardDescription>
              {t('Pages.Licenses.Detail.cardDescription')}
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <LicenseDeleteDraftAction
              appearance="card"
              license={license}
              onDeleted={onDraftDeleted}
            />
            <LicenseLifecycleAction appearance="card" license={license} />
            <SetDefaultControl license={license} t={t} />
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">
              {t('Pages.Licenses.Detail.Fields.name')}
            </span>
            <p className="font-medium">{license.name}</p>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">
              {t('Pages.Licenses.Detail.Fields.type')}
            </span>
            <div>
              <Badge variant={getLicenseTypeBadgeVariant(license.type)}>
                {t(
                  `Pages.Licenses.Mutation.Form.Types.${capitalizeFromUpperCase(license.type)}`,
                )}
              </Badge>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">
              {t('Pages.Licenses.Detail.Fields.lifecycleState')}
            </span>
            <div>
              <LicenseLifecycleBadge license={license} />
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">
              {t('Pages.Licenses.Detail.Fields.version')}
            </span>
            <p className="font-medium">
              {license.version}
              {license.versionName ? ` (${license.versionName})` : ''}
            </p>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">
              {t('Pages.Licenses.Detail.Fields.description')}
            </span>
            <p className="text-sm text-muted-foreground">
              {license.description || '-'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
