import request from 'supertest';
import app from '../src/index';

describe('MS3 Smoke', () => {
  test('POST /transactions success moves balance', async () => {
    const source = 'acc-success-src';
    const dest = 'acc-success-dst';

    const createRes = await request(app)
      .post('/transactions')
      .send({
        transactionType: 'transfer',
        sourceAccountId: source,
        destinationAccountId: dest,
        amount: { value: 100, currency: 'USD' },
        description: 'smoke',
      })
      .expect(201);

    expect(createRes.body.transactionId).toBeDefined();

    const balSrc = await request(app).get(`/accounts/${source}/balance`).expect(200);
    const balDst = await request(app).get(`/accounts/${dest}/balance`).expect(200);
    expect(balSrc.body.balance.value).toBeLessThan(1000);
    expect(balDst.body.balance.value).toBeGreaterThan(1000);
  });

  test('POST /transactions rejected by compliance (amount > 5000) -> 422', async () => {
    const res = await request(app)
      .post('/transactions')
      .send({
        transactionType: 'transfer',
        sourceAccountId: 'acc-rej-src',
        destinationAccountId: 'acc-rej-dst',
        amount: { value: 6000, currency: 'USD' },
      })
      .expect(422);
    expect(res.body.code).toBe('COMPLIANCE_REJECTED');
  });

  test('GET /accounts/:id/transactions returns paginated list', async () => {
    const acc = 'acc-list';
    // seed two successful transfers
    await request(app)
      .post('/transactions')
      .send({ transactionType: 'transfer', sourceAccountId: acc, destinationAccountId: 'acc-list-2', amount: { value: 10, currency: 'USD' } })
      .expect(201);
    await request(app)
      .post('/transactions')
      .send({ transactionType: 'transfer', sourceAccountId: 'acc-list-3', destinationAccountId: acc, amount: { value: 15, currency: 'USD' } })
      .expect(201);

    const listRes = await request(app)
      .get(`/accounts/${acc}/transactions?limit=1&offset=0`)
      .expect(200);
    expect(Array.isArray(listRes.body.transactions)).toBe(true);
    expect(listRes.body.transactions.length).toBe(1);
  });
});


