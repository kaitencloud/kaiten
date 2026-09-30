import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentCatalogRow } from '../../types';
import {
	getComponentCatalogStats,
	groupComponentCatalogRows,
} from '../../utils/components-catalog';
import {
	storyActor,
	storyLastWeek,
	storyNow,
} from '@/test-fixtures/p0-storybook-fixtures';
import { ComponentsStatsCards } from '../components-stats-cards';
import { ComponentsTable } from '../components-table';

const componentRows = [
	{
		createdAt: storyLastWeek,
		createdBy: storyActor,
		description: 'Handles identity, sessions and tenant-aware tokens.',
		id: 'component-auth-service',
		name: 'Auth Service',
		releaseCount: 2,
		releases: [
			{
				createdAt: storyLastWeek,
				id: 'release-1-4-0',
				slug: 'release-1-4-0',
				status: 'Superseded',
				version: 'v1.4.0',
			},
			{
				createdAt: storyNow,
				id: 'release-1-5-0',
				slug: 'release-1-5-0',
				status: 'Deployed',
				version: 'v1.5.0',
			},
		],
		slug: 'auth-service',
		version: 'v2.3.0',
	},
	{
		createdAt: storyNow,
		createdBy: storyActor,
		description: 'Routes external traffic to app and control APIs.',
		id: 'component-api-gateway',
		name: 'API Gateway',
		previousComponentId: 'component-api-gateway-v4',
		releaseCount: 1,
		releases: [
			{
				createdAt: storyNow,
				id: 'release-1-5-0',
				slug: 'release-1-5-0',
				status: 'Deployed',
				version: 'v1.5.0',
			},
		],
		slug: 'api-gateway',
		version: 'v4.1.0',
	},
	{
		createdAt: storyLastWeek,
		createdBy: storyActor,
		description: 'Routes external traffic to the app API.',
		id: 'component-api-gateway-v4',
		name: 'API Gateway',
		releaseCount: 1,
		releases: [
			{
				createdAt: storyLastWeek,
				id: 'release-1-4-0',
				slug: 'release-1-4-0',
				status: 'Superseded',
				version: 'v1.4.0',
			},
		],
		slug: 'api-gateway-v4',
		version: 'v4.0.0',
	},
] satisfies ComponentCatalogRow[];

const meta = {
	title: 'Features/Components/ComponentCatalog',
	component: ComponentsTable,
	parameters: {
		layout: 'fullscreen',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof ComponentsTable>;

export default meta;
type Story = StoryObj<typeof ComponentsTable>;

export const Default: Story = {
	render: () => (
		<div className="min-h-screen space-y-5 p-6">
			<ComponentsStatsCards
				stats={getComponentCatalogStats(groupComponentCatalogRows(componentRows))}
			/>
			<ComponentsTable
				components={componentRows}
				onClickNew={() => {}}
			/>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					'Component catalog stats and table: one row per component, showing its latest version, that opens onto every version; with releases usage and the create action.',
			},
		},
	},
};

export const Empty: Story = {
	render: () => (
		<div className="min-h-screen space-y-5 p-6">
			<ComponentsStatsCards stats={getComponentCatalogStats([])} />
			<ComponentsTable components={[]} />
		</div>
	),
};
