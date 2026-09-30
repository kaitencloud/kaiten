import type { Meta, StoryObj } from '@storybook/react-vite';
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from '@tanstack/react-router';
import { useState } from 'react';
import { SettingsPageContent } from '../settings-page-content';

// added a `<Link to="/settings/metadata">` to the metadata-fields
// admin page. TanStack Router's <Link> calls useLinkProps, which throws
// without a RouterProvider in scope, so the story mounts the component
// inside a minimal in-memory router instead of rendering it bare.
function SettingsWrapper() {
	const [router] = useState(() =>
		createRouter({
			routeTree: createRootRoute({
				component: () => (
					<div className="min-h-screen p-6">
						<SettingsPageContent />
					</div>
				),
			}),
			history: createMemoryHistory({ initialEntries: ['/'] }),
		}),
	);

	return <RouterProvider router={router} />;
}

const meta = {
	title: 'Features/Settings/SettingsPageContent',
	component: SettingsPageContent,
	parameters: {
		layout: 'fullscreen',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof SettingsPageContent>;

export default meta;
type Story = StoryObj<typeof SettingsPageContent>;

export const Default: Story = {
	render: () => <SettingsWrapper />,
	parameters: {
		docs: {
			description: {
				story:
					'Settings page content with local app-state reset controls and confirmation dialog trigger.',
			},
		},
	},
};
