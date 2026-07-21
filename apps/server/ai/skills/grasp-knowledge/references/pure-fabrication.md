# Pure Fabrication Pattern

## Definition

Assign a highly cohesive set of responsibilities to an artificial or convenience class that does not represent a domain concept — a fabrication of the imagination.

## When to Apply

- Information Expert would result in poor cohesion or coupling
- Need infrastructure services (persistence, logging)
- Cross-cutting concerns don't fit domain objects
- Reusability requires non-domain abstraction

## Key Indicators

### When to Use

| Situation      | Example                   |
| -------------- | ------------------------- |
| Persistence    | Repository, Data Mapper   |
| Infrastructure | Event Dispatcher, Logger  |
| Calculations   | Specification, Calculator |
| Creation       | Factory, Builder          |
| Cross-cutting  | Policy, Validator         |

### Common Pure Fabrications in DDD

| Pattern          | Purpose                           |
| ---------------- | --------------------------------- |
| Repository       | Aggregate persistence abstraction |
| Factory          | Complex object creation           |
| Domain Service   | Cross-entity business logic       |
| Specification    | Reusable business rules           |
| Event Dispatcher | Domain event distribution         |
| Query Handler    | Read model construction           |

## Patterns

### Repository

```typescript
// Pure Fabrication: Not a domain concept
interface OrderRepository {
  nextIdentity(): OrderId;
  find(id: OrderId): Promise<Order | null>;
  get(id: OrderId): Promise<Order>;
  save(order: Order): Promise<void>;
  remove(order: Order): Promise<void>;
}

@Injectable()
class TypeOrmOrderRepository implements OrderRepository {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly repo: Repository<OrderEntity>,
    private readonly idGenerator: IdGenerator,
    private readonly mapper: OrderMapper,
  ) {}

  nextIdentity(): OrderId {
    return new OrderId(this.idGenerator.generate());
  }

  async find(id: OrderId): Promise<Order | null> {
    const entity = await this.repo.findOne({ where: { id: id.value } });
    return entity ? this.mapper.toDomain(entity) : null;
  }

  async get(id: OrderId): Promise<Order> {
    const order = await this.find(id);
    if (!order) throw new OrderNotFoundException(id);
    return order;
  }

  async save(order: Order): Promise<void> {
    const entity = this.mapper.toEntity(order);
    await this.repo.save(entity);
  }

  async remove(order: Order): Promise<void> {
    await this.repo.delete(order.id.value);
  }
}
```

### Factory

```typescript
// Pure Fabrication: Encapsulates complex creation
interface OrderFactory {
  createFromCart(customerId: CustomerId, cart: Cart): Promise<Order>;
  createFromCommand(command: CreateOrderCommand): Promise<Order>;
}

@Injectable()
class DefaultOrderFactory implements OrderFactory {
  constructor(
    private readonly repository: OrderRepository,
    private readonly products: ProductReader,
    private readonly clock: Clock,
  ) {}

  async createFromCart(customerId: CustomerId, cart: Cart): Promise<Order> {
    const order = new Order(
      this.repository.nextIdentity(),
      customerId,
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
      this.repository.nextIdentity(),
      command.customerId,
      this.clock.now(),
    );

    for (const item of command.items) {
      const product = await this.products.get(item.productId);
      order.addLine(product, item.quantity);
    }

    return order;
  }
}
```

### Specification

```typescript
// Pure Fabrication: Reusable business rule
interface Specification<T> {
  isSatisfiedBy(candidate: T): boolean;
}

abstract class CompositeSpecification<T> implements Specification<T> {
  abstract isSatisfiedBy(candidate: T): boolean;

  and(other: Specification<T>): Specification<T> {
    return new AndSpecification(this, other);
  }

  or(other: Specification<T>): Specification<T> {
    return new OrSpecification(this, other);
  }

  not(): Specification<T> {
    return new NotSpecification(this);
  }
}

class EligibleForFreeShippingSpecification extends CompositeSpecification<Order> {
  constructor(private readonly minimumOrderValue: Money) {
    super();
  }

  isSatisfiedBy(candidate: Order): boolean {
    return candidate.total().isGreaterThanOrEqual(this.minimumOrderValue);
  }
}

class PremiumCustomerSpecification extends CompositeSpecification<Customer> {
  isSatisfiedBy(candidate: Customer): boolean {
    return (
      candidate.tier === CustomerTier.Premium ||
      candidate.tier === CustomerTier.Vip
    );
  }
}

// Usage
const freeShipping = new EligibleForFreeShippingSpecification(
  Money.fromCents(5000),
);
const premiumCustomer = new PremiumCustomerSpecification();

const eligibleForDiscount = freeShipping.and(premiumCustomer);
```

### Domain Service

```typescript
// Pure Fabrication: Logic that doesn't belong to a single entity
interface MoneyTransferService {
  transfer(from: Account, to: Account, amount: Money): Promise<void>;
}

@Injectable()
class DefaultMoneyTransferService implements MoneyTransferService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly clock: Clock,
  ) {}

  async transfer(from: Account, to: Account, amount: Money): Promise<void> {
    if (!from.canWithdraw(amount)) {
      throw new InsufficientFundsException(from.id, amount);
    }

    from.debit(amount);
    to.credit(amount);

    await this.transactions.save(
      new Transaction(
        this.transactions.nextIdentity(),
        from.id,
        to.id,
        amount,
        this.clock.now(),
      ),
    );
  }
}
```

### Event Dispatcher

```typescript
// Pure Fabrication: Infrastructure service
interface EventDispatcher {
  dispatch(...events: DomainEvent[]): void;
}

@Injectable()
class SyncEventDispatcher implements EventDispatcher {
  private listeners = new Map<string, Array<(event: DomainEvent) => void>>();

  subscribe(eventClass: string, listener: (event: DomainEvent) => void): void {
    const existing = this.listeners.get(eventClass) ?? [];
    this.listeners.set(eventClass, [...existing, listener]);
  }

  dispatch(...events: DomainEvent[]): void {
    for (const event of events) {
      const eventClass = event.constructor.name;
      const handlers = this.listeners.get(eventClass) ?? [];
      for (const handler of handlers) {
        handler(event);
      }
    }
  }
}
```

### Query Handler (Read Model / CQRS)

```typescript
// Pure Fabrication: CQRS read side
interface OrderSummaryQuery {
  execute(query: GetOrderSummaryQuery): Promise<OrderSummaryDto>;
}

@Injectable()
class OrderSummaryQueryHandler implements OrderSummaryQuery {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(query: GetOrderSummaryQuery): Promise<OrderSummaryDto> {
    const row = await this.dataSource.query(
      `SELECT o.id, o.customer_name, o.total, o.status,
              COUNT(ol.id) AS line_count
       FROM orders o
       LEFT JOIN order_lines ol ON ol.order_id = o.id
       WHERE o.id = $1
       GROUP BY o.id`,
      [query.orderId.value],
    );

    if (!row[0]) {
      throw new OrderNotFoundException(query.orderId);
    }

    return {
      id: row[0].id,
      customerName: row[0].customer_name,
      total: row[0].total,
      status: row[0].status,
      lineCount: Number(row[0].line_count),
    };
  }
}
```

### Policy

```typescript
// Pure Fabrication: Authorization/business rules
interface OrderCancellationPolicy {
  canCancel(order: Order, user: User): boolean;
}

@Injectable()
class DefaultOrderCancellationPolicy implements OrderCancellationPolicy {
  constructor(private readonly clock: Clock) {}

  canCancel(order: Order, user: User): boolean {
    // Admin can always cancel
    if (user.isAdmin()) {
      return true;
    }

    // Only owner can cancel
    if (!order.belongsTo(user.customerId)) {
      return false;
    }

    // Can't cancel shipped orders
    if (order.isShipped()) {
      return false;
    }

    // Can only cancel within 24 hours
    const now = this.clock.now();
    const hoursSincePlaced =
      (now.getTime() - order.placedAt.getTime()) / (1000 * 60 * 60);

    return hoursSincePlaced <= 24;
  }
}
```

## DDD Layer Placement

| Fabrication               | Layer                      | Purpose                        |
| ------------------------- | -------------------------- | ------------------------------ |
| Repository Interface      | Domain                     | Aggregate persistence contract |
| Repository Implementation | Infrastructure             | Actual persistence             |
| Factory                   | Domain or Application      | Object creation                |
| Specification             | Domain                     | Business rules                 |
| Domain Service            | Domain                     | Cross-entity logic             |
| Event Dispatcher          | Application/Infrastructure | Event distribution             |
| Query Handler             | Application                | Read model                     |
| Policy                    | Domain                     | Authorization rules            |

## Anti-patterns

### Overusing Pure Fabrication

```typescript
// ANTIPATTERN: Creating fabrication when Information Expert works
@Injectable()
class OrderTotalCalculator {
  calculate(order: Order): Money {
    // Order has all the data - should be Order.total()
    let total = Money.zero();
    for (const line of order.getLines()) {
      total = total.add(line.getPrice().multiply(line.getQuantity()));
    }
    return total;
  }
}

// FIX: Use Information Expert
class Order {
  total(): Money {
    return this.lines.reduce(
      (sum, line) => sum.add(line.total()),
      Money.zero(),
    );
  }
}
```

## Metrics

| Metric                      | Good     | Warning | Critical |
| --------------------------- | -------- | ------- | -------- |
| Fabrication per aggregate   | 1-3      | 4-5     | >5       |
| Fabrication complexity      | <100 LOC | 100-200 | >200     |
| Domain logic in fabrication | 0%       | <10%    | >10%     |
