import { configureApiClient } from './configure-api-client';

// ESM evaluates this once, before the subsequent route-tree import.
configureApiClient();
