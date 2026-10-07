import { Link } from '@tanstack/react-router';
import { Pencil } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { License } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useBillingCapabilities, useCanPerform } from '@/domains/billing';
import {
  getPricingType,
  getTrialPeriodDays,
  PRICING_TYPE_LABEL_KEYS,
} from '../../utils/license-commercial.utils';

type LicenseCommercialCardProps = {
  license: License;
};

// A field is a group named by its label, so that its value is read with it.
function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  const labelId = useId();

  return (
    <div aria-labelledby={labelId} className="space-y-2" role="group">
      <span className="text-sm font-medium text-muted-foreground" id={labelId}>
        {label}
      </span>
      <div className="text-sm">{children}</div>
    </div>
  );
}

/**
 * How a version is sold, on its Overview tab: the pricing type, the trial, the
 * payment method and the call-to-action URL, with the way to change them. It is
 * billing's: where billing is not there it is not rendered, and the way to edit
 * is there only for a session that may write licenses.
 */
export function LicenseCommercialCard({ license }: LicenseCommercialCardProps) {
  const { t } = useTranslation();
  const { isEnabled } = useBillingCapabilities();
  const mayEdit = useCanPerform('license.updateCommercialFields');

  if (!isEnabled) {
    return null;
  }
  const trial = getTrialPeriodDays(license);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{t('Pages.Licenses.Commercial.cardTitle')}</CardTitle>
            <CardDescription>
              {t('Pages.Licenses.Commercial.cardDescription')}
            </CardDescription>
          </div>
          {mayEdit && license.slug ? (
            <Button
              data-commercial-edit
              nativeButton={false}
              render={
                <Link
                  params={{ licenseSlug: license.slug }}
                  search={{ mode: 'configure' }}
                  to="/licenses/$licenseSlug"
                >
                  <Pencil className="size-3" />
                  {t('Common.edit')}
                </Link>
              }
              role="link"
              size="sm"
              variant="outline"
            />
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t('Pages.Licenses.Commercial.Fields.pricingType')}>
            <Badge variant="outline">
              {t(PRICING_TYPE_LABEL_KEYS[getPricingType(license)])}
            </Badge>
          </Field>
          <Field label={t('Pages.Licenses.Commercial.Fields.trial')}>
            {trial === undefined
              ? t('Pages.Licenses.Commercial.Values.noTrial')
              : t('Pages.Licenses.Commercial.Values.trialDays', {
                  count: trial,
                })}
          </Field>
          <Field label={t('Pages.Licenses.Commercial.Fields.paymentMethod')}>
            {license.requiresPaymentMethod
              ? t('Pages.Licenses.Commercial.Values.paymentRequired')
              : t('Pages.Licenses.Commercial.Values.paymentNotRequired')}
          </Field>
          <Field label={t('Pages.Licenses.Commercial.Fields.ctaUrl')}>
            {license.selfServeCtaUrl ? (
              <a
                className="break-all text-primary underline-offset-4 hover:underline"
                href={license.selfServeCtaUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                {license.selfServeCtaUrl}
              </a>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </Field>
        </div>
      </CardContent>
    </Card>
  );
}
