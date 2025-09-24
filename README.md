MS3 – Transactions Service (REST 3, no DB)

Focus: Money movement, transaction orchestration

Key Functions:

- Initiate payment/transfer (POST /transactions).
  - Validate source/destination accounts with MS2.
  - Call MS4 to check compliance (fraud, AML).
  - If valid, update account balances in MS2.
- Transaction lookup (GET /transactions/{id}).
- List account transactions (GET /accounts/{id}/transactions}).

Business Rules:

- Ensure atomicity (debit + credit must succeed or fail together).

Inter-service communication:

- With MS2 → check/update balances.
- With MS4 → compliance checks.
- Maintain transaction log (could be an append-only event stream).

Resumen de diseño aplicado

- Seguridad: Autenticación `bearerAuth` (JWT) aplicada globalmente.
- Idempotencia: Header obligatorio `Idempotency-Key` en POST `/transactions` para evitar duplicados.
- Trazabilidad: Soporte de `X-Request-Id` para correlación.
- Estados de transacción: `pending | processing | completed | failed` para reflejar orquestación.
- Money: Se define `Money` con `value` decimal como string y `currency` ISO-4217.
- Errores: Esquema común `Error { code, message }` referenciado en 4xx/5xx.
- Paginación: `limit` con límites [1,100] y `offset ≥ 0` en listado por cuenta.
- Operacional: Respuestas adicionales `429` (rate limit) y `503` (downstream).
- Servidores: `https://api.example.com/ms3` y `http://localhost:3003`.

Notas de negocio

- Atomicidad end-to-end: débito y crédito deben confirmarse juntos; si falla cualquier paso (saldo insuficiente en MS2 o rechazo de MS4), la transacción queda `failed` y no se aplican cambios parciales.
- Integración MS2: validación de cuentas y actualización de saldos tras aprobación.
- Integración MS4: verificación de cumplimiento (fraude/AML) previa a movimiento de fondos.

Contrato de APIs

- Etapa inicial (MVP): utilizaremos `Contrato/Apisimple.yml` como contrato base para acelerar desarrollo.
- Etapa avanzada: migrar a `Contrato/APIS.yml` con idempotencia, seguridad, errores comunes y validaciones reforzadas.