# CrossCheck Architecture

## Overview

CrossCheck is a monorepo with discrete services for the web UI, API, and async workers, plus infrastructure-as-code and compliance documentation. The intent is to keep business logic isolated to the API and worker services while the web application focuses on presentation.

## Components

- **Web (Next.js + TypeScript)**: User-facing UI, SSR/CSR as needed, communicates with the API over HTTPS.
- **API (Fastify + TypeScript)**: Serves REST endpoints, authentication, and orchestration for data workflows.
- **Worker (Node.js + TypeScript)**: Runs asynchronous jobs (ingestion, scoring, batch operations) triggered by the API or queues.
- **Infra (Bicep)**: Azure infrastructure templates for networking, compute, data stores, and monitoring.
- **Docs**: Architecture, security, compliance, and operational runbooks.

## Data Flow

1. Users interact with the web UI.
2. The web UI calls the API over HTTPS.
3. The API enqueues or triggers async work for the worker service.
4. Workers process background tasks and persist results.
5. Observability tooling tracks metrics, traces, and logs across services.

## Operational Tenets

- Strict separation between UI, API, and async processing.
- Infrastructure defined declaratively in Bicep.
- Security and compliance artifacts live alongside code.
