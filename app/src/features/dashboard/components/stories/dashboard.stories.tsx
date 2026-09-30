import type { Meta, StoryObj } from '@storybook/react-vite';
import { storyDashboardMetrics } from './dashboard.fixtures';
import { DashboardInsightCards } from '../cards/dashboard-insight-cards';
import { DashboardStatsCards } from '../cards/dashboard-stats-cards';
import { EntitlementSaturationHeatmapChart } from '../charts/entitlement-saturation-heatmap-chart';
import { FeatureFlagsGovernanceChart } from '../charts/feature-flags-governance-chart';
import { FlagTargetingComplexityChart } from '../charts/flag-targeting-complexity-chart';
import { InstanceLifecycleTimelineChart } from '../charts/instance-lifecycle-timeline-chart';
import { LicenseExpirationForecastChart } from '../charts/license-expiration-forecast-chart';
import { ReleaseCadenceChart } from '../charts/release-cadence-chart';
import { ReleaseCoverageByZoneChart } from '../charts/release-coverage-by-zone-chart';
import { TokenSecurityPostureChart } from '../charts/token-security-posture-chart';
import { TopCustomersByInstancesChart } from '../charts/top-customers-by-instances-chart';

const charts = storyDashboardMetrics.charts;

const meta = {
	title: 'Features/Dashboard/P0DashboardStories',
	component: DashboardStatsCards,
	parameters: {
		layout: 'fullscreen',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof DashboardStatsCards>;

export default meta;
type Story = StoryObj<typeof DashboardStatsCards>;

const DashboardFrame = ({ children }: { children: React.ReactNode }) => (
	<div className="min-h-screen space-y-5 p-6">{children}</div>
);

export const SummaryCards: Story = {
	render: () => (
		<DashboardFrame>
			<DashboardStatsCards summary={storyDashboardMetrics.summary} />
			<DashboardInsightCards summary={storyDashboardMetrics.summary} />
		</DashboardFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					'Dashboard summary and insight cards for key customers, instances, licenses, feature flags and service-account risks.',
			},
		},
	},
};

export const AllCharts: Story = {
	render: () => (
		<DashboardFrame>
			<div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
				<InstanceLifecycleTimelineChart data={charts.instanceLifecycleTimeline} />
				<ReleaseCadenceChart data={charts.releaseCadence} />
				<ReleaseCoverageByZoneChart data={charts.releaseCoverageByZone} />
				<TopCustomersByInstancesChart data={charts.topCustomersByInstances} />
				<FeatureFlagsGovernanceChart data={charts.featureFlagsGovernance} />
				<FlagTargetingComplexityChart data={charts.flagTargetingComplexity} />
				<TokenSecurityPostureChart data={charts.tokenSecurityPosture} />
				<LicenseExpirationForecastChart data={charts.licenseExpirationForecast} />
				<div className="xl:col-span-2">
					<EntitlementSaturationHeatmapChart
						data={charts.entitlementSaturationHeatmap}
					/>
				</div>
			</div>
		</DashboardFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					'All dashboard charts rendered together as a visual reference for dense operational data.',
			},
		},
	},
};

export const InstanceLifecycleTimeline: Story = {
	render: () => (
		<DashboardFrame>
			<InstanceLifecycleTimelineChart data={charts.instanceLifecycleTimeline} />
		</DashboardFrame>
	),
};

export const ReleaseCadence: Story = {
	render: () => (
		<DashboardFrame>
			<ReleaseCadenceChart data={charts.releaseCadence} />
		</DashboardFrame>
	),
};

export const ReleaseCoverageByZone: Story = {
	render: () => (
		<DashboardFrame>
			<ReleaseCoverageByZoneChart data={charts.releaseCoverageByZone} />
		</DashboardFrame>
	),
};

export const TopCustomersByInstances: Story = {
	render: () => (
		<DashboardFrame>
			<TopCustomersByInstancesChart data={charts.topCustomersByInstances} />
		</DashboardFrame>
	),
};

export const FeatureFlagsGovernance: Story = {
	render: () => (
		<DashboardFrame>
			<FeatureFlagsGovernanceChart data={charts.featureFlagsGovernance} />
		</DashboardFrame>
	),
};

export const FlagTargetingComplexity: Story = {
	render: () => (
		<DashboardFrame>
			<FlagTargetingComplexityChart data={charts.flagTargetingComplexity} />
		</DashboardFrame>
	),
};

export const TokenSecurityPosture: Story = {
	render: () => (
		<DashboardFrame>
			<TokenSecurityPostureChart data={charts.tokenSecurityPosture} />
		</DashboardFrame>
	),
};

export const LicenseExpirationForecast: Story = {
	render: () => (
		<DashboardFrame>
			<LicenseExpirationForecastChart data={charts.licenseExpirationForecast} />
		</DashboardFrame>
	),
};

export const EntitlementSaturationHeatmap: Story = {
	render: () => (
		<DashboardFrame>
			<EntitlementSaturationHeatmapChart
				data={charts.entitlementSaturationHeatmap}
			/>
		</DashboardFrame>
	),
};

export const EmptyCharts: Story = {
	render: () => (
		<DashboardFrame>
			<div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
				<ReleaseCadenceChart data={[]} />
				<FeatureFlagsGovernanceChart
					data={{ enabledDisabled: [], typeDistribution: [] }}
				/>
				<EntitlementSaturationHeatmapChart data={[]} />
			</div>
		</DashboardFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					'Representative empty chart states for dashboard cards that can receive no data.',
			},
		},
	},
};
