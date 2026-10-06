import { Link } from '@tanstack/react-router';
import { CloudOff, Home, type LucideIcon, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { dataModelIcons } from '@/lib/data-model-icons';
import type { BillingUnavailableReason } from '../types';
import { MissingScopeBanner } from './missing-scope-banner';

const REASON_ICONS = {
  DEPLOYMENT_DISABLED: dataModelIcons.invoice,
  NOT_ENTITLED: dataModelIcons.invoice,
  FEATURE_UNAVAILABLE: dataModelIcons.invoice,
  MISSING_SCOPE: ShieldAlert,
  UNREACHABLE: CloudOff,
} as const satisfies Record<BillingUnavailableReason, LucideIcon>;

type BillingUnavailableProps = {
  /** Offered for `UNREACHABLE`, where asking again may work. */
  onRetry?: () => void;
  reason: BillingUnavailableReason;
  /** The scope a `MISSING_SCOPE` refusal named. */
  scope?: string;
};

/**
 * What a link to a billing screen shows when billing is not there: an
 * explanation, never an error. A self-hosted deployment is told which variable
 * turns billing on, an organization whose plan lacks it is told to upgrade, and
 * a session that cannot read the capabilities is told which scope it lacks.
 */
export function BillingUnavailable({
  onRetry,
  reason,
  scope,
}: BillingUnavailableProps) {
  const { t } = useTranslation();
  const Icon = REASON_ICONS[reason];

  return (
    <div
      className="flex min-h-[400px] items-center justify-center p-4"
      data-reason={reason}
      data-testid="billing-unavailable"
    >
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Icon className="size-5 text-muted-foreground" />
            <CardTitle>
              {t(`Features.Billing.Unavailable.${reason}.title`)}
            </CardTitle>
          </div>
          <CardDescription>
            {t(`Features.Billing.Unavailable.${reason}.description`)}
          </CardDescription>
        </CardHeader>
        {reason === 'MISSING_SCOPE' ? (
          <CardContent>
            <MissingScopeBanner scope={scope} />
          </CardContent>
        ) : null}
        <CardFooter className="gap-2">
          {reason === 'UNREACHABLE' && onRetry ? (
            <Button onClick={onRetry} type="button" variant="outline">
              {t('Common.retry')}
            </Button>
          ) : null}
          <Button
            nativeButton={false}
            render={
              <Link to="/">
                <Home className="size-4" />
                {t('Errors.goHome')}
              </Link>
            }
            role="link"
            variant="outline"
          />
        </CardFooter>
      </Card>
    </div>
  );
}
