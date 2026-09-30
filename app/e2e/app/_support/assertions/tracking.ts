import { expect, type Page } from '@playwright/test';

type LogContext = Record<string, unknown>;

type TrackedEvent = {
  event: string;
  properties?: LogContext;
};

declare global {
  interface Window {
    __KAITEN_E2E_TRACKED_EVENTS__?: TrackedEvent[];
    __KAITEN_E2E_TRACK__?: (event: string, properties?: LogContext) => void;
  }
}

const getTrackedEvents = (page: Page) =>
  page.evaluate(() => window.__KAITEN_E2E_TRACKED_EVENTS__ ?? []);

function includesProperties(
  actual: LogContext | undefined,
  expected: LogContext,
) {
  if (!actual) {
    return false;
  }

  return Object.entries(expected).every(([key, expectedValue]) => {
    return Object.is(actual[key], expectedValue);
  });
}

export async function installTrackingCapture(page: Page) {
  await page.addInitScript(() => {
    window.__KAITEN_E2E_TRACKED_EVENTS__ = [];
    window.__KAITEN_E2E_TRACK__ = (event, properties) => {
      window.__KAITEN_E2E_TRACKED_EVENTS__?.push({ event, properties });
    };
  });
}

export async function expectTrackedEvent(
  page: Page,
  event: string,
  properties: LogContext,
) {
  await expect
    .poll(
      async () => {
        const trackedEvents = await getTrackedEvents(page);

        return trackedEvents.some(
          (trackedEvent) =>
            trackedEvent.event === event &&
            includesProperties(trackedEvent.properties, properties),
        );
      },
      {
        message: `Expected tracking event "${event}" to be emitted`,
      },
    )
    .toBe(true);
}
