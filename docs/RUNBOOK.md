# CrossCheck Runbook

## Service Operation

- **Web**: deploy Next.js app; ensure API base URL is configured.
- **API**: monitor `/health` and error rates; scale horizontally.
- **Worker**: run as a background service; monitor queue depth and job latency.

## Authentication Setup

CrossCheck supports two deployment modes that are selected by `AUTH_MODE`.

### Enterprise Mode (AUTH_MODE=enterprise)

Use an Entra ID workforce tenant with seamless sign-on.

1. Register a single-page application in Entra ID.
2. Configure redirect URIs for the web app (for example, `https://app.example.com`).
3. Create app roles named `admin`, `coordinator`, and `user` in the app registration and assign them to users/groups.
4. Set the API environment variables:

   - `AUTH_MODE=enterprise`
   - `AUTH_TENANT_ID=<workforce tenant id>`
   - `AUTH_CLIENT_ID=<app registration client id>`
   - `AUTH_AUDIENCE=<api audience or client id>`
   - `AUTH_API_SCOPE=api://<audience>/user_impersonation`
   - `AUTH_SCOPES=openid,profile,email`

### Public Mode (AUTH_MODE=public)

Use an Entra External ID tenant configured with Microsoft Live and Google identity providers.

1. Create an External ID tenant and enable Microsoft Live + Google as social identity providers.
2. Register the web app in the External ID tenant and capture the client ID.
3. Set the API environment variables:

   - `AUTH_MODE=public`
   - `AUTH_PUBLIC_TENANT_ID=<external id tenant id>`
   - `AUTH_PUBLIC_CLIENT_ID=<external id app client id>`
   - `AUTH_AUDIENCE=<api audience or client id>`
   - `AUTH_API_SCOPE=api://<audience>/user_impersonation`
   - `AUTH_SCOPES=openid,profile,email`
   - `AUTH_PUBLIC_PROVIDERS=[{\"id\":\"microsoft\",\"label\":\"Microsoft\"},{\"id\":\"google\",\"label\":\"Google\"}]`

### Tenant Branding

Use environment variables to supply tenant-specific branding that the UI will apply on load:

- `AUTH_BRANDING_APP_NAME=CrossCheck`
- `AUTH_BRANDING_LOGO_URL=https://cdn.example.com/brand/logo.svg`
- `AUTH_BRANDING_PRIMARY_COLOR=#1d4ed8`
- `AUTH_BRANDING_BACKGROUND_COLOR=#f8fafc`

### Web Environment Variables

- `NEXT_PUBLIC_API_BASE_URL=https://api.example.com`

## Key Rotation

1. Identify keys to rotate (API tokens, DB credentials, third-party keys).
2. Create new secrets in the secrets manager.
3. Deploy services with dual-read capability if supported.
4. Swap to new secrets and validate service health.
5. Revoke old secrets after confirmation.
6. Document the rotation in the audit log.

## Incident Response

1. **Detect**: trigger on alerts from logs/metrics.
2. **Triage**: assess severity and scope.
3. **Contain**: isolate affected services or credentials.
4. **Eradicate**: remediate root cause and patch systems.
5. **Recover**: restore service and validate.
6. **Postmortem**: document timeline, impact, and follow-ups.

## Escalation

- On-call engineer is primary responder.
- Security lead is engaged for data or access incidents.
- Product owner is notified for customer-impacting incidents.
