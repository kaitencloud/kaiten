import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatSyncedAt,
  SyncErrorDialog,
  SyncStatusBadge,
} from '@/domains/crm-sync';
import { attioSyncedRecordsQueryOptions } from '../queries';
import type { SyncedRecord } from '../types';

export function AttioSyncedRecords() {
  const { t } = useTranslation();
  const { data, isPending, isError, isFetching, refetch } = useQuery(
    attioSyncedRecordsQueryOptions,
  );
  const records = data ?? [];

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium">
            {t('Pages.Integrations.Connectors.Detail.SyncedRecords.title')}
          </h4>
          <p className="text-xs text-muted-foreground">
            {t(
              'Pages.Integrations.Connectors.Detail.SyncedRecords.description',
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn(isFetching && 'animate-spin')} />
          {t('Pages.Integrations.Connectors.Detail.SyncedRecords.refresh')}
        </Button>
      </div>
      <Card className="overflow-hidden p-0">
        <SyncedRecordsBody
          isPending={isPending}
          isError={isError}
          records={records}
        />
      </Card>
    </section>
  );
}

function renderRow(record: SyncedRecord) {
  return <SyncedRecordRow key={record.id} record={record} />;
}

function SyncedRecordsBody({
  isPending,
  isError,
  records,
}: {
  isPending: boolean;
  isError: boolean;
  records: SyncedRecord[];
}) {
  const { t } = useTranslation();

  if (isPending) {
    return (
      <StateMessage>
        {t('Pages.Integrations.Connectors.Detail.SyncedRecords.loading')}
      </StateMessage>
    );
  }
  if (isError) {
    return (
      <StateMessage tone="error">
        {t('Pages.Integrations.Connectors.Detail.SyncedRecords.error')}
      </StateMessage>
    );
  }
  if (records.length === 0) {
    return (
      <StateMessage>
        {t('Pages.Integrations.Connectors.Detail.SyncedRecords.empty')}
      </StateMessage>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-4">
            {t(
              'Pages.Integrations.Connectors.Detail.SyncedRecords.Table.record',
            )}
          </TableHead>
          <TableHead>
            {t(
              'Pages.Integrations.Connectors.Detail.SyncedRecords.Table.object',
            )}
          </TableHead>
          <TableHead>
            {t(
              'Pages.Integrations.Connectors.Detail.SyncedRecords.Table.recordId',
            )}
          </TableHead>
          <TableHead>
            {t(
              'Pages.Integrations.Connectors.Detail.SyncedRecords.Table.syncedAt',
            )}
          </TableHead>
          <TableHead className="pr-4">
            {t(
              'Pages.Integrations.Connectors.Detail.SyncedRecords.Table.status',
            )}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{records.map(renderRow)}</TableBody>
    </Table>
  );
}

function SyncedRecordRow({ record }: { record: SyncedRecord }) {
  const { t } = useTranslation();
  const never = t('Pages.Integrations.Connectors.Detail.SyncedRecords.never');

  return (
    <TableRow>
      <TableCell className="pl-4">
        <div className="flex flex-col">
          <span className="text-sm font-medium">{record.name}</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {record.slug}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className="font-mono text-xs">
          {record.object}
        </Badge>
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {record.externalId}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatSyncedAt(record.syncedAt, never)}
      </TableCell>
      <TableCell className="pr-4">
        {record.lastError ? (
          <SyncErrorDialog
            error={record.lastError}
            externalId={record.externalId}
            syncedAt={record.syncedAt}
          >
            <SyncStatusBadge lastError={record.lastError} />
          </SyncErrorDialog>
        ) : (
          <SyncStatusBadge lastError={null} />
        )}
      </TableCell>
    </TableRow>
  );
}

function StateMessage({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: 'error';
}) {
  return (
    <p
      className={cn(
        'px-4 py-8 text-center text-sm text-muted-foreground',
        tone === 'error' && 'text-destructive-subtle-foreground',
      )}
    >
      {children}
    </p>
  );
}
