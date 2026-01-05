# CrossCheck Runbook

## Service Operation

- **Web**: deploy Next.js app; ensure API base URL is configured.
- **API**: monitor `/health` and error rates; scale horizontally.
- **Worker**: run as a background service; monitor queue depth and job latency.

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
