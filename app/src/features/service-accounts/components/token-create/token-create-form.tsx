import { Button } from '@/components/ui/button';
import { Info } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Page } from '@/functionals/page';
import { createFormSubmitHandler } from '@/hooks/form';
import { dataModelIcons } from '@/lib/data-model-icons';
import { TokenAccessCard } from './token-access-card';
import { TokenDetailsCard } from './token-details-card';
import type { TokenCreateData } from '../../types';
import { useTokenCreateForm } from './use-token-create-form';

const I18N = 'Pages.Integrations.ServiceAccounts.NewToken';

type TokenCreateFormProps = {
  serviceAccountName: string;
  onCancel: () => void;
  onSubmit: (data: TokenCreateData) => Promise<unknown>;
};

/**
 * New token as a full page, like New Entitlement: one step, since the details
 * are two fields, with the actions pinned under the form.
 */
export function TokenCreateForm({
  serviceAccountName,
  onCancel,
  onSubmit,
}: TokenCreateFormProps) {
  const { t } = useTranslation();
  const formId = useId();
  const onceWarningId = useId();
  const form = useTokenCreateForm(onSubmit);
  const TokenIcon = dataModelIcons.token;

  return (
    <form
      id={formId}
      noValidate
      onSubmit={createFormSubmitHandler(form.handleSubmit)}
      className="flex h-full min-h-0 flex-col overflow-hidden"
    >
      <form.AppForm>
        <Page className="h-full min-h-0 flex-1 overflow-hidden">
          <Page.Header className="sticky top-0 z-20 bg-app-background pb-4">
            <Page.Leading>
              <Page.Icon>
                <TokenIcon className="size-8 text-primary-subtle-foreground" />
              </Page.Icon>
              <Page.Heading>
                <Page.Title>{t(`${I18N}.title`)}</Page.Title>
                <Page.Subtitle>
                  {t(`${I18N}.description`, { name: serviceAccountName })}
                </Page.Subtitle>
              </Page.Heading>
            </Page.Leading>
          </Page.Header>

          {/* On a tall viewport the page fits it and what scrolls is the scope
              list, inside the Access card: the details, the presets, the
              summary and the actions stay in view. Shorter ones keep the list
              in a dialog instead (see TokenAccessCard), and the page scrolls
              only if it has to. */}
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto tall:flex tall:flex-col tall:gap-6 tall:space-y-0">
            <TokenDetailsCard form={form} />
            <TokenAccessCard form={form} className="tall:flex-1" />

            {/* Sticky from md only: on a phone the note and the actions wrap
                onto three lines, too tall to keep over the form. */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-app-background py-4 md:sticky md:bottom-0">
              <Button type="button" variant="outline" onClick={onCancel}>
                {t('Common.cancel')}
              </Button>
              {/* Said where it matters: next to the button that creates the
                  token, and read out with it. */}
              <div className="flex flex-wrap items-center justify-end gap-3">
                <p
                  id={onceWarningId}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <Info className="size-3.5 shrink-0" aria-hidden />
                  {t(`${I18N}.onceWarning`)}
                </p>
                <form.SubmitButton
                  label={t(`${I18N}.submit`)}
                  aria-describedby={onceWarningId}
                />
              </div>
            </div>
          </div>
        </Page>
      </form.AppForm>
    </form>
  );
}
