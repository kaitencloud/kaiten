import { Button } from '@/components/ui/button';
import { RotateCcw, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { changeLanguage } from '@/lib/i18n/config';

const APP_LANGUAGES = ['en', 'fr'];
import { useAppSettings } from '@/hooks/use-app-settings';

export function ApplicationSettingsSection() {
  const { t } = useTranslation();
  const {
    settings: { language, sideNavExpanded },
    resetAppSettings,
    setLanguage,
  } = useAppSettings();

  // Both halves are needed: the setting is what survives a reload, the
  // i18next call is what re-renders the page right now.
  const handleLanguageChange = (nextLanguage: string) => {
    setLanguage(nextLanguage);
    changeLanguage(nextLanguage);
  };

  function renderLanguageOption(code: string) {
    return (
      <SelectItem key={code} value={code}>
        {t(`Pages.Settings.App.languages.${code}`)}
      </SelectItem>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Settings2 className="size-4 text-primary-subtle-foreground" />
          <span>{t('Pages.Settings.App.localStateTitle')}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('Pages.Settings.App.localStateDescription')}
        </p>
        <p className="text-sm text-muted-foreground">
          {t('Pages.Settings.App.sideNavState', {
            state: sideNavExpanded
              ? t('Pages.Settings.App.sideNavExpanded')
              : t('Pages.Settings.App.sideNavCollapsed'),
          })}
        </p>
        <div className="flex items-center gap-3 pt-2">
          <Label htmlFor="app-language">
            {t('Pages.Settings.App.language')}
          </Label>
          <Select value={language} onValueChange={handleLanguageChange}>
            <SelectTrigger id="app-language" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APP_LANGUAGES.map(renderLanguageOption)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="gap-2 self-start sm:self-auto">
            <RotateCcw className="size-4" />
            {t('Pages.Settings.App.resetButton')}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive-subtle text-destructive-subtle-foreground">
              <RotateCcw className="size-5" />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {t('Pages.Settings.App.ResetDialog.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('Pages.Settings.App.ResetDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline">
              {t('Common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={resetAppSettings}>
              {t('Pages.Settings.App.ResetDialog.confirmButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
