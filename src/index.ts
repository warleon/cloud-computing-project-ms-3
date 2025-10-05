// src/index.ts
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createId } from "@paralleldrive/cuid2";
import { type Money } from "./mocks/ms2.js";
import dotenv from 'dotenv';
dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;

const MS2_URL = process.env.MS2_URL || "http://localhost:8000";
const MS2_SERVICE_KEY = process.env.MS2_SERVICE_KEY || "super-secret-key-for-ms3";
const MS4_URL = process.env.MS4_URL || "http://localhost:8002";

app.use(express.json());

type TransactionStatus = "pending" | "processing" | "completed" | "failed";

interface TransferRequestBody {
  transactionType: "transfer";
  sourceAccountId: string;
  destinationAccountId: string;
  amount: { value: number; currency: string };
  description?: string;
}

interface TransactionRecord {
  id: string;
  status: TransactionStatus;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: Money;
  description?: string | undefined;
  createdAt: string;
}

interface ComplianceRequestBody {
  transactionId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: Money;
}

interface ComplianceResponse {
  decision: "approve" | "reject";
  reasons: string[];
}



const transactionIdToRecord: Map<string, TransactionRecord> = new Map();

/**
 * Fetches account details from the Accounts microservice (ms-2).
 * @param accountId The ID of the account to fetch.
 * @returns The account details.
 * @throws An error if the account is not found or if there's a network issue.
 */
async function getAccountDetails(accountId: string): Promise<{ id: string; balance: Money }> {
  const response = await fetch(`${MS2_URL}/accounts/${accountId}`);

  if (response.status === 404) {
    throw new Error(`Account not found: ${accountId}`);
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => `Failed to fetch account details for ${accountId}.`);
    throw new Error(`Failed to fetch account details for ${accountId}. Status: ${response.status}. Body: ${errorBody}`);
  }

  // Asumimos que la respuesta de ms-2 tiene esta estructura
  const accountData = await response.json();
  return { id: accountData.id, balance: accountData.balance };
}

/**
 * Calls the atomic transfer endpoint in the Accounts microservice (ms-2).
 * @param params The transfer details.
 * @returns The result of the transfer.
 * @throws An error if the transfer fails for any reason (business logic or network).
 */
async function executeTransfer(params: {
  requestId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
  currency: string;
}) {
  const response = await fetch(`${MS2_URL}/internal/transfer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-service-key": MS2_SERVICE_KEY,
    },
    body: JSON.stringify({
      requestId: params.requestId,
      fromAccount: params.sourceAccountId,
      toAccount: params.destinationAccountId,
      amount: params.amount,
      currency: params.currency,
    }),
  });

  if (!response.ok) {
    // Intenta parsear el error de FastAPI para dar un mensaje más claro.
    const errorBody = await response.json().catch(() => ({ detail: "Unknown error from ms-2" }));
    throw new Error(
      `Transfer failed with status ${response.status}: ${JSON.stringify(errorBody)}`
    );
  }

  const transferResult = await response.json();
  return transferResult;
}

/**
 * Calls the compliance microservice (ms-4) to validate a transaction.
 * @param params The transaction details for compliance check.
 * @returns The compliance decision.
 * @throws An error if the compliance check fails or is rejected.
 */
async function checkCompliance(params: ComplianceRequestBody): Promise<ComplianceResponse> {
  const response = await fetch(`${MS4_URL}/api/v1/validateTransaction`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transactionId: params.transactionId,
      sourceAccountId: params.sourceAccountId,
      destinationAccountId: params.destinationAccountId,
      amount: params.amount.value, // ✅ Solo el valor numérico
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ detail: "Unknown error from ms-4" }));
    throw new Error(
      `Compliance check failed with status ${response.status}: ${JSON.stringify(errorBody)}`
    );
  }

  const complianceResult: ComplianceResponse = await response.json();
  return complianceResult;
}

app.get("/", (req: Request, res: Response) => {
  res.send("Hello from Express & TypeScript!");
});

// POST /transactions (simple MVP con mocks)
app.post("/transactions", async (req: Request<{}, {}, TransferRequestBody>, res: Response) => {
  const body = req.body;
  if (!body || body.transactionType !== "transfer") {
    return res.status(400).json({ code: "INVALID_REQUEST", message: "transactionType must be 'transfer'" });
  }
  const { sourceAccountId, destinationAccountId, amount } = body;
  if (!sourceAccountId || !destinationAccountId || !amount) {
    return res.status(400).json({ code: "MISSING_FIELDS", message: "sourceAccountId, destinationAccountId, amount are required" });
  }
  if (sourceAccountId === destinationAccountId) {
    return res.status(400).json({ code: "SAME_ACCOUNT", message: "source and destination must differ" });
  }

  // --- Inicio de la Saga ---
  // 1. Crear registro de transacción en estado 'pending'
  const id = createId();
  const record: TransactionRecord = {
    id,
    status: "pending",
    sourceAccountId,
    destinationAccountId,
    amount: { value: amount.value, currency: "USD" }, // La moneda se ajustará después
    description: body.description,
    createdAt: new Date().toISOString(),
  };
  transactionIdToRecord.set(id, record);
  res.status(202).json({ transactionId: id, status: record.status, message: "Transaction received and is being processed." });

  // --- Inicio de la Saga (pasos asíncronos) ---
  // Usamos una función autoejecutable para no bloquear la respuesta inicial.
  (async () => {
    console.log(`[Saga ${id}]: Iniciando procesamiento...`);
    let sourceAccount;
    try {
      // Paso 1: Validar que ambas cuentas existen en paralelo
      const [srcAccount, destAccount] = await Promise.all([
        getAccountDetails(sourceAccountId),
        getAccountDetails(destinationAccountId),
      ]);
      console.log(`[Saga ${id}]: Cuentas validadas exitosamente.`);
      sourceAccount = srcAccount;
    } catch (error) {
      record.status = "failed";
      // El registro se actualiza en el bloque catch final
      if (error instanceof Error) {
        // Imprime el error completo para obtener más detalles de la causa (ej. ECONNREFUSED)
        console.error(`[Saga ${id}]: Falló la validación de cuentas. Razón:`, error);
      } else {
        console.error(`[Saga ${id}]: Falló la validación de cuentas con un error desconocido:`, error);
      }
      // Nota: No se puede notificar al cliente aquí porque ya hemos respondido 202.
      // Esto se registraría y podría ser consultado por el cliente más tarde.
      return;
    }

    // Actualizar la moneda en el registro una vez que la conocemos por la cuenta de origen
    record.amount.currency = sourceAccount.balance.currency;
    transactionIdToRecord.set(id, record);

    // Paso 1.5: Validar con el servicio de Compliance (ms-4)
    console.log(`[Saga ${id}]: Enviando a chequeo de compliance...`);
    const compliance = await checkCompliance({
      transactionId: id,
      sourceAccountId,
      destinationAccountId,
      amount: { value: amount.value, currency: sourceAccount.balance.currency },
    });

    if (compliance.decision === "reject") {
      record.status = "failed";
      const reason = compliance.reasons?.join(", ") || "No reason provided";
      console.error(`[Saga ${id}]: Transacción rechazada por compliance. Razón: ${reason}`);
      return; // Termina la ejecución de la saga.
    }
    console.log(`[Saga ${id}]: Chequeo de compliance aprobado.`);

    // 2. Orquestación de la transacción (débito, crédito) con compensación
    try {
      record.status = "processing";
      console.log(`[Saga ${id}]: Ejecutando transferencia en ms-2...`);
      transactionIdToRecord.set(id, record);

      // Paso 2: Ejecutar la transferencia atómica en ms-2
      await executeTransfer({
        requestId: id,
        sourceAccountId,
        destinationAccountId,
        amount: amount.value,
        currency: sourceAccount.balance.currency,
      });

      // 3. Finalizar saga con éxito
      record.status = "completed";
      console.log(`[Saga ${id}]: Transacción completada exitosamente.`);
    } catch (error) {
      // 4. Lógica de fallo. No se necesita compensación manual, ms-2 es atómico.
      record.status = "failed";
      console.error(`[Saga ${id}]: Falló durante la ejecución de la transferencia. Razón: ${(error as Error).message}.`);
    }
  })().catch(err => {
    // Captura errores inesperados en la promesa de la saga
    console.error(`[Saga ${id}]: Error no manejado en la saga. Razón:`, err);
    record.status = "failed";
  }).finally(() => {
    transactionIdToRecord.set(id, record);
  });
});

// GET /transactions/:transactionId
app.get("/transactions/:transactionId", (req: Request, res: Response) => {
  const { transactionId } = req.params as { transactionId: string };
  const rec = transactionIdToRecord.get(transactionId);
  if (!rec) return res.status(404).json({ code: "TRANSACTION_NOT_FOUND", message: "Not found" });
  return res.json({
    transactionId: rec.id,
    status: rec.status,
    timestamp: rec.createdAt,
    sourceAccountId: rec.sourceAccountId,
    destinationAccountId: rec.destinationAccountId,
    amount: rec.amount,
    description: rec.description,
  });
});

// GET /accounts/:accountId/transactions
app.get("/accounts/:accountId/transactions", (req: Request, res: Response) => {
  const { accountId } = req.params as { accountId: string };
  const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);
  const transactions = Array.from(transactionIdToRecord.values())
    .filter(
      (t) => t.sourceAccountId === accountId || t.destinationAccountId === accountId
    )
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const slice = transactions.slice(offset, offset + limit).map((t) => ({
    transactionId: t.id,
    timestamp: t.createdAt,
    type: t.sourceAccountId === accountId ? "debit" : "credit",
    amount: t.amount,
    description: t.description,
  }));
  return res.json({ accountId, transactions: slice });
});

if (process.env.NODE_ENV !== "test") {
  // Middleware de manejo de errores
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({
      code: "INTERNAL_SERVER_ERROR",
      message: "Something went wrong",
    });
  });

  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
}

export default app;
