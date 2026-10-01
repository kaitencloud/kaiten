import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FlaskConical, LoaderCircle, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useDemoStatus } from '../hooks/use-demo-status';
import { useResetDemoData } from '../hooks/use-reset-demo';
import { useSeedDemoData } from '../hooks/use-seed-demo';

// Settings-page section for demo/sandbox organizations. Seeding a
// never-seeded sandbox is a safe first action (there's nothing to lose yet),
// so it fires immediately; resetting an already-seeded sandbox permanently
// deletes it (customer, license, entitlements, instance, and everything
// kaiten cascades from the instance — usage history included), so it goes
// behind a confirm dialog. Seed and reset are two distinct endpoints
// (POST /demo/seed, POST /demo/reset) — not the same call twice.
export function DemoSettingsCard() {
  const { t } = useTranslation();
  const { data } = useDemoStatus();
  const seedDemoData = useSeedDemoData();
  const resetDemoData = useResetDemoData();

  if (!data?.is_demo) {
    return null;
  }

  const isSeeding =
    data.seeding || seedDemoData.isPending || resetDemoData.isPending;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <FlaskConical className="size-5 text-primary-subtle-foreground" />
            <div className="space-y-1">
              <CardTitle>{t('Pages.Settings.Demo.title')}</CardTitle>
              <CardDescription>
                {t('Pages.Settings.Demo.description')}
              </CardDescription>
              {isSeeding && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <LoaderCircle className="size-3.5 animate-spin" />
                  {t('Pages.Settings.Demo.seedingProgress')}
                </p>
              )}
            </div>
          </div>

          {data.seeded ? (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    variant="outline"
                    className="gap-2 self-start"
                    disabled={isSeeding}
                  >
                    {isSeeding ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <RotateCcw className="size-4" />
                    )}
                    {t('Pages.Settings.Demo.resetButton')}
                  </Button>
                }
              />
              <AlertDialogContent size="sm">
                <AlertDialogHeader>
                  <AlertDialogMedia className="bg-destructive/10 text-destructive-subtle-foreground dark:bg-destructive/20 dark:text-destructive-subtle-foreground">
                    <RotateCcw className="size-5" />
                  </AlertDialogMedia>
                  <AlertDialogTitle>
                    {t('Pages.Settings.Demo.ResetDialog.title')}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('Pages.Settings.Demo.ResetDialog.description')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel variant="outline">
                    {t('Common.cancel')}
                  </AlertDialogCancel>
                  <AlertDialogClose
                    render={
                      <AlertDialogAction
                        variant="destructive"
                        onClick={() => resetDemoData.mutate()}
                      >
                        {t('Pages.Settings.Demo.ResetDialog.confirmButton')}
                      </AlertDialogAction>
                    }
                  />
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button
              className="gap-2 self-start"
              disabled={isSeeding}
              onClick={() => seedDemoData.mutate()}
            >
              {isSeeding && <LoaderCircle className="size-4 animate-spin" />}
              {t('Pages.Settings.Demo.seedButton')}
            </Button>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}
