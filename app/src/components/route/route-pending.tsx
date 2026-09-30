import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface RoutePendingProps {
  message?: string;
}

export function RoutePending({ message }: RoutePendingProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        {message ?? t('Common.loading')}
      </p>
    </div>
  );
}
