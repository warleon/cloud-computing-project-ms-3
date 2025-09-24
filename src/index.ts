// src/index.ts
import express, { type Express, type Request, type Response } from "express";
import { createId } from "@paralleldrive/cuid2";
import {
  ensureAccountExists,
  debitAccount,
  creditAccount,
  getAccountBalance,
  type Money,
} from "./mocks/ms2.js";
import { validateTransaction } from "./mocks/ms4.js";

const app: Express = express();
const port = process.env.PORT || 3000;

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

const transactionIdToRecord: Map<string, TransactionRecord> = new Map();

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
    // Asegurar cuentas mock
    const src = ensureAccountExists(sourceAccountId);
    ensureAccountExists(destinationAccountId, src.currency);

    // Compliance mock
    const compliance = validateTransaction({
      sourceAccountId,
      destinationAccountId,
      amount: { value: amount.value, currency: src.currency },
    });

    // Actualizar la moneda en el registro una vez que la conocemos por la cuenta de origen
    record.amount.currency = src.currency;
    transactionIdToRecord.set(id, record);

    if (compliance.decision === "reject") {
      record.status = "failed";
      transactionIdToRecord.set(id, record);
      console.log(`Transaction ${id} failed compliance: ${compliance.reasons.join(",")}`);
      return; // Termina la ejecución de la saga.
    }

    // 2. Orquestación de la transacción (débito, crédito) con compensación
    let debitSucceeded = false;
    try {
      record.status = "processing";
      transactionIdToRecord.set(id, record);

      // Paso 2.1: Debitar cuenta de origen
      const debit = debitAccount(sourceAccountId, { value: amount.value, currency: src.currency });
      if (!debit.ok) {
        throw new Error(`Debit failed: ${debit.reason}`);
      }
      debitSucceeded = true;

      // Paso 2.2: Acreditar cuenta de destino
      const credit = creditAccount(destinationAccountId, { value: amount.value, currency: src.currency });
      if (!credit.ok) {
        throw new Error(`Credit failed: ${credit.reason}`);
      }

      // 3. Finalizar saga con éxito
      record.status = "completed";
      transactionIdToRecord.set(id, record);
      console.log(`Transaction ${id} completed successfully.`);
    } catch (error) {
      // 4. Lógica de compensación en caso de fallo
      record.status = "failed";
      transactionIdToRecord.set(id, record);
      console.error(`Transaction ${id} failed. Reason: ${(error as Error).message}. Initiating compensation.`);

      if (debitSucceeded) {
        const reversal = creditAccount(sourceAccountId, { value: amount.value, currency: src.currency });
        if (!reversal.ok) {
          console.error(`CRITICAL: Failed to revert debit for transaction ${id}. Manual intervention required.`);
        } else {
          console.log(`Debit for transaction ${id} was successfully reverted.`);
        }
      }
    }
  })().catch(err => {
    // Captura errores inesperados en la promesa de la saga
    console.error(`Unhandled error in saga for transaction ${id}:`, err);
    record.status = "failed";
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
  // asegurar cuenta para consistencia del mock
  ensureAccountExists(accountId);
  return res.json({ accountId, transactions: slice });
});

// Helpers para depurar balance mock
app.get("/accounts/:accountId/balance", (req: Request, res: Response) => {
  const { accountId } = req.params as { accountId: string };
  const bal = getAccountBalance(accountId);
  if (!bal) return res.status(404).json({ code: "ACCOUNT_NOT_FOUND", message: "Not found" });
  return res.json({ accountId, balance: bal });
});
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
}

export default app;
