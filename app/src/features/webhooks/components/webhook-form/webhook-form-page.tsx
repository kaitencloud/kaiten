import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Page } from '@/functionals/page';
import { createFormSubmitHandler } from '@/hooks/form';
import { dataModelIcons } from '@/lib/data-model-icons';
import { useWebhookForm } from '../../hooks/use-webhook-form';
import type { ApiWebhook } from '../../types';
import { WebhookEventsField } from './webhook-events-field';
import { WebhookFormAside } from './webhook-form-aside';

const WebhookIcon = dataModelIcons.webhook;

type WebhookFormPageProps = {
  /** The webhook to edit; absent, the page creates one. */
  webhook?: ApiWebhook;
};

/**
 * The create and edit page of a webhook. The header stays in place and the
 * body scrolls (`Page layout="scroll"`). The column of Destination, Selection
 * and the actions comes first in the DOM, so the URL is reached without
 * tabbing through the catalogue; from `lg` it sits on the right.
 */
export function WebhookFormPage({ webhook }: WebhookFormPageProps) {
  const { t } = useTranslation();
  const formId = useId();
  const { form, handleCancel, hasNoEventFilter, isEditMode, retainedTypes } =
    useWebhookForm({ webhook });

  return (
    <form
      id={formId}
      noValidate
      onSubmit={createFormSubmitHandler(form.handleSubmit)}
      className="flex h-full min-h-0 flex-col overflow-hidden"
    >
      <form.AppForm>
        <Page layout="scroll">
          <Page.Fixed>
            <Page.Header className="pb-4">
              <Page.Leading>
                <Page.Icon>
                  <WebhookIcon className="size-8 text-primary-subtle-foreground" />
                </Page.Icon>
                <Page.Heading>
                  <Page.Title>
                    {isEditMode
                      ? t('Pages.Integrations.Webhooks.Form.titleEdit')
                      : t('Pages.Integrations.Webhooks.Form.titleNew')}
                  </Page.Title>
                  <Page.Subtitle>
                    {isEditMode
                      ? t('Pages.Integrations.Webhooks.Form.descriptionEdit')
                      : t('Pages.Integrations.Webhooks.Form.descriptionNew')}
                  </Page.Subtitle>
                </Page.Heading>
              </Page.Leading>
            </Page.Header>
          </Page.Fixed>
          <Page.Scroll>
            {/* `grid-cols-1`, here and on the events field's own grid: an
                implicit column is as wide as its widest row, which a long URL
                or event NAME would push past a phone's screen. */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
              <WebhookFormAside
                form={form}
                isEditMode={isEditMode}
                onCancel={handleCancel}
              />
              <WebhookEventsField
                form={form}
                retainedTypes={retainedTypes}
                hasNoEventFilter={hasNoEventFilter}
                className="order-2 grid-cols-1 lg:col-start-1 lg:row-start-1"
              />
            </div>
          </Page.Scroll>
        </Page>
      </form.AppForm>
    </form>
  );
}
