import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Flute } from '../src/index.js';
import { http, HttpResponse, makeServer } from './_helpers/server.js';

// The v2 REST API endpoints live at the API host root, NOT under /isv-api.
// Mirror that in the test fixtures so a future regression that brings
// the prefix back fails this suite as well.
const ISV_BASE = 'https://example.test';
const PAY_INT_BASE = 'https://example.test/pay-int-api';
const OAUTH_BASE = 'https://example.test/identity';

const server = makeServer();
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

function makeFlute(): Flute {
  // Always intercept the OAuth call first so resource calls have a token
  // to attach. Individual tests register additional handlers afterwards.
  server.use(
    http.post(`${OAUTH_BASE}/oauth2/token`, () =>
      HttpResponse.json({
        access_token: 'tok-test',
        token_type: 'Bearer',
        expires_in: 900,
      }),
    ),
  );
  return new Flute({
    clientId: 'cid',
    clientSecret: 'shh',
    baseUrls: { isvApi: ISV_BASE, payIntApi: PAY_INT_BASE, oauth: OAUTH_BASE },
    maxRetries: 0,
  });
}

describe('SettingsResource.getPaymentSettings', () => {
  it('GETs /v2/settings/payment-config and returns the payload verbatim', async () => {
    const sample = {
      availableCurrencies: ['USD'],
      isTipsEnabled: true,
      maxTransactionAmount: 10_000,
      defaultTipsOptions: [10, 15, 20],
    };
    server.use(
      http.get(`${ISV_BASE}/v2/settings/payment-config`, ({ request }) => {
        expect(request.headers.get('authorization')).toBe('Bearer tok-test');
        return HttpResponse.json(sample);
      }),
    );

    const flute = makeFlute();
    const settings = await flute.settings.getPaymentSettings();
    expect(settings).toEqual(sample);
  });
});

describe('TransactionsResource', () => {
  it('list() forwards pageIndex/pageSize and parses the pageInfo envelope', async () => {
    server.use(
      http.get(`${ISV_BASE}/v2/transactions`, ({ request }) => {
        const url = new URL(request.url);
        // The wire parameter is `pageIndex` (zero-based), not `page`. A `page`
        // parameter is silently ignored by the API, which meant pagination
        // always returned the first page — see the 0.3.0 changeset.
        expect(url.searchParams.get('pageIndex')).toBe('1');
        expect(url.searchParams.get('pageSize')).toBe('25');
        expect(url.searchParams.get('page')).toBeNull();
        return HttpResponse.json({
          items: [{ transactionId: 'tx_1', transactionStatus: 'Captured' }],
          pageInfo: {
            pageIndex: 1,
            pageSize: 25,
            totalItems: 26,
            totalPages: 2,
            hasMore: false,
          },
        });
      }),
    );
    const flute = makeFlute();
    const result = await flute.transactions.list({ pageIndex: 1, pageSize: 25 });
    expect(result.pageInfo?.totalItems).toBe(26);
    expect(result.pageInfo?.hasMore).toBe(false);
    expect(result.items?.[0]?.transactionId).toBe('tx_1');
  });

  it('list() forwards the full filter set the API supports', async () => {
    server.use(
      http.get(`${ISV_BASE}/v2/transactions`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('transactionStatus')).toBe('Settled');
        expect(url.searchParams.get('paymentMethodType')).toBe('Card');
        expect(url.searchParams.get('minAmount')).toBe('10.5');
        expect(url.searchParams.get('referenceId')).toBe('ref-42');
        expect(url.searchParams.get('sortOrder')).toBe('desc');
        return HttpResponse.json({ items: [], pageInfo: { pageIndex: 0 } });
      }),
    );
    const flute = makeFlute();
    await flute.transactions.list({
      transactionStatus: 'Settled',
      paymentMethodType: 'Card',
      minAmount: 10.5,
      referenceId: 'ref-42',
      sortOrder: 'desc',
    });
  });

  it('retrieve() encodes the path id and returns the transaction', async () => {
    server.use(
      http.get(`${ISV_BASE}/v2/transactions/tx-abc`, () =>
        HttpResponse.json({ transactionId: 'tx-abc', status: 'Authorized' }),
      ),
    );
    const flute = makeFlute();
    const tx = await flute.transactions.retrieve('tx-abc');
    expect(tx.transactionId).toBe('tx-abc');
  });

  it('sale() POSTs to /v2/transactions and forces captureMethod=Auto', async () => {
    let captured: unknown = undefined;
    server.use(
      http.post(`${ISV_BASE}/v2/transactions`, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({
          transactionId: 'tx_new',
          transactionStatus: 'Approved',
          processedAmount: 50,
        });
      }),
    );
    const flute = makeFlute();
    const result = await flute.transactions.sale({
      baseAmount: 50,
      currencyCode: 'USD',
      transactionDetails: {
        cardData: {
          paymentMethodDetails: {
            cardNumber: '4111111111111111',
            securityCode: '123',
            expirationMonth: 12,
            expirationYear: 2030,
          },
        },
      },
    });
    expect(result.transactionId).toBe('tx_new');
    const body = captured as { transactionDetails: { cardData: { captureMethod: string } } };
    expect(body.transactionDetails.cardData.captureMethod).toBe('Auto');
  });

  it('authorize() forces captureMethod=Manual', async () => {
    let captured: unknown = undefined;
    server.use(
      http.post(`${ISV_BASE}/v2/transactions`, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ transactionId: 'tx_auth' });
      }),
    );
    const flute = makeFlute();
    await flute.transactions.authorize({
      baseAmount: 50,
      transactionDetails: {
        cardData: {
          paymentMethodDetails: {
            cardNumber: '4111111111111111',
            expirationMonth: 12,
            expirationYear: 2030,
          },
        },
      },
    });
    const body = captured as { transactionDetails: { cardData: { captureMethod: string } } };
    expect(body.transactionDetails.cardData.captureMethod).toBe('Manual');
  });

  it('capture() POSTs to /capture with the optional captureAmount', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${ISV_BASE}/v2/transactions/tx_1/capture`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ transactionId: 'tx_1', transactionStatus: 'Approved' });
      }),
    );
    const flute = makeFlute();
    await flute.transactions.capture('tx_1', { captureAmount: 25 });
    // The field is `captureAmount`, not `amount`. Upstream enabled strict JSON
    // binding, so a stale `amount` is now rejected with a 400 rather than
    // silently ignored — partial capture was broken before 0.3.0.
    expect(body?.['captureAmount']).toBe(25);
    expect(body).not.toHaveProperty('amount');
  });

  it('void() POSTs to /reversal with an empty body', async () => {
    server.use(
      http.post(`${ISV_BASE}/v2/transactions/tx_1/reversal`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(Object.keys(body)).toHaveLength(0);
        return HttpResponse.json({ transactionId: 'tx_1', transactionStatus: 'Approved' });
      }),
    );
    const flute = makeFlute();
    await flute.transactions.void('tx_1');
  });

  it('refund() POSTs to /reversal with the optional reversalAmount', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${ISV_BASE}/v2/transactions/tx_1/reversal`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ transactionId: 'tx_1' });
      }),
    );
    const flute = makeFlute();
    await flute.transactions.refund('tx_1', { reversalAmount: 10 });
    expect(body?.['reversalAmount']).toBe(10);
    expect(body).not.toHaveProperty('amount');
  });

  // The endpoint is POST-with-a-body upstream. It was declared GET in the
  // stale spec, and a GET is swallowed by the `/{transactionId}` route, so the
  // call failed with `The value 'calculate-amount' is not valid` for every
  // caller. This test pins the verb.
  it('calculateAmount() POSTs /calculate-amount with a JSON body', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${ISV_BASE}/v2/transactions/calculate-amount`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          currencyCode: 'USD',
          creditCard: { totalAmount: 115 },
        });
      }),
    );
    const flute = makeFlute();
    const result = await flute.transactions.calculateAmount({
      baseAmount: 100,
      tipRate: 0.15,
      pricingType: 'Card',
    });
    expect(body).toEqual({ baseAmount: 100, tipRate: 0.15, pricingType: 'Card' });
    expect(result.creditCard?.totalAmount).toBe(115);
  });

  // `calculateAmount` is a pure computation. The transport stamps an
  // `Idempotency-Key` on every POST by default, which would be wrong here once
  // the gateway starts deduplicating on that key.
  it('calculateAmount() omits Idempotency-Key unless the caller asks for one', async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.post(`${ISV_BASE}/v2/transactions/calculate-amount`, ({ request }) => {
        seen.push(request.headers.get('idempotency-key'));
        return HttpResponse.json({ currencyCode: 'USD' });
      }),
    );
    const flute = makeFlute();
    await flute.transactions.calculateAmount({ baseAmount: 100 });
    await flute.transactions.calculateAmount({ baseAmount: 100 }, { idempotencyKey: 'key_1' });
    expect(seen).toEqual([null, 'key_1']);
  });

  it('rejects empty ids early', async () => {
    const flute = makeFlute();
    await expect(flute.transactions.retrieve('')).rejects.toThrow(/transactionId/);
    await expect(flute.transactions.capture('')).rejects.toThrow(/transactionId/);
    await expect(flute.transactions.void('')).rejects.toThrow(/transactionId/);
    await expect(flute.transactions.refund('')).rejects.toThrow(/transactionId/);
  });
});

describe('PaymentSessionsResource', () => {
  it('create() POSTs and forwards the x-api-version header', async () => {
    server.use(
      http.post(`${PAY_INT_BASE}/payment-sessions`, async ({ request }) => {
        expect(request.headers.get('x-api-version')).toBe('1');
        const body = (await request.json()) as { amount: number; mode: number };
        expect(body.amount).toBe(64.99);
        expect(body.mode).toBe(2);
        return HttpResponse.json({ id: 'ps_1' });
      }),
    );
    const flute = makeFlute();
    const result = await flute.paymentSessions.create({
      amount: 64.99,
      mode: 'SaveMethod',
    });
    expect(result.id).toBe('ps_1');
  });

  it('create() supports numeric mode values', async () => {
    server.use(
      http.post(`${PAY_INT_BASE}/payment-sessions`, async ({ request }) => {
        const body = (await request.json()) as { mode: number };
        expect(body.mode).toBe(3);
        return HttpResponse.json({ id: 'ps_2' });
      }),
    );
    const flute = makeFlute();
    await flute.paymentSessions.create({ amount: 10, mode: 3 });
  });

  it('retrieve() returns the session record', async () => {
    server.use(
      http.get(`${PAY_INT_BASE}/payment-sessions/ps_1`, () =>
        HttpResponse.json({ statusId: 1, status: 'Created', mode: 1 }),
      ),
    );
    const flute = makeFlute();
    const session = await flute.paymentSessions.retrieve('ps_1');
    expect(session.statusId).toBe(1);
    expect(session.status).toBe('Created');
  });

  it('cancel() POSTs and resolves with no value', async () => {
    let called = false;
    server.use(
      http.post(`${PAY_INT_BASE}/payment-sessions/ps_1/cancel`, () => {
        called = true;
        return new HttpResponse(null, { status: 200 });
      }),
    );
    const flute = makeFlute();
    await flute.paymentSessions.cancel('ps_1');
    expect(called).toBe(true);
  });

  it('rejects invalid amounts and ids', async () => {
    const flute = makeFlute();
    await expect(flute.paymentSessions.create({ amount: Number.NaN })).rejects.toThrow(/amount/);
    await expect(flute.paymentSessions.retrieve('')).rejects.toThrow(/paymentSessionId/);
    await expect(flute.paymentSessions.cancel('')).rejects.toThrow(/paymentSessionId/);
  });
});
