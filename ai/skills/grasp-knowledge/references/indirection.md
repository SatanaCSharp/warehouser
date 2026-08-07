# Indirection Pattern

## Definition

Assign responsibility to an intermediate object to mediate between other components or services so that they are not directly coupled.

## When to Apply

- Need to decouple two components
- External system integration
- Avoid direct dependency on volatile classes
- Enable substitution of implementations

## Key Indicators

### When to Use

| Situation         | Indirection      |
| ----------------- | ---------------- |
| External API      | Adapter          |
| Event handling    | Event Dispatcher |
| Multiple handlers | Mediator         |
| Configuration     | Service Factory  |
| Caching           | Cache Decorator  |

### Benefits

- Reduces direct coupling
- Enables substitution
- Improves testability
- Isolates change impact

## Patterns

### Adapter

```typescript
// Indirection: Adapter isolates external system
interface PaymentGateway {
  charge(request: PaymentRequest): Promise<PaymentResult>;
  refund(id: TransactionId): Promise<RefundResult>;
}

// Adapter provides indirection to Stripe
@Injectable()
class StripeAdapter implements PaymentGateway {
  constructor(private readonly stripe: Stripe) {}

  async charge(request: PaymentRequest): Promise<PaymentResult> {
    const charge = await this.stripe.charges.create({
      amount: request.amount.cents,
      currency: request.currency.code,
      source: request.token,
      metadata: {
        order_id: request.orderId.value,
      },
    });

    return new PaymentResult(
      new TransactionId(charge.id),
      charge.status === 'succeeded',
      charge.failure_message ?? undefined,
    );
  }

  async refund(id: TransactionId): Promise<RefundResult> {
    const refund = await this.stripe.refunds.create({
      charge: id.value,
    });

    return new RefundResult(
      refund.status === 'succeeded',
      refund.failure_reason ?? undefined,
    );
  }
}

// Application depends on interface, not Stripe
@Injectable()
class ProcessPaymentHandler {
  constructor(
    private readonly gateway: PaymentGateway, // Indirection
  ) {}

  async execute(command: ProcessPaymentCommand): Promise<PaymentResult> {
    return this.gateway.charge(command.toRequest());
  }
}
```

### Mediator (Command Bus)

```typescript
// Indirection: Mediator coordinates components
interface CommandBus {
  dispatch<T>(command: Command): Promise<T>;
}

@Injectable()
class SyncCommandBus implements CommandBus {
  private handlers = new Map<string, (command: Command) => Promise<unknown>>();

  register<T extends Command>(
    commandClass: new (...args: unknown[]) => T,
    handler: (command: T) => Promise<unknown>,
  ): void {
    this.handlers.set(
      commandClass.name,
      handler as (c: Command) => Promise<unknown>,
    );
  }

  async dispatch<T>(command: Command): Promise<T> {
    const commandName = command.constructor.name;
    const handler = this.handlers.get(commandName);

    if (!handler) {
      throw new NoHandlerException(commandName);
    }

    return handler(command) as Promise<T>;
  }
}

// Components don't know each other - mediated
@Controller('orders')
class OrderController {
  constructor(
    private readonly commandBus: CommandBus, // Indirection
  ) {}

  @Post()
  async create(@Body() dto: CreateOrderDto): Promise<{ id: string }> {
    const orderId = await this.commandBus.dispatch<OrderId>(
      new CreateOrderCommand(dto.customerId, dto.items),
    );

    return { id: orderId.value };
  }
}
```

### Event Dispatcher

```typescript
// Indirection: Event dispatcher decouples publishers from subscribers
interface EventDispatcher {
  dispatch(...events: DomainEvent[]): void;
}

@Injectable()
class AsyncEventDispatcher implements EventDispatcher {
  constructor(private readonly messageBus: ClientProxy) {}

  dispatch(...events: DomainEvent[]): void {
    for (const event of events) {
      this.messageBus.emit(event.constructor.name, event);
    }
  }
}

// Publisher doesn't know subscribers
@Injectable()
class PlaceOrderHandler {
  constructor(
    private readonly orders: OrderRepository,
    private readonly events: EventDispatcher, // Indirection
  ) {}

  async execute(command: PlaceOrderCommand): Promise<OrderId> {
    const order = Order.place(/* ... */);
    await this.orders.save(order);
    this.events.dispatch(...order.releaseEvents());

    return order.id;
  }
}

// Subscriber doesn't know publisher
@Injectable()
class SendOrderConfirmationOnOrderPlaced {
  constructor(
    private readonly orders: OrderReader,
    private readonly mailer: Mailer,
  ) {}

  @OnEvent(OrderPlaced.name)
  async handle(event: OrderPlaced): Promise<void> {
    const order = await this.orders.get(event.orderId);
    await this.mailer.send(new OrderConfirmation(order));
  }
}
```

### Anti-Corruption Layer

```typescript
// Indirection: ACL protects domain from external models
interface LegacyOrderAdapter {
  import(legacyId: string): Promise<Order>;
  export(order: Order): Promise<void>;
}

@Injectable()
class LegacyErpAdapter implements LegacyOrderAdapter {
  constructor(
    private readonly erp: ErpClient,
    private readonly translator: OrderTranslator,
  ) {}

  async import(legacyId: string): Promise<Order> {
    const legacyOrder = await this.erp.getOrder(legacyId);
    return this.translator.toDomain(legacyOrder);
  }

  async export(order: Order): Promise<void> {
    const legacyData = this.translator.toLegacy(order);
    await this.erp.createOrder(legacyData);
  }
}

@Injectable()
class OrderTranslator {
  toDomain(legacy: LegacyOrder): Order {
    return new Order(
      new OrderId(legacy.ORDER_NUMBER),
      new CustomerId(legacy.CUST_ID),
      this.translateLines(legacy.LINES),
      this.translateStatus(legacy.STATUS_CODE),
    );
  }

  toLegacy(order: Order): LegacyOrder {
    return {
      ORDER_NUMBER: order.id.value,
      CUST_ID: order.customerId.value,
      LINES: this.translateLinesToLegacy(order.lines),
      STATUS_CODE: this.translateStatusToLegacy(order.status),
    };
  }
}
```

### Decorator (Transparent Indirection)

```typescript
// Indirection: Decorator adds behavior transparently
interface Cache {
  get(key: string): unknown;
  set(key: string, value: unknown, ttl?: number): void;
}

class LoggingCache implements Cache {
  constructor(
    private readonly inner: Cache,
    private readonly logger: Logger,
  ) {}

  get(key: string): unknown {
    this.logger.debug('Cache get', { key });
    const value = this.inner.get(key);
    this.logger.debug('Cache result', { key, hit: value !== null });
    return value;
  }

  set(key: string, value: unknown, ttl = 3600): void {
    this.logger.debug('Cache set', { key, ttl });
    this.inner.set(key, value, ttl);
  }
}

// Stack decorators
const cache = new LoggingCache(
  new MetricsCache(new RedisCache(redis), metrics),
  logger,
);
```

### Facade

```typescript
// Indirection: Facade simplifies subsystem access
interface OrderingFacade {
  placeOrder(request: PlaceOrderRequest): Promise<OrderId>;
  cancelOrder(id: OrderId): Promise<void>;
  getOrderStatus(id: OrderId): Promise<OrderStatusDto>;
}

@Injectable()
class DefaultOrderingFacade implements OrderingFacade {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  async placeOrder(request: PlaceOrderRequest): Promise<OrderId> {
    return this.commandBus.dispatch(
      new PlaceOrderCommand(request.customerId, request.items),
    );
  }

  async cancelOrder(id: OrderId): Promise<void> {
    await this.commandBus.dispatch(new CancelOrderCommand(id));
  }

  async getOrderStatus(id: OrderId): Promise<OrderStatusDto> {
    return this.queryBus.execute(new GetOrderStatusQuery(id));
  }
}
```

## DDD Application

### Ports and Adapters

```typescript
// Port (Domain interface)
// src/domain/ports/notification.service.ts
interface NotificationService {
  notify(customerId: CustomerId, notification: Notification): Promise<void>;
}

// Adapter (Infrastructure implementation)
// src/infrastructure/adapters/email-notification.adapter.ts
@Injectable()
class EmailNotificationAdapter implements NotificationService {
  constructor(
    private readonly mailer: Mailer,
    private readonly customers: CustomerReader,
  ) {}

  async notify(
    customerId: CustomerId,
    notification: Notification,
  ): Promise<void> {
    const customer = await this.customers.get(customerId);

    await this.mailer.send(
      customer.email,
      notification.subject,
      notification.body,
    );
  }
}

// Domain service uses port (indirection)
@Injectable()
class OrderService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly notifications: NotificationService, // Port
  ) {}

  async complete(id: OrderId): Promise<void> {
    const order = await this.orders.get(id);
    order.complete();
    await this.orders.save(order);

    await this.notifications.notify(
      order.customerId,
      new OrderCompletedNotification(order),
    );
  }
}
```

## Anti-patterns

### Over-Indirection

```typescript
// ANTIPATTERN: Too many layers of indirection
const result = await controller.handle(
  request.validate(
    validator.createFrom(
      factory.createValidator(config.get('validation.order')),
    ),
  ),
);

// FIX: Reduce unnecessary layers
const result = await controller.handle(request);
```

## Metrics

| Metric             | Good    | Warning | Critical |
| ------------------ | ------- | ------- | -------- |
| Indirection layers | 1-2     | 3       | >3       |
| Adapter complexity | <50 LOC | 50-100  | >100     |
| Interface methods  | ≤5      | 6-8     | >8       |
