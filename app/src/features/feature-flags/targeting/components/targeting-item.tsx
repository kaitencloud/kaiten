import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown, ChevronUp, Edit, Trash2 } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Targeting } from '../types';
import {
  TargetingItemContent,
  TargetingItemHeader,
} from './targeting-item-content';

type TargetingItemProps = {
  targeting: Targeting;
  index: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

export const TargetingItem = memo(function TargetingItem({
  targeting,
  index,
  canMoveUp,
  canMoveDown,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}: TargetingItemProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center gap-2">
              <TargetingItemHeader targeting={targeting} />
              <span className="text-xs text-muted-foreground">
                #{index + 1}
              </span>
            </div>
            <CardTitle className="text-base font-semibold truncate">
              {targeting.name}
            </CardTitle>
          </div>
          <div className="flex items-center gap-0.5 shrink-0 -mr-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onMoveUp}
              aria-label={t('Common.moveUp')}
              disabled={!canMoveUp}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onMoveDown}
              aria-label={t('Common.moveDown')}
              disabled={!canMoveDown}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            <div className="w-px h-4 bg-border mx-1" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onEdit}
              aria-label={t('Common.edit')}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onDelete}
              aria-label={t('Common.delete')}
              className="h-8 w-8 text-muted-foreground hover:text-destructive-subtle-foreground"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <TargetingItemContent targeting={targeting} />
      </CardContent>
    </Card>
  );
});
