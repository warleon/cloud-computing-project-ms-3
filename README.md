MS3 – Transactions Service (REST 3, no DB)

Focus: Money movement, transaction orchestration

Scope (MVP, simple contract)

- API contract file: `Contrato/Apisimple.yml` (used for initial development).
- Endpoints:
  - POST `/transactions`: initiate transfer between accounts.
  - GET `/transactions/{transactionId}`: fetch transaction status/details.
  - GET `/accounts/{accountId}/transactions`: list account transactions (with limit/offset).

Behavior

- Orchestrates with MS2 (accounts) and MS4 (compliance) — mocked locally.
- Atomicity: debit and credit must both succeed; otherwise the operation is rolled back and fails.
- In-memory transaction log for this milestone (no DB).

Notes

- The advanced contract (`Contrato/APIS.yml`) will be adopted later (idempotency, security, shared error schemas, stricter validation).