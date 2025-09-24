// src/index.ts
import express, { type Express, type Request, type Response } from "express";
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

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

app.get("/", (req: Request, res: Response) => {
  res.send("Hello from Express & TypeScript!");
});

// POST /transactions (simple MVP con mocks)
app.post("/transactions", (req: Request<{}, {}, TransferRequestBody>, res: Response) => {
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

  // Asegurar cuentas mock
  const src = ensureAccountExists(sourceAccountId);
  const dst = ensureAccountExists(destinationAccountId, src.currency);

  // Compliance mock
  const compliance = validateTransaction({
    sourceAccountId,
    destinationAccountId,
    amount: { value: amount.value, currency: src.currency },
  });
  if (compliance.decision === "reject") {
    return res.status(422).json({ code: "COMPLIANCE_REJECTED", message: compliance.reasons.join(",") });
  }

  // Orquestación simple: débito y luego crédito; si crédito falla, revertir débito
  const debit = debitAccount(sourceAccountId, { value: amount.value, currency: src.currency });
  if (!debit.ok) {
    return res.status(409).json({ code: debit.reason, message: "Debit failed" });
  }
  const credit = creditAccount(destinationAccountId, { value: amount.value, currency: src.currency });
  if (!credit.ok) {
    // revertir débito
    creditAccount(sourceAccountId, { value: amount.value, currency: src.currency });
    return res.status(503).json({ code: credit.reason, message: "Credit failed" });
  }

  const id = generateId();
  const record: TransactionRecord = {
    id,
    status: "completed",
    sourceAccountId,
    destinationAccountId,
    amount: { value: amount.value, currency: src.currency },
    description: body.description,
    createdAt: new Date().toISOString(),
  };
  transactionIdToRecord.set(id, record);
  res.status(201).json({ transactionId: id, status: record.status, message: "Transaction submitted for processing." });
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
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
