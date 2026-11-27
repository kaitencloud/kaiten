import { TriangleAlert } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { WebhookFormApi } from '../../hooks/use-webhook-form';

type WebhookKeepEveryEventFieldProps = {
  form: WebhookFormApi;
  className?: string;
};

/**
 * The `keepEveryEvent` field, offered on the edit page of a webhook without an
 * event filter only, and ticked when it opens: an edit of its URL alone then
 * leaves it receiving every event. The description is linked to the checkbox,
 * so a screen reader hears what keeping it means. Unticked, a warning says
 * that saving narrows the webhook for good: no route makes a filtered webhook
 * filterless again. Its status region stays mounted, empty while the box is
 * ticked, because a live region is only announced reliably when its content
 * changes after it exists; one mounted with its text would go unheard.
 */
export function WebhookKeepEveryEventField({
  form,
  className,
}: WebhookKeepEveryEventFieldProps) {
  const { t } = useTranslation();
  const checkboxId = useId();
  const descriptionId = useId();

  return (
    <form.AppField name="keepEveryEvent">
      {(field) => (
        <Card className={cn('px-4 py-4', className)}>
          <div className="flex items-start gap-3">
            <Checkbox
              id={checkboxId}
              checked={field.state.value}
              onCheckedChange={(checked) =>
                field.handleChange(checked === true)
              }
              onBlur={field.handleBlur}
              aria-describedby={descriptionId}
              className="mt-0.5"
            />
            <div className="grid gap-1.5">
              <Label htmlFor={checkboxId}>
                {t('Pages.Integrations.Webhooks.Form.events.keepEveryEvent')}
              </Label>
              <div>
                <p id={descriptionId} className="text-sm text-muted-foreground">
                  {t(
                    'Pages.Integrations.Webhooks.Form.events.keepEveryEventDescription',
                  )}
                </p>
                <div role="status">
                  {field.state.value ? null : (
                    // A note, not the default alert: the region around it
                    // already announces it, politely and once.
                    <Alert className="mt-3" role="note">
                      <TriangleAlert aria-hidden />
                      <AlertDescription>
                        {t(
                          'Pages.Integrations.Webhooks.Form.events.narrowingNotice',
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}
    </form.AppField>
  );
}
