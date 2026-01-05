# Security Baseline

CrossCheck follows the **Microsoft Cloud Security Benchmark (MCSB)** as a baseline and maps requirements to NIST 800-53 and ISO 27001 controls.

## MCSB Baseline Summary

- **Identity & Access Management**: RBAC, MFA, least privilege, conditional access.
- **Network Security**: Segmentation, WAF, private endpoints, TLS everywhere.
- **Data Protection**: Encryption at rest and in transit, key management, data classification.
- **Logging & Threat Detection**: Centralized logging, SIEM integration, alerting.
- **Vulnerability Management**: Dependency scanning, patch management, SBOM.
- **Backup & Recovery**: Automated backups, tested restore procedures.
- **DevSecOps**: CI/CD with policy gates, secret scanning, infrastructure linting.

## Control Mapping

| MCSB Domain | NIST 800-53 | ISO 27001 |
| --- | --- | --- |
| Identity & Access | AC-2, AC-6, IA-2 | A.9.2, A.9.4 |
| Network Security | SC-7, SC-8 | A.13.1 |
| Data Protection | SC-13, SC-28 | A.10.1, A.18.1 |
| Logging & Monitoring | AU-2, AU-6, SI-4 | A.12.4 |
| Vulnerability Mgmt | RA-5, SI-2 | A.12.6 |
| Backup & Recovery | CP-9, CP-10 | A.12.3 |
| DevSecOps | SA-11, SA-15 | A.14.2 |

## Security Ownership

- Security requirements are defined in docs/ and enforced through CI.
- Infrastructure changes require security review.
- Secrets are stored in a managed secrets service (e.g., Azure Key Vault).
