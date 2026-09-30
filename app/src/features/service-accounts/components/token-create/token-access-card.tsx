import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import FormField from '@/components/form/fields/form-field';
import { cn } from '@/lib/utils';
import type { AccessLevel, AccessLevels, ResourceType } from '../../types';
import {
  accessLevelsToScopes,
  setAccessLevel,
} from '../../utils/access-levels';
import { getScopeBadgeVariant } from '../../utils/constants';
import { ScopeAccessDialog } from './scope-access-dialog';
import { ScopeAccessTable } from './scope-access-table';
import { TokenPresets } from './token-presets';
import type { TokenCreateFormApi } from './use-token-create-form';

const I18N = 'Pages.Integrations.ServiceAccounts.NewToken.Access';

// Exactly what the API will receive, so nobody has to translate the table back
// into scopes in their head.
function ScopeSummary({
  className,
  levels,
}: {
  className?: string;
  levels: AccessLevels;
}) {
  const { t } = useTranslation();
  const scopes = accessLevelsToScopes(levels);

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/40 px-3 py-2',
        className,
      )}
    >
      <span className="mr-1 text-xs font-medium" aria-live="polite">
        {scopes.length > 0
          ? t(`${I18N}.summary`, { count: scopes.length })
          : t(`${I18N}.empty`)}
      </span>
      {scopes.map((scope) => (
        <Badge
          key={scope}
          variant={getScopeBadgeVariant(scope)}
          className="font-mono text-xs"
        >
          {scope}
        </Badge>
      ))}
    </div>
  );
}

export function TokenAccessCard({
  form,
  className,
}: {
  form: TokenCreateFormApi;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t(`${I18N}.title`)}</CardTitle>
        <CardDescription>{t(`${I18N}.description`)}</CardDescription>
        <CardAction>
          {/* The same field as the table below, mounted again for its one
              reset: clearing everything is about the whole card. */}
          <form.AppField name="access">
            {(field) => (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={Object.keys(field.state.value ?? {}).length === 0}
                onClick={() => {
                  field.handleChange({});
                  field.handleBlur();
                }}
              >
                {t(`${I18N}.clear`)}
              </Button>
            )}
          </form.AppField>
        </CardAction>
      </CardHeader>
      <CardContent className="tall:flex tall:min-h-0 tall:flex-1 tall:flex-col">
        <form.AppField name="access">
          {() => (
            // FormField shows the field's error once it is touched, under the
            // whole table: the table is one field.
            <FormField<AccessLevels> className="gap-4 tall:flex tall:min-h-0 tall:flex-1 tall:flex-col">
              {(field) => {
                const levels = field.value ?? {};
                const change = (next: AccessLevels) => {
                  field.handleChange(next);
                  field.handleBlur();
                };
                const changeLevel = (
                  resource: ResourceType,
                  level: AccessLevel,
                ) => change(setAccessLevel(levels, resource, level));

                return (
                  <>
                    <TokenPresets levels={levels} onChange={change} />
                    {/* Inline where the viewport is tall enough to give it
                        room, as the card's one scroller. contain:size keeps
                        its rows out of the card's minimum height, so the card
                        can shrink down to 12rem of list, and no further. */}
                    <ScopeAccessTable
                      className="hidden tall:block tall:min-h-48 tall:flex-1 tall:overflow-y-auto tall:[contain:size]"
                      levels={levels}
                      onLevelChange={changeLevel}
                    />
                    {/* The button goes under the summary, full width, at every
                        size: beside it, it squeezed the scopes as soon as they
                        wrapped. */}
                    <div className="flex flex-col gap-2">
                      <ScopeSummary levels={levels} />
                      {/* Elsewhere, the same table in a dialog. */}
                      <ScopeAccessDialog
                        className="w-full tall:hidden"
                        levels={levels}
                        onLevelChange={changeLevel}
                      />
                    </div>
                  </>
                );
              }}
            </FormField>
          )}
        </form.AppField>
      </CardContent>
    </Card>
  );
}
