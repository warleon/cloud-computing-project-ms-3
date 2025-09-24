import request from 'supertest';
import app from '../src/index';
import { ensureAccountExists } from '../src/mocks/ms2.js';

const waitForTransaction = async (
  transactionId: string,
  finalStatus: 'completed' | 'failed',
  timeout = 2000
): Promise<any> => {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const res = await request(app).get(`/transactions/${transactionId}`);
    if (res.body.status === finalStatus) {
      return res.body;
    }
    await new Promise(resolve => setTimeout(resolve, 100)); // Poll every 100ms
  }
  throw new Error(`Transaction ${transactionId} did not reach status ${finalStatus} within ${timeout}ms`);
};

describe('MS3 Smoke', () => {
  test('POST /transactions success moves balance', async () => {
    const source = 'acc-success-src';
    const dest = 'acc-success-dst';
    // Ensure accounts exist before getting balance
    ensureAccountExists(source);
    ensureAccountExists(dest);
    const initialBalSrc = (await request(app).get(`/accounts/${source}/balance`).expect(200)).body.balance.value;
    const initialBalDst = (await request(app).get(`/accounts/${dest}/balance`).expect(200)).body.balance.value;

    const createRes = await request(app)
      .post('/transactions')
      .send({
        transactionType: 'transfer',
        sourceAccountId: source,
        destinationAccountId: dest,
        amount: { value: 100, currency: 'USD' },
        description: 'smoke',
      })
      .expect(202);

    expect(createRes.body.transactionId).toBeDefined();
    expect(createRes.body.status).toBe('pending');

    // Wait for the transaction to complete
    await waitForTransaction(createRes.body.transactionId, 'completed');

    const balSrc = await request(app).get(`/accounts/${source}/balance`).expect(200);
    const balDst = await request(app).get(`/accounts/${dest}/balance`).expect(200);
    expect(balSrc.body.balance.value).toBe(initialBalSrc - 100);
    expect(balDst.body.balance.value).toBe(initialBalDst + 100);
  });

  test('POST /transactions rejected by compliance (amount > 5000) -> 422', async () => {
    const source = 'acc-rej-src';
    const dest = 'acc-rej-dst';
    // Ensure accounts exist before test
    ensureAccountExists(source);
    ensureAccountExists(dest);
    const initialBalSrc = (await request(app).get(`/accounts/${source}/balance`).expect(200)).body.balance.value;
    const initialBalDst = (await request(app).get(`/accounts/${dest}/balance`).expect(200)).body.balance.value;

    const createRes = await request(app)
      .post('/transactions')
      .send({
        transactionType: 'transfer',
        sourceAccountId: 'acc-rej-src',
        destinationAccountId: 'acc-rej-dst',
        amount: { value: 6000, currency: 'USD' },
      })
      .expect(202);

    // Wait for the transaction to fail
    await waitForTransaction(createRes.body.transactionId, 'failed');

    // Check that balances have not changed
    const balSrc = await request(app).get(`/accounts/${source}/balance`).expect(200);
    const balDst = await request(app).get(`/accounts/${dest}/balance`).expect(200);
    expect(balSrc.body.balance.value).toBe(initialBalSrc);
    expect(balDst.body.balance.value).toBe(initialBalDst);
  });

  test('POST /transactions fails on credit and reverts debit', async () => {
    const source = 'acc-revert-src';
    const dest = 'acc-credit-fail'; // Esta cuenta está configurada en el mock para fallar

    // Ensure accounts exist before test
    ensureAccountExists(source);
    ensureAccountExists(dest);
    const initialBalSrc = (await request(app).get(`/accounts/${source}/balance`).expect(200)).body.balance.value;
    const initialBalDst = (await request(app).get(`/accounts/${dest}/balance`).expect(200)).body.balance.value;

    const createRes = await request(app)
      .post('/transactions')
      .send({
        transactionType: 'transfer',
        sourceAccountId: source,
        destinationAccountId: dest,
        amount: { value: 50, currency: 'USD' },
      })
      .expect(202);

    // Esperamos a que la transacción falle después de intentar el crédito
    await waitForTransaction(createRes.body.transactionId, 'failed');

    // Verificamos que los saldos volvieron a su estado original
    const finalBalSrc = (await request(app).get(`/accounts/${source}/balance`).expect(200)).body.balance.value;
    const finalBalDst = (await request(app).get(`/accounts/${dest}/balance`).expect(200)).body.balance.value;

    // El saldo de origen debe ser el mismo (débito revertido) y el de destino no debe haber cambiado
    expect(finalBalSrc).toBe(initialBalSrc);
    expect(finalBalDst).toBe(initialBalDst);
  });

  test('GET /accounts/:id/transactions returns paginated list', async () => {
    const acc = 'acc-list';
    // seed two successful transfers
    const tx1 = await request(app)
      .post('/transactions')
      .send({ transactionType: 'transfer', sourceAccountId: acc, destinationAccountId: 'acc-list-2', amount: { value: 10, currency: 'USD' } })
      .expect(202);
    const tx2 = await request(app)
      .post('/transactions')
      .send({ transactionType: 'transfer', sourceAccountId: 'acc-list-3', destinationAccountId: acc, amount: { value: 15, currency: 'USD' } })
      .expect(202);

    const listRes = await request(app)
      .get(`/accounts/${acc}/transactions?limit=1&offset=0`)
      .expect(200);
    expect(Array.isArray(listRes.body.transactions)).toBe(true);
    expect(listRes.body.transactions.length).toBe(1);
  });
});
