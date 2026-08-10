import type { ResourceConfig } from './_resourceConfig.js';
import type { paths, components } from '../types/generated/isv-api-v2.js';

// ───────────── public types (re-exported from the OpenAPI surface) ─────────────

/**
 * Aggregated transaction status as exposed in list/retrieve responses.
 *
 * @public
 */
export type TransactionStatus = NonNullable<components['schemas']['AggregatedTransactionStatus']>;

/**
 * Per-event transaction type (sale, capture, void, refund, ...).
 * Returned inside `Transaction.transactionEvents[].type`.
 *
 * @public
 */
export type TransactionType = NonNullable<components['schemas']['TransactionDetailEventType']>;

/**
 * A full transaction record, as returned by {@link TransactionsResource.retrieve}
 * and by every mutating method.
 *
 * Richer than the {@link TransactionSummary} rows that come back from
 * {@link TransactionsResource.list}: this shape additionally carries
 * `transactionEvents`, `refundDetails`, `declineDetails`,
 * `addressVerificationServiceResponse`, and `originalTransactionId`.
 *
 * @public
 */
export type Transaction = NonNullable<components['schemas']['GetTransactionResponseDto']>;

/**
 * A transaction row as returned inside {@link ListTransactionsResponse}.
 *
 * The list endpoint returns a deliberately narrower projection than
 * {@link Transaction} — call {@link TransactionsResource.retrieve} with the
 * `transactionId` when you need the event history or refund totals.
 *
 * @public
 */
export type TransactionSummary = NonNullable<
  components['schemas']['TransactionSummaryResponseDto']
>;

/**
 * Result envelope returned by `sale` / `authorize` / `capture` / `void` /
 * `refund`. Contains the new authoritative transaction status, the
 * processor response, and the receipt body when applicable.
 *
 * @public
 */
export type TransactionResult = Transaction;

/**
 * Pagination metadata attached to {@link ListTransactionsResponse}.
 *
 * @public
 */
export type PageInfo = NonNullable<components['schemas']['PageInfoDto']>;

/**
 * Query parameters accepted by {@link TransactionsResource.list}.
 *
 * Derived straight from the spec, so the full filter set the API supports
 * (`fromDate` / `toDate`, `transactionStatus`, `paymentMethodType`,
 * `customerId`, `minAmount` / `maxAmount`, `referenceId`, `batchId`,
 * `sortBy` / `sortOrder`, ...) is available without this file having to
 * restate it.
 *
 * Note `pageIndex` is **zero-based**.
 *
 * @public
 */
export type ListTransactionsParams = NonNullable<
  paths['/v2/transactions']['get']['parameters']['query']
>;

/**
 * Response shape for {@link TransactionsResource.list}: a page of rows plus
 * the pagination envelope.
 *
 * @public
 */
export type ListTransactionsResponse = NonNullable<
  components['schemas']['PagedResponseDtoOfTransactionSummaryResponseDto']
>;

/**
 * Body fields shared by `sale` and `authorize`. Mirrors
 * `CreateTransactionRequestDto` in the API. Card vs ACH is selected by
 * which of `transactionDetails.cardData` or `transactionDetails.achData`
 * the caller populates.
 *
 * @public
 */
export type CreateTransactionParams = Omit<
  NonNullable<components['schemas']['CreateTransactionRequestDto']>,
  // The SDK injects these — callers don't get to choose. (`captureMethod`
  // is set by `sale` vs `authorize`; the other three are mobile-app-only
  // attribution fields irrelevant to a server-side SDK.)
  never
>;

/**
 * Alias used by {@link TransactionsResource.authorize}. The SDK forces
 * `captureMethod = "Manual"` on top of whatever the caller passes.
 *
 * @public
 */
export type AuthorizeTransactionParams = CreateTransactionParams;

/**
 * Alias used by {@link TransactionsResource.sale}. The SDK forces
 * `captureMethod = "Auto"` on top of whatever the caller passes.
 *
 * @public
 */
export type SaleTransactionParams = CreateTransactionParams;

/**
 * Body for {@link TransactionsResource.capture}. Omit `captureAmount` for a
 * full capture; pass an amount strictly less than the authorized total
 * for a partial capture.
 *
 * @public
 */
export type CaptureTransactionParams = NonNullable<components['schemas']['CaptureRequestDto']>;

/**
 * Body for {@link TransactionsResource.refund}. Omit `reversalAmount` for a
 * full refund; pass an amount for a partial card refund.
 *
 * @public
 */
export type RefundTransactionParams = NonNullable<components['schemas']['ReversalRequestDto']>;

/**
 * Body for {@link TransactionsResource.calculateAmount}.
 *
 * @public
 */
export type CalculateAmountParams = NonNullable<components['schemas']['CalculateAmountRequestDto']>;

/**
 * Response shape for {@link TransactionsResource.calculateAmount}.
 *
 * @public
 */
export type CalculateAmountResponse = NonNullable<
  components['schemas']['CalculateAmountResponseDto']
>;

/**
 * Per-request overrides accepted by every method of the Transactions resource.
 *
 * @public
 */
export interface TransactionsRequestOptions {
  /** Override the default per-request timeout. */
  readonly timeoutMs?: number;
  /** Override the default retry count. */
  readonly maxRetries?: number;
  /**
   * Override the per-call idempotency key. The SDK generates one
   * automatically for every state-changing request; pass an explicit
   * value to make the call retry-safe across SDK invocations
   * (e.g. consume the same key on a webhook-driven retry job).
   */
  readonly idempotencyKey?: string;
  /** Cancel from outside the SDK. */
  readonly signal?: AbortSignal;
}

// ───────────── implementation ─────────────

/**
 * Transactions API: card and ACH lifecycle.
 *
 * - {@link list}, {@link retrieve} — read.
 * - {@link sale}, {@link authorize}, {@link capture}, {@link void},
 *   {@link refund} — state changes; idempotent on `Idempotency-Key`.
 * - {@link calculateAmount} — pricing helper that respects the merchant's
 *   ZCP / dual-pricing / surcharge / discount configuration.
 *
 * @public
 */
export class TransactionsResource {
  readonly #config: ResourceConfig;

  /** @internal */
  public constructor(config: ResourceConfig) {
    this.#config = config;
  }

  /**
   * Paginated list of transactions for the merchant, newest first by default.
   *
   * `pageIndex` is zero-based and is echoed back in `pageInfo`. Every filter
   * the API supports is accepted — see {@link ListTransactionsParams}.
   *
   * @example
   * ```ts
   * const page = await flute.transactions.list({ pageIndex: 0, pageSize: 25 });
   * console.log(page.pageInfo?.totalItems, page.pageInfo?.hasMore);
   * ```
   */
  public async list(
    params: ListTransactionsParams = {},
    options: TransactionsRequestOptions = {},
  ): Promise<ListTransactionsResponse> {
    const response = await this.#config.http.request<ListTransactionsResponse>({
      method: 'GET',
      url: `${this.#config.baseUrls.isvApi}/v2/transactions`,
      query: params,
      ...this.#requestOverrides(options),
    });
    return response.data;
  }

  /** Retrieve a single transaction by id. */
  public async retrieve(
    transactionId: string,
    options: TransactionsRequestOptions = {},
  ): Promise<Transaction> {
    requireId(transactionId, 'transactionId');
    const response = await this.#config.http.request<Transaction>({
      method: 'GET',
      url: `${this.#config.baseUrls.isvApi}/v2/transactions/${encodeURIComponent(transactionId)}`,
      ...this.#requestOverrides(options),
    });
    return response.data;
  }

  /**
   * Authorize a card transaction (manual capture). The funds are placed
   * on hold; complete the charge later with {@link capture}.
   */
  public async authorize(
    params: AuthorizeTransactionParams,
    options: TransactionsRequestOptions = {},
  ): Promise<TransactionResult> {
    return this.#submit(params, 'Manual', options);
  }

  /**
   * Sale (auto-capture). One-shot charge that goes to settlement.
   */
  public async sale(
    params: SaleTransactionParams,
    options: TransactionsRequestOptions = {},
  ): Promise<TransactionResult> {
    return this.#submit(params, 'Auto', options);
  }

  /**
   * Capture an authorization, optionally partial. Pass `amount` to
   * capture a subset of the originally authorized total.
   */
  public async capture(
    transactionId: string,
    params: CaptureTransactionParams = {},
    options: TransactionsRequestOptions = {},
  ): Promise<TransactionResult> {
    requireId(transactionId, 'transactionId');
    const response = await this.#config.http.request<TransactionResult>({
      method: 'POST',
      url: `${this.#config.baseUrls.isvApi}/v2/transactions/${encodeURIComponent(transactionId)}/capture`,
      body: params,
      ...this.#requestOverrides(options),
    });
    return response.data;
  }

  /**
   * Void / reverse a transaction that has not yet settled. The API
   * auto-detects card vs ACH and chooses the right reversal flow.
   */
  public async void(
    transactionId: string,
    options: TransactionsRequestOptions = {},
  ): Promise<TransactionResult> {
    requireId(transactionId, 'transactionId');
    const response = await this.#config.http.request<TransactionResult>({
      method: 'POST',
      url: `${this.#config.baseUrls.isvApi}/v2/transactions/${encodeURIComponent(transactionId)}/reversal`,
      body: {},
      ...this.#requestOverrides(options),
    });
    return response.data;
  }

  /**
   * Refund a settled transaction, optionally partial (card only).
   * For unsettled transactions, prefer {@link void}.
   */
  public async refund(
    transactionId: string,
    params: RefundTransactionParams = {},
    options: TransactionsRequestOptions = {},
  ): Promise<TransactionResult> {
    requireId(transactionId, 'transactionId');
    const response = await this.#config.http.request<TransactionResult>({
      method: 'POST',
      url: `${this.#config.baseUrls.isvApi}/v2/transactions/${encodeURIComponent(transactionId)}/reversal`,
      body: params,
      ...this.#requestOverrides(options),
    });
    return response.data;
  }

  /**
   * Compute the final amount to charge given a base amount and the
   * merchant's pricing config (Zero-Cost Processing, dual pricing,
   * surcharge / discount, tip). Returns one breakdown per supported
   * payment method (card credit / debit, ACH, cash).
   */
  public async calculateAmount(
    params: CalculateAmountParams,
    options: TransactionsRequestOptions = {},
  ): Promise<CalculateAmountResponse> {
    const response = await this.#config.http.request<CalculateAmountResponse>({
      method: 'POST',
      url: `${this.#config.baseUrls.isvApi}/v2/transactions/calculate-amount`,
      body: params,
      // The transport stamps an `Idempotency-Key` on every POST. We opt out
      // here because this endpoint is the one POST on the v2 surface with no
      // side effect — a pure pricing computation, with nothing to replay. All
      // 31 other mutating-verb operations genuinely change state.
      //
      // This matches the documented server behaviour: read-only endpoints
      // ignore the header, and idempotent replay is scoped to the endpoints
      // that actually mutate (sale, authorization, capture, void, refund, and
      // the ACH operations). `calculate-amount` is deliberately not among them.
      //
      // It also guards against a plausible implementation shortcut. If replay
      // is ever keyed off the HTTP verb rather than an endpoint allowlist, this
      // call gets swept in — and a caller reusing one key across a checkout
      // while adjusting the amount would then hit a body-mismatch conflict on a
      // call that should simply recompute.
      //
      // An explicit caller-supplied key still wins, via the spread below.
      idempotencyKey: null,
      ...this.#requestOverrides(options),
    });
    return response.data;
  }

  // ───────────── internals ─────────────

  async #submit(
    params: CreateTransactionParams,
    captureMethod: 'Auto' | 'Manual',
    options: TransactionsRequestOptions,
  ): Promise<TransactionResult> {
    const body = this.#withCaptureMethod(params, captureMethod);
    const response = await this.#config.http.request<TransactionResult>({
      method: 'POST',
      url: `${this.#config.baseUrls.isvApi}/v2/transactions`,
      body,
      ...this.#requestOverrides(options),
    });
    return response.data;
  }

  #withCaptureMethod(
    params: CreateTransactionParams,
    captureMethod: 'Auto' | 'Manual',
  ): CreateTransactionParams {
    const transactionDetails = params.transactionDetails ?? {};
    const cardData = transactionDetails.cardData;
    if (cardData === undefined) {
      // ACH path — captureMethod is irrelevant. Forward params verbatim.
      return params;
    }
    return {
      ...params,
      transactionDetails: {
        ...transactionDetails,
        cardData: { ...cardData, captureMethod },
      },
    };
  }

  #requestOverrides(options: TransactionsRequestOptions): {
    timeoutMs?: number;
    maxRetries?: number;
    idempotencyKey?: string;
    signal?: AbortSignal;
  } {
    return {
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
      ...(options.idempotencyKey !== undefined ? { idempotencyKey: options.idempotencyKey } : {}),
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
    };
  }
}

function requireId(value: string, name: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`\`${name}\` is required and must be a non-empty string.`);
  }
}
