import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { Voucher } from '@/api-client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAlertFocus } from '@/domains/billing';
import { Page } from '@/functionals/page';
import { dataModelIcons } from '@/lib/data-model-icons';
import type { VoucherNames } from '../../types';
import { describeVoucherReview } from '../../utils/voucher-review';
import { VoucherCodeBox } from '../shared/voucher-code-box';

type PublishedViewProps = {
  names: VoucherNames;
  /** Starts the wizard again, empty. */
  onAnother: () => void;
  voucher: Voucher;
};

/**
 * What the wizard ends on: the code, to copy and hand to the customer, and the voucher
 * in plain language, to paste next to it. A discount offers to make a boost for the
 * same offer, the usual companion of a commercial agreement: the same duration, the
 * same eligibility and the same limits, to which only the entitlements are left to add.
 * It takes the focus the button that published had: that button is gone with the wizard,
 * and the keyboard would land on nothing.
 */
export function PublishedView({
  names,
  onAnother,
  voucher,
}: PublishedViewProps) {
  const { i18n, t } = useTranslation();
  const VoucherIcon = dataModelIcons.voucher;
  const contentRef = useAlertFocus(true, voucher);
  const sentences = describeVoucherReview(voucher, {
    language: i18n.language,
    names,
    t,
  });

  return (
    <Page className="h-full min-h-0 overflow-hidden">
      <Page.Header className="pb-4">
        <Page.Leading>
          <Page.Icon>
            <VoucherIcon className="size-8 text-primary-subtle-foreground" />
          </Page.Icon>
          <Page.Heading>
            <Page.Title>{t('Pages.Vouchers.Published.title')}</Page.Title>
            <Page.Subtitle>
              {t('Pages.Vouchers.Published.subtitle', { name: voucher.name })}
            </Page.Subtitle>
          </Page.Heading>
        </Page.Leading>
      </Page.Header>
      <div
        aria-label={t('Pages.Vouchers.Published.title')}
        className="min-h-0 flex-1 space-y-6 overflow-y-auto outline-none"
        data-testid="voucher-published"
        ref={contentRef}
        role="region"
        tabIndex={-1}
      >
        <Card className="border-success-subtle-foreground/30 bg-success-subtle">
          <CardHeader>
            <CardTitle className="text-success-subtle-foreground">
              {t('Pages.Vouchers.Published.codeTitle')}
            </CardTitle>
            <CardDescription>
              {t('Pages.Vouchers.Published.codeDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {voucher.code ? (
              <VoucherCodeBox code={voucher.code} />
            ) : (
              <p className="text-sm">
                {t('Pages.Vouchers.Published.codeHidden', {
                  hint: voucher.codeHint,
                })}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('Pages.Vouchers.Published.summaryTitle')}</CardTitle>
            <CardDescription>
              {t('Pages.Vouchers.Published.summaryDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              {sentences.map((sentence) => (
                <li key={sentence}>{sentence}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
        {voucher.voucherType === 'PRICE' ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('Pages.Vouchers.Published.boostTitle')}</CardTitle>
              <CardDescription>
                {t('Pages.Vouchers.Published.boostDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                nativeButton={false}
                render={
                  <Link search={{ boostFor: voucher.id }} to="/vouchers/new">
                    {t('Pages.Vouchers.Published.boostAction')}
                  </Link>
                }
                role="link"
                variant="outline"
              />
            </CardContent>
          </Card>
        ) : null}
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t bg-app-background py-4">
          <Button onClick={onAnother} type="button" variant="outline">
            {t('Pages.Vouchers.Published.another')}
          </Button>
          <Button
            nativeButton={false}
            render={
              <Link
                params={{ voucherId: voucher.id }}
                to="/vouchers/$voucherId"
              >
                {t('Pages.Vouchers.Published.view')}
              </Link>
            }
            role="link"
          />
        </div>
      </div>
    </Page>
  );
}
