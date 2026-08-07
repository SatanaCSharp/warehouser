# Creator Pattern

## Definition

Assign class B the responsibility to create instances of class A if one of these is true:

1. B contains or compositely aggregates A
2. B records A
3. B closely uses A
4. B has the initializing data for A

## When to Apply

- Deciding where to instantiate objects
- Complex object creation logic
- Aggregate root creating child entities

## Key Indicators

### Violation Signs

| Indicator         | Detection                  | Severity |
| ----------------- | -------------------------- | -------- |
| Random creation   | `new` in unexpected places | WARNING  |
| No ownership      | Objects created everywhere | WARNING  |
| Missing factories | Complex creation inline    | INFO     |

### Compliance Signs

- Container creates contained objects
- Factories for complex creation
- Aggregates create their entities

## Patterns

### Aggregate Creates Children

```typescript
// Order contains OrderLines, so Order creates them
class Order {
  private readonly id: OrderId;
  private lines: OrderLine[] = [];
  private events: DomainEvent[] = [];

  addLine(product: Product, quantity: Quantity): void {
    // Order creates OrderLine (contains it)
    const line = new OrderLine(
      OrderLineId.generate(),
      product.id,
      product.name,
      product.price,
      quantity,
    );

    this.lines.push(line);
    this.events.push(new OrderLineAdded(this.id, line.id));
  }

  removeLine(lineId: OrderLineId): void {
    this.lines = this.lines.filter((line) => !line.id.equals(lineId));
    this.events.push(new OrderLineRemoved(this.id, lineId));
  }
}
```

### Factory for Complex Creation

```typescript
// When creation is complex, use Factory
@Injectable()
class OrderFactory {
  constructor(
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly customers: CustomerRepository,
    private readonly products: ProductRepository,
  ) {}

  async createFromCart(customerId: CustomerId, cart: Cart): Promise<Order> {
    const customer = await this.customers.get(customerId);

    const order = new Order(
      this.idGenerator.generate(),
      customer.id,
      customer.shippingAddress,
      this.clock.now(),
    );

    for (const item of cart.items()) {
      const product = await this.products.get(item.productId);
      order.addLine(product, item.quantity);
    }

    return order;
  }

  async createFromCommand(command: CreateOrderCommand): Promise<Order> {
    const order = new Order(
      this.idGenerator.generate(),
      command.customerId,
      Address.fromDto(command.shippingAddress),
      this.clock.now(),
    );

    for (const item of command.items) {
      const product = await this.products.get(new ProductId(item.productId));
      order.addLine(product, new Quantity(item.quantity));
    }

    return order;
  }
}
```

### Builder for Step-by-Step Creation

```typescript
class OrderBuilder {
  private customerId: CustomerId | null = null;
  private shippingAddress: Address | null = null;
  private lines: Array<{ product: Product; quantity: Quantity }> = [];
  private discount: Discount | null = null;

  forCustomer(customerId: CustomerId): this {
    this.customerId = customerId;
    return this;
  }

  shippingTo(address: Address): this {
    this.shippingAddress = address;
    return this;
  }

  withLine(product: Product, quantity: Quantity): this {
    this.lines.push({ product, quantity });
    return this;
  }

  withDiscount(discount: Discount): this {
    this.discount = discount;
    return this;
  }

  build(): Order {
    this.validate();

    const order = new Order(
      OrderId.generate(),
      this.customerId!,
      this.shippingAddress!,
    );

    for (const line of this.lines) {
      order.addLine(line.product, line.quantity);
    }

    if (this.discount !== null) {
      order.applyDiscount(this.discount);
    }

    return order;
  }

  private validate(): void {
    if (this.customerId === null) {
      throw new Error('Customer is required');
    }
    if (this.shippingAddress === null) {
      throw new Error('Shipping address is required');
    }
    if (this.lines.length === 0) {
      throw new Error('At least one line is required');
    }
  }
}

// Usage
const order = new OrderBuilder()
  .forCustomer(customerId)
  .shippingTo(address)
  .withLine(product1, new Quantity(2))
  .withLine(product2, new Quantity(1))
  .withDiscount(Discount.percentage(10))
  .build();
```

### Static Factory Methods

```typescript
// Value Object with factory methods
class Money {
  private constructor(
    public readonly cents: number,
    public readonly currency: Currency,
  ) {}

  static zero(currency?: Currency): Money {
    return new Money(0, currency ?? Currency.USD);
  }

  static fromCents(cents: number, currency?: Currency): Money {
    return new Money(cents, currency ?? Currency.USD);
  }

  static fromDecimal(amount: number, currency?: Currency): Money {
    return new Money(Math.round(amount * 100), currency ?? Currency.USD);
  }
}

// Entity with factory method for creation
class User {
  private constructor(
    private readonly id: UserId,
    private readonly email: Email,
    private readonly password: Password,
    private status: UserStatus,
    private readonly createdAt: Date,
  ) {}

  static register(
    id: UserId,
    email: Email,
    password: Password,
    now: Date,
  ): User {
    return new User(id, email, password, UserStatus.Pending, now);
  }
}
```

## DDD Application

### Repository Provides Next Identity

```typescript
interface OrderRepository {
  nextIdentity(): OrderId;
  save(order: Order): Promise<void>;
  find(id: OrderId): Promise<Order | null>;
}

@Injectable()
class TypeOrmOrderRepository implements OrderRepository {
  nextIdentity(): OrderId {
    return new OrderId(randomUUID());
  }

  // ...
}
```

### Aggregate Creates Domain Events

```typescript
class Order {
  private events: DomainEvent[] = [];

  static place(id: OrderId, customerId: CustomerId, items: OrderItem[]): Order {
    const order = new Order(id, customerId);

    for (const item of items) {
      order.addLine(item.product, item.quantity);
    }

    // Order creates its own events
    order.events.push(new OrderPlaced(id, customerId));

    return order;
  }

  releaseEvents(): DomainEvent[] {
    const events = [...this.events];
    this.events = [];
    return events;
  }
}
```

## Anti-patterns

### Random Creation

```typescript
// ANTIPATTERN: Creating in unexpected places
@Injectable()
class EmailService {
  sendOrderConfirmation(orderData: OrderData): void {
    // EmailService shouldn't create Orders!
    const order = new Order(orderData.id, orderData.customerId);
    // ...
  }
}
```

### Service Locator for Creation

```typescript
// ANTIPATTERN: Using container for object creation
@Injectable()
class OrderHandler {
  handle(data: object): Order {
    // Don't resolve factory from container at runtime
    return this.moduleRef.get(OrderFactory).create(data);
  }
}

// FIX: Inject factory directly
@Injectable()
class OrderHandler {
  constructor(private readonly factory: OrderFactory) {}

  handle(data: object): Order {
    return this.factory.create(data);
  }
}
```

## Metrics

| Metric             | Good          | Warning | Critical |
| ------------------ | ------------- | ------- | -------- |
| Creation locations | 1-2 per class | 3-4     | >4       |
| Factory complexity | <50 LOC       | 50-100  | >100     |
| Builder steps      | ≤7            | 8-10    | >10      |
