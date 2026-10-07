import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import type { UsageReport } from '@/api-client';
import { DataTable } from '@/functionals/table';
import { buildUsageReport } from '@/test-fixtures/storybook-billing-fixtures';
import { PeriodFilter, useUsageReportColumns } from '..';
import { getLimitChangeSeqs } from '../../logic';

const meta = {
  title: 'Domains/Billing/UsageReports',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const WINDOW = {
  windowEnd: '2027-04-01T00:00:00.000Z',
  windowStart: '2027-03-01T00:00:00.000Z',
};

const REPORTS: UsageReport[] = [
  buildUsageReport({
    delta: '100',
    limitValue: '100000',
    overageDelta: '0',
    reportSeq: 41,
    reportedAt: '2027-03-02T09:15:00.000Z',
    reportedValue: '100',
    valueAfter: '100',
    valueBefore: '0',
    ...WINDOW,
  }),
  // An add-on raised the limit: the row says so.
  buildUsageReport({
    delta: '40',
    limitValue: '150000',
    overageDelta: '0',
    properties: { region: 'eu-west-1', source: 'sdk' },
    reportSeq: 42,
    reportedAt: '2027-03-03T14:30:00.000Z',
    reportedValue: '40',
    valueAfter: '140',
    valueBefore: '100',
    ...WINDOW,
  }),
  buildUsageReport({
    delta: '160000',
    limitValue: '150000',
    overageDelta: '10140',
    reportSeq: 43,
    reportedAt: '2027-03-20T08:00:00.000Z',
    reportedValue: '160000',
    valueAfter: '160140',
    valueBefore: '140',
    ...WINDOW,
  }),
];

function ReportsTable({
  reports,
  showOverage,
  showValue,
}: {
  reports: UsageReport[];
  showOverage?: boolean;
  showValue?: boolean;
}) {
  const limitChanges = getLimitChangeSeqs(reports);
  const columns = useUsageReportColumns({ limitChanges, showOverage, showValue });

  return (
    <div className="overflow-hidden rounded-lg border">
      <DataTable
        columns={columns}
        data={reports}
        getRowId={(report) => String(report.reportSeq)}
        pagination={false}
        variant="simple"
      />
    </div>
  );
}

// The journal behind an invoice line: the counter before and after, what the
// report changed and the overage it made, the limit in force with the report where
// it moved marked, and what the instance sent with a report on request.
export const ForAnInvoice: Story = {
  render: () => <ReportsTable reports={REPORTS} showOverage />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole('columnheader', { name: 'Overage change' })).toBeVisible();
    await expect(canvas.queryByRole('columnheader', { name: 'Value' })).toBeNull();
    await expect(canvas.getByText('10,140')).toBeVisible();
    // Only the report where the limit moved is marked.
    await expect(canvas.getAllByText('Limit changed')).toHaveLength(1);
  },
};

// The history of an instance: the value as it was sent rather than the overage,
// since it audits what the instance reported and bills nothing.
export const ForAnInstance: Story = {
  render: () => <ReportsTable reports={REPORTS} showValue />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole('columnheader', { name: 'Value' })).toBeVisible();
    await expect(canvas.queryByRole('columnheader', { name: 'Overage change' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Show the properties of report 42' }));
    const dialog = within(await within(document.body).findByRole('dialog', { name: 'Properties of report 42' }));
    await expect(dialog.getByText(/eu-west-1/)).toBeInTheDocument();
  },
};

function Period() {
  const [period, setPeriod] = useState<{ from?: string; to?: string }>({});

  return (
    <div className="max-w-md space-y-2">
      <PeriodFilter
        from={period.from}
        label="Period (UTC)"
        onChange={setPeriod}
        to={period.to}
      />
      <p data-testid="applied">{JSON.stringify(period)}</p>
    </div>
  );
}

// A period is days read in UTC, the second being where it ends. One that ends
// before it starts is not applied and says so, since the API would refuse it.
export const PeriodOfDays: Story = {
  render: () => <Period />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.type(await canvas.findByLabelText('From'), '2027-03-10');
    await expect(canvas.getByTestId('applied')).toHaveTextContent('"from":"2027-03-10T00:00:00.000Z"');
    await userEvent.type(canvas.getByLabelText('Before'), '2027-03-01');
    await expect(canvas.getByText('The period must end after it starts.')).toBeVisible();
    // The invalid end was not applied.
    await expect(canvas.getByTestId('applied')).not.toHaveTextContent('"to"');
  },
};
