import type { Meta, StoryObj } from '@storybook/react-vite';
import { useSearch } from '@tanstack/react-router';
import { Suspense, useState } from 'react';
import { expect, within } from 'storybook/test';
import { handleGetDashboardSummary } from '@/api-client/msw.gen';
import { graphqlOperationHandler } from '@/e2e/msw/handler-factory';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { auditTrailOperations } from '../../../../../e2e/app/_support/model/graphql-operations';
import {
	buildCalmDashboardSummary,
	buildDashboardSummary,
	buildEmptyDashboardSummary,
} from '../../../../../e2e/app/_support/model/dashboard-summary';
import { createUsageEventsAuditTrailModel } from '../../../../../e2e/app/audit-trail/audit-trail.scenarios';
import {
	type DashboardRange,
	DEFAULT_DASHBOARD_RANGE,
	readDashboardSearch,
} from '../../search';
import { DashboardPage } from '../dashboard-page';

// The page is the route's component with the address read for it: the tab
// travels in the search, as it does in the app, so the tabs work in the story;
// the period is held by the story. The summary comes from the dashboard
// endpoint and the recent changes from the audit trail, both answered by MSW.
function DashboardStory({ initialRange }: { initialRange: DashboardRange }) {
	const search = useSearch({ strict: false });
	const [range, setRange] = useState(initialRange);
	const { view } = readDashboardSearch(search);

	return (
		<Suspense fallback={null}>
			<DashboardPage view={view} range={range} onRangeChange={setRange} />
		</Suspense>
	);
}

function DashboardFrame({
	initialEntry = '/dashboard',
	initialRange = DEFAULT_DASHBOARD_RANGE,
}: {
	initialEntry?: string;
	initialRange?: DashboardRange;
}) {
	return (
		<StorybookRouter initialEntries={[initialEntry]} routePath="/dashboard">
			<div className="h-screen">
				<DashboardStory initialRange={initialRange} />
			</div>
		</StorybookRouter>
	);
}

const summaryHandlers = (summary = buildDashboardSummary()) => [
	handleGetDashboardSummary({ body: summary }),
	graphqlOperationHandler(
		auditTrailOperations(createUsageEventsAuditTrailModel()),
	),
];

const meta = {
	title: 'Features/Dashboard/P0DashboardStories',
	component: DashboardPage,
	parameters: {
		layout: 'fullscreen',
		msw: { handlers: summaryHandlers() },
	},
	tags: ['autodocs'],
} satisfies Meta<typeof DashboardPage>;

export default meta;
type Story = StoryObj<typeof DashboardPage>;

export const Customers: Story = {
	render: () => <DashboardFrame />,
	parameters: {
		docs: {
			description: {
				story:
					'The Customers tab of the Kaiten Sushi Shop on a busy day: two instances at a hard limit, three near their threshold, one silent demo, one license ending and one archived version.',
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(await canvas.findByText('Needs attention')).toBeVisible();
		await expect(
			await canvas.findByText(
				'Ninja Osaka has reached its Menu Items limit on Starter',
			),
		).toBeVisible();
		await expect(
			await canvas.findByText('Sakura Tokyo Production'),
		).toBeVisible();
	},
};

export const Integration: Story = {
	render: () => <DashboardFrame initialEntry="/dashboard?view=integration" />,
	parameters: {
		docs: {
			description: {
				story:
					'The Integration tab: refused usage reports, the reports per day, the instances that report and read, the flags evaluated, the zones behind the latest release and the tokens about to expire.',
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(
			await canvas.findByText('7 usage reports refused in the last 24 hours'),
		).toBeVisible();
		await expect(await canvas.findByText('Usage reports per day')).toBeVisible();
	},
};

export const Calm: Story = {
	render: () => <DashboardFrame />,
	parameters: {
		msw: { handlers: summaryHandlers(buildCalmDashboardSummary()) },
		docs: {
			description: {
				story:
					'The same organization on a quiet day: every check ran and found nothing, and the card says what was checked.',
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(
			await canvas.findByText('Nothing needs your attention'),
		).toBeVisible();
	},
};

export const Empty: Story = {
	render: () => <DashboardFrame />,
	parameters: {
		msw: { handlers: summaryHandlers(buildEmptyDashboardSummary()) },
		docs: {
			description: {
				story:
					'A brand-new organization: nothing recorded yet, and every block says what will fill it.',
			},
		},
	},
};
