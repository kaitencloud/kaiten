import { TriangleAlert } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { LicenseFamilyView } from '@/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { DetailCard } from '@/functionals/detail-card';

type AddonCompatibilityCardProps = {
  /** Whether a family has a request on the way: its box is off until it settles. */
  isBusy: (familySlug: string) => boolean;
  /** The slugs of the license families the version fits. */
  compatible: readonly string[];
  /** Declares a version compatible with a family, or takes the declaration back. */
  onChange: (familySlug: string, compatible: boolean) => void;
  /** Whether the session may change which families the version fits. */
  readOnly: boolean;
  families: readonly LicenseFamilyView[];
};

// A family reads by the name of the version it resolves to; a family with nothing on
// sale has none, and reads by its slug.
const familyName = (family: LicenseFamilyView) =>
  family.currentVersion?.name ?? family.slug;

function FamilyBox({
  checked,
  disabled,
  family,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  family: LicenseFamilyView;
  onChange: (compatible: boolean) => void;
}) {
  const id = useId();

  return (
    <li className="flex items-center gap-2">
      <Checkbox
        checked={checked}
        disabled={disabled}
        id={id}
        onCheckedChange={(next) => onChange(next === true)}
      />
      <Label className="gap-2" htmlFor={id}>
        {familyName(family)}
        <span className="font-mono text-xs font-normal text-muted-foreground">
          {family.slug}
        </span>
      </Label>
    </li>
  );
}

/**
 * The license families a version fits, one box each. Compatibility is declared
 * against a family and not a version, so a new license version never orphans an
 * add-on. A version that fits none is attachable to nothing, and the API does not
 * refuse to publish it, so the card says so as a warning. Each box shows what the API
 * holds, and is off while its family has a request on the way.
 */
export function AddonCompatibilityCard({
  compatible,
  families,
  isBusy,
  onChange,
  readOnly,
}: AddonCompatibilityCardProps) {
  const { t } = useTranslation();
  const fits = new Set(compatible);

  return (
    <DetailCard>
      <DetailCard.Header>
        <DetailCard.Title>
          {t('Pages.Addons.Compatibility.title')}
        </DetailCard.Title>
        <DetailCard.Description>
          {t('Pages.Addons.Compatibility.description')}
        </DetailCard.Description>
      </DetailCard.Header>
      <DetailCard.Content>
        {compatible.length === 0 ? (
          <Alert data-testid="compatibility-empty" role="status">
            <TriangleAlert className="text-warning-subtle-foreground" />
            <AlertTitle>
              {t('Pages.Addons.Compatibility.Empty.title')}
            </AlertTitle>
            <AlertDescription>
              {t('Pages.Addons.Compatibility.Empty.description')}
            </AlertDescription>
          </Alert>
        ) : null}
        {families.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('Pages.Addons.Compatibility.noFamilies')}
          </p>
        ) : (
          <ul
            aria-label={t('Pages.Addons.Compatibility.listLabel')}
            className="grid gap-3"
          >
            {families.map((family) => (
              <FamilyBox
                checked={fits.has(family.slug)}
                disabled={readOnly || isBusy(family.slug)}
                family={family}
                key={family.id}
                onChange={(next) => onChange(family.slug, next)}
              />
            ))}
          </ul>
        )}
      </DetailCard.Content>
    </DetailCard>
  );
}
