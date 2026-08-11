# Protected Variations Pattern

## Definition

Identify points of predicted variation or instability and assign responsibilities to create a stable interface around them.

## When to Apply

- External systems may change
- Business rules are volatile
- Multiple implementations needed
- Technology choices may evolve

## Key Indicators

### Variation Points

| Category   | Examples                          |
| ---------- | --------------------------------- |
| External   | APIs, databases, payment gateways |
| Business   | Tax rules, pricing, discounts     |
| Technology | Storage, messaging, caching       |
| Platform   | OS, frameworks, libraries         |

### Protection Mechanisms

| Mechanism | Use Case                    |
| --------- | --------------------------- |
| Interface | Hide implementation details |
| Adapter   | Isolate external systems    |
| Factory   | Hide creation complexity    |
| Strategy  | Encapsulate algorithms      |
| Decorator | Add behavior transparently  |

## Patterns

### Interface Abstraction

```typescript
// Variation: Tax calculation rules change frequently
interface TaxCalculator {
  calculate(order: Order): TaxResult;
}

// Current implementation
@Injectable()
class DefaultTaxCalculator implements TaxCalculator {
  calculate(order: Order): TaxResult {
    const taxRate = this.getTaxRate(order.shippingAddress);
    const taxAmount = order.subtotal().multiply(taxRate);

    return new TaxResult(taxAmount, taxRate);
  }

  private getTaxRate(address: Address): number {
    switch (address.country.code) {
      case 'US':
        return 0.0825;
      case 'DE':
        return 0.19;
      case 'UK':
        return 0.2;
      default:
        return 0.0;
    }
  }
}

// New implementation (no changes to clients)
@Injectable()
class TaxServiceCalculator implements TaxCalculator {
  constructor(private readonly taxService: TaxServiceClient) {}

  async calculate(order: Order): Promise<TaxResult> {
    const response = await this.taxService.calculateTax(
      order.subtotal().cents,
      order.shippingAddress.toDto(),
    );

    return new TaxResult(Money.fromCents(response.taxAmount), response.taxRate);
  }
}
```

### External System Protection

```typescript
// Variation: Payment gateway may change (Stripe → Braintree)
interface PaymentGateway {
  charge(request: PaymentRequest): Promise<PaymentResult>;
  refund(id: TransactionId, amount: Money): Promise<RefundResult>;
  getTransaction(id: TransactionId): Promise<TransactionDetails>;
}

// Protected: Domain doesn't know about Stripe
@Injectable()
class StripeGateway implements PaymentGateway {
  constructor(private readonly stripe: Stripe) {}

  async charge(request: PaymentRequest): Promise<PaymentResult> {
    const charge = await this.stripe.charges.create({
      amount: request.amount.cents,
      currency: request.currency.code,
      source: request.token,
    });

    return new PaymentResult(
      new TransactionId(charge.id),
      charge.status === 'succeeded',
    );
  }

  // ...
}

// Swap to Braintree without domain changes
@Injectable()
class BraintreeGateway implements PaymentGateway {
  constructor(private readonly braintree: BraintreeGateway) {}

  async charge(request: PaymentRequest): Promise<PaymentResult> {
    const result = await this.braintree.transaction().sale({
      amount: request.amount.formatted(),
      paymentMethodNonce: request.token,
    });

    return new PaymentResult(
      new TransactionId(result.transaction.id),
      result.success,
    );
  }

  // ...
}
```

### Storage Variation Protection

```typescript
// Variation: Storage technology may change
interface FileStorage {
  store(path: string, content: Buffer): Promise<void>;
  retrieve(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

@Injectable()
class LocalFileStorage implements FileStorage {
  constructor(private readonly basePath: string) {}

  async store(path: string, content: Buffer): Promise<void> {
    await fs.writeFile(this.fullPath(path), content);
  }

  async retrieve(path: string): Promise<Buffer> {
    return fs.readFile(this.fullPath(path));
  }

  async delete(path: string): Promise<void> {
    await fs.unlink(this.fullPath(path));
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(this.fullPath(path));
      return true;
    } catch {
      return false;
    }
  }

  private fullPath(path: string): string {
    return `${this.basePath}/${path}`;
  }
}

@Injectable()
class S3FileStorage implements FileStorage {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
  ) {}

  async store(path: string, content: Buffer): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: path,
        Body: content,
      }),
    );
  }

  async retrieve(path: string): Promise<Buffer> {
    const result = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: path,
      }),
    );

    return Buffer.from(await result.Body!.transformToByteArray());
  }

  // ...
}
```

### Business Rule Protection

```typescript
// Variation: Discount rules change frequently
interface DiscountPolicy {
  calculate(order: Order): Discount;
}

@Injectable()
class PercentageDiscountPolicy implements DiscountPolicy {
  constructor(private readonly percentage: Percentage) {}

  calculate(order: Order): Discount {
    return new Discount(order.subtotal().multiply(this.percentage.value / 100));
  }
}

@Injectable()
class TieredDiscountPolicy implements DiscountPolicy {
  constructor(
    private readonly tiers: Array<{ threshold: number; percentage: number }>,
  ) {}

  calculate(order: Order): Discount {
    const subtotal = order.subtotal();
    let percentage = 0;

    for (const tier of this.tiers) {
      if (subtotal.cents >= tier.threshold) {
        percentage = tier.percentage;
      }
    }

    return new Discount(subtotal.multiply(percentage / 100));
  }
}

// Factory protects policy selection
@Injectable()
class DiscountPolicyFactory {
  constructor(private readonly config: ConfigService) {}

  create(customer: Customer): DiscountPolicy {
    if (customer.isPremium()) {
      return new PercentageDiscountPolicy(
        new Percentage(this.config.get('discount.premium')),
      );
    }

    return new TieredDiscountPolicy(this.config.get('discount.tiers'));
  }
}
```

### Configuration Protection

```typescript
// Variation: Configuration source may change
interface ConfigReader {
  get<T>(key: string, defaultValue?: T): T;
  has(key: string): boolean;
}

@Injectable()
class EnvConfigReader implements ConfigReader {
  get<T>(key: string, defaultValue?: T): T {
    return (process.env[key] ?? defaultValue) as T;
  }

  has(key: string): boolean {
    return key in process.env;
  }
}

@Injectable()
class VaultConfigReader implements ConfigReader {
  constructor(
    private readonly vault: VaultClient,
    private readonly path: string,
  ) {}

  async get<T>(key: string, defaultValue?: T): Promise<T> {
    try {
      const secret = await this.vault.read(this.path);
      return (secret.data[key] ?? defaultValue) as T;
    } catch {
      return defaultValue as T;
    }
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== undefined;
  }
}
```

### Data Format Protection

```typescript
// Variation: Data serialization format may change
interface Serializer {
  serialize(data: unknown): string | Buffer;
  deserialize<T>(data: string | Buffer, type: new (...args: unknown[]) => T): T;
}

@Injectable()
class JsonSerializer implements Serializer {
  serialize(data: unknown): string {
    return JSON.stringify(data);
  }

  deserialize<T>(data: string, type: new (...args: unknown[]) => T): T {
    return Object.assign(new type(), JSON.parse(data));
  }
}

@Injectable()
class MessagePackSerializer implements Serializer {
  serialize(data: unknown): Buffer {
    return encode(data) as Buffer;
  }

  deserialize<T>(data: Buffer, type: new (...args: unknown[]) => T): T {
    return Object.assign(new type(), decode(data));
  }
}
```

## DDD Application

### Bounded Context Protection

```typescript
// Variation: Other bounded contexts may change
// src/orders/infrastructure/ports/inventory.service.ts
interface InventoryService {
  checkAvailability(productId: ProductId, quantity: Quantity): Promise<boolean>;
  reserve(
    orderId: OrderId,
    productId: ProductId,
    quantity: Quantity,
  ): Promise<void>;
}

@Injectable()
class InventoryContextAdapter implements InventoryService {
  constructor(private readonly client: InventoryApiClient) {}

  async checkAvailability(
    productId: ProductId,
    quantity: Quantity,
  ): Promise<boolean> {
    const response = await this.client.getStock(productId.value);
    return response.available >= quantity.value;
  }

  async reserve(
    orderId: OrderId,
    productId: ProductId,
    quantity: Quantity,
  ): Promise<void> {
    await this.client.createReservation({
      orderId: orderId.value,
      productId: productId.value,
      quantity: quantity.value,
    });
  }
}
```

### Domain Event Protection

```typescript
// Variation: Event handlers may change
interface EventDispatcher {
  dispatch(...events: DomainEvent[]): void;
}

// Sync implementation
@Injectable()
class SyncEventDispatcher implements EventDispatcher {
  dispatch(...events: DomainEvent[]): void {
    /* ... */
  }
}

// Async implementation
@Injectable()
class AsyncEventDispatcher implements EventDispatcher {
  constructor(private readonly messageBus: ClientProxy) {}

  dispatch(...events: DomainEvent[]): void {
    for (const event of events) {
      this.messageBus.emit(event.constructor.name, event);
    }
  }
}

// Domain is protected from dispatch mechanism
@Injectable()
class OrderService {
  constructor(
    private readonly events: EventDispatcher, // Protected from variation
  ) {}
}
```

## Metrics

| Metric                      | Good      | Warning   | Critical   |
| --------------------------- | --------- | --------- | ---------- |
| Variation points identified | All       | Most      | Few        |
| Interface stability         | High      | Medium    | Low        |
| External dependencies       | Wrapped   | Partially | Direct     |
| Change impact               | Localized | Moderate  | Widespread |
