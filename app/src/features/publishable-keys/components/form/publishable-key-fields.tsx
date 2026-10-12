import { useTranslation } from 'react-i18next';
import { withForm } from '@/hooks/form';
import { MAX_ORIGINS, parseOrigins } from '../../utils/origins';
import { publishableKeyFormOpts } from '../../schemas';

/** What the origins field refuses, entry by entry: the field says it in general, this names them. */
function RejectedOrigins({ rejected }: { rejected: readonly string[] }) {
  const { t } = useTranslation();

  if (rejected.length === 0) {
    return null;
  }

  return (
    <p
      className="text-sm text-destructive-subtle-foreground"
      data-testid="rejected-origins"
    >
      {t('Pages.Integrations.PublishableKeys.Form.rejected', {
        origins: rejected.join(', '),
      })}
    </p>
  );
}

/**
 * What a publishable key holds: what it is for, and the origins a page may send it from,
 * one to a line. The origins field names the entries it refuses, since a list pasted from
 * a page of settings is long and "an origin is wrong" says nothing about which.
 */
export const PublishableKeyFields = withForm({
  ...publishableKeyFormOpts,
  render: function PublishableKeyFieldsRender({ form }) {
    const { t } = useTranslation();

    return (
      <div className="space-y-5">
        <form.AppField name="label">
          {(field) => (
            <field.TextField
              description={t(
                'Pages.Integrations.PublishableKeys.Form.Descriptions.label',
              )}
              label={t('Pages.Integrations.PublishableKeys.Form.Labels.label')}
              placeholder={t(
                'Pages.Integrations.PublishableKeys.Form.Placeholders.label',
              )}
              required
            />
          )}
        </form.AppField>
        <div className="space-y-2">
          <form.AppField name="origins">
            {(field) => (
              <field.TextAreaField
                description={t(
                  'Pages.Integrations.PublishableKeys.Form.Descriptions.origins',
                  { max: MAX_ORIGINS },
                )}
                label={t(
                  'Pages.Integrations.PublishableKeys.Form.Labels.origins',
                )}
                placeholder={t(
                  'Pages.Integrations.PublishableKeys.Form.Placeholders.origins',
                )}
              />
            )}
          </form.AppField>
          <form.Subscribe
            selector={(state) =>
              state.fieldMeta.origins?.isTouched
                ? parseOrigins(state.values.origins).rejected
                : []
            }
          >
            {(rejected) => <RejectedOrigins rejected={rejected} />}
          </form.Subscribe>
        </div>
      </div>
    );
  },
});
