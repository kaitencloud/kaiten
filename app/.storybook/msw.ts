import type { RequestHandler } from 'msw';
import { HttpResponse, http } from 'msw/http';
import { handleGetBillingCapabilities } from '../src/api-client/msw.gen';
import { billingCapabilitiesProfiles } from '../e2e/app/_support/model/billing-capabilities';
import { createPageNetwork } from '../src/e2e/msw/page-network';

/**
 * What a story's API answers: `parameters: { msw: { handlers: [...] } }`, built
 * from the handlers generated per operation (`@/api-client/msw.gen`), or with
 * `graphqlOperationHandler` (`@/e2e/msw/handler-factory`) for GraphQL. A component
 * fetches its data as it does in the app, from whatever the story declares.
 */
export type MswParameters = {
	msw?: { handlers?: RequestHandler[] };
};

// What every story's API answers unless it declares otherwise: the app shell
// reads the billing capabilities, and billing is off by default.
const defaultHandlers = [
	handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.disabled() }),
];

// Answers last, so only a request to the API that the story declares no
// handler for: a network error, as from an API that is down, and a console
// error that names the request. The story shows its error state rather than
// whatever the Storybook server, or a running stack, would have answered.
const undeclaredApiRequest = http.all('*/api/*', ({ request }) => {
	console.error(
		`[MSW] ${request.method} ${request.url}: the story declares no handler for this request (parameters.msw.handlers).`,
	);
	return HttpResponse.error();
});

// Mock Service Worker in the page, rather than in a service worker. A service
// worker sends every request of the page through a round trip to it, the
// modules the Storybook tests import included, and under that load some of
// those imports failed. In the page, only the requests of the stories' own code
// are seen.
const network = createPageNetwork();
let enabled: Promise<void> | undefined;

/**
 * Enables the mocked network once, then gives it the handlers of the story
 * about to render, in place of the previous story's. Every request outside the
 * API goes to the network.
 *
 * The handlers are the network's, not the story's: a docs page that renders
 * several stories at once serves all of them with the last one's handlers.
 */
export async function mswLoader({
	parameters,
}: {
	parameters: MswParameters;
}) {
	enabled ??= Promise.resolve(network.enable());
	await enabled;
	network.resetHandlers(
		...(parameters.msw?.handlers ?? []),
		...defaultHandlers,
		undeclaredApiRequest,
	);
	return {};
}
