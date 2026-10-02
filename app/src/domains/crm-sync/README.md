# CRM sync

Customers, instances and connectors share Attio integration read models and UI
through this domain's explicit entry point. The module owns business connector
names, SDK/API reads, settings and synchronization state.

`queries/attio-sync-coordinator.ts` owns polling, cancellation and completion as
one lifecycle, scoped by QueryClient in a WeakMap. Its completion refreshes the
customer/instance canonical REST and GraphQL queries. Keep that lifecycle intact;
the state is not copied into a global UI store. Coordinator unit tests and the
customer asynchronous-sync E2E verify it.
