import type { Preview } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { withThemeByClassName } from '@storybook/addon-themes';
import { ThemeProvider } from '../src/components/theme-provider';
import { TooltipProvider } from '../src/components/ui/tooltip';
import i18n from '../src/lib/i18n/config';
import { mswLoader } from './msw';
import { darkTheme } from './theme';
import '../src/styles.css';

// Create a fresh query client for each story
const createQueryClient = () => new QueryClient({
	defaultOptions: {
		queries: {
			retry: false,
			staleTime: Number.POSITIVE_INFINITY,
			// A story reads its data once, from the handlers it declares
			// (parameters.msw, see ./msw.ts), and keeps it: no refetch on focus,
			// on reconnect or when a component mounts later, such as a dialog
			// opened by hand, whose query may set a staleTime of its own (the
			// metadata fields keep 30 s, the targeting context 5 min). A query
			// nothing reads yet is not dropped after the default 5 min gcTime
			// either. A request the story declares no handler for fails.
			gcTime: Number.POSITIVE_INFINITY,
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
			refetchOnMount: false,
		},
	},
});

const preview: Preview = {
	loaders: [mswLoader],
	decorators: [
		// Theme decorator must be first to apply theme classes to the root
		withThemeByClassName({
			themes: {
				light: 'light',
				dark: 'dark',
			},
			defaultTheme: 'dark',
			// Apply custom themes to documentation
			parentSelector: 'html',
		}),
		// Then other decorators
		(Story) => {
			const queryClient = createQueryClient();
			return (
				<QueryClientProvider client={queryClient}>
					<I18nextProvider i18n={i18n}>
						<ThemeProvider defaultTheme="dark">
							<TooltipProvider>
								<div style={{ minHeight: '100vh', margin: '1rem' }}>
									<Story />
								</div>
							</TooltipProvider>
						</ThemeProvider>
					</I18nextProvider>
				</QueryClientProvider>
			);
		},
	],
	parameters: {
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},

		a11y: {
			// 'todo' - show a11y violations in the test UI only
			// 'error' - fail CI on a11y violations
			// 'off' - skip a11y checks entirely
			test: "todo",
		},

		// Configure backgrounds to match your theme
		backgrounds: {
			disabled: true,
		},

		// Configure docs theme to sync with dark/light mode
		docs: {
			theme: darkTheme, // Default theme for docs
		},
	},
};

export default preview;
