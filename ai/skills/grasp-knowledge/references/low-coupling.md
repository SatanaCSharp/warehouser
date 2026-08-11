# Low Coupling Pattern

## Definition

Assign responsibilities so that coupling remains low. Coupling is a measure of how strongly one element is connected to, has knowledge of, or relies upon other elements.

## When to Apply

- Designing class interactions
- Choosing between design alternatives
- Reducing change impact

## Key Indicators

### Violation Signs

| Indicator             | Detection               | Severity |
| --------------------- | ----------------------- | -------- |
| Many dependencies     | >7 constructor args     | CRITICAL |
| Concrete type hints   | No interfaces           | WARNING  |
| Cascading changes     | One change affects many | WARNING  |
| Circular dependencies | A→B→A                   | CRITICAL |

### Compliance Signs

- Few dependencies (≤5)
- Interface-based design
- Changes are localized
- Easy to test in isolation

## Types of Coupling

| Type    | Description                   | Severity |
| ------- | ----------------------------- | -------- |
| Content | Access internal data directly | CRITICAL |
| Common  | Share global data             | CRITICAL |
| Control | Pass control flags            | WARNING  |
| Stamp   | Pass complex structures       | INFO     |
| Data    | Pass only needed data         | GOOD     |
| Message | Communicate via messages      | GOOD     |

## Patterns

### Interface-Based Coupling

```typescript
// HIGH COUPLING: Depends on concrete classes
@Injectable()
class OrderService {
  constructor(
    private readonly repository: TypeOrmOrderRepository,
    private readonly mailer: NodemailerMailer,
    private readonly payment: StripePaymentGateway,
    private readonly cache: RedisCache,
  ) {}
}

// LOW COUPLING: Depends on abstractions
@Injectable()
class OrderService {
  constructor(
    private readonly repository: OrderRepository,
    private readonly mailer: Mailer,
    private readonly payment: PaymentGateway,
    private readonly cache: Cache,
  ) {}
}

// Interfaces define contracts
interface OrderRepository {
  find(id: OrderId): Promise<Order | null>;
  save(order: Order): Promise<void>;
}

interface Mailer {
  send(email: Email): Promise<void>;
}

interface PaymentGateway {
  charge(request: PaymentRequest): Promise<PaymentResult>;
}
```

### Reduce Dependencies

```typescript
// HIGH COUPLING: Too many dependencies
@Injectable()
class OrderProcessor {
  constructor(
    private readonly orders: OrderRepository,
    private readonly customers: CustomerRepository,
    private readonly products: ProductRepository,
    private readonly inventory: InventoryService,
    private readonly pricing: PricingService,
    private readonly tax: TaxService,
    private readonly shipping: ShippingService,
    private readonly payment: PaymentGateway,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}
}

// LOW COUPLING: Split responsibilities
@Injectable()
class ProcessOrderHandler {
  constructor(
    private readonly orders: OrderRepository,
    private readonly pricing: OrderPricingService,
    private readonly payment: PaymentGateway,
  ) {}

  async execute(command: ProcessOrderCommand): Promise<ProcessResult> {
    const order = await this.orders.get(command.orderId);
    const total = this.pricing.calculate(order);
    const payment = await this.payment.charge(order.paymentMethod, total);

    order.markAsPaid(payment.transactionId);
    await this.orders.save(order);

    return new ProcessResult(order.id, payment);
  }
}

// Separate handler for notifications
@Injectable()
class SendOrderConfirmationHandler {
  constructor(
    private readonly orders: OrderRepository,
    private readonly notifications: NotificationService,
  ) {}

  @OnEvent(OrderPaid.name)
  async handle(event: OrderPaid): Promise<void> {
    const order = await this.orders.get(event.orderId);
    await this.notifications.send(new OrderConfirmation(order));
  }
}
```

### Event-Based Decoupling

```typescript
// HIGH COUPLING: Direct calls to multiple services
@Injectable()
class OrderService {
  async place(order: Order): Promise<void> {
    await this.orders.save(order);
    await this.inventory.reserve(order); // Coupled
    await this.mailer.sendConfirmation(order); // Coupled
    await this.analytics.track(order); // Coupled
  }
}

// LOW COUPLING: Event-based
@Injectable()
class PlaceOrderHandler {
  constructor(
    private readonly orders: OrderRepository,
    private readonly events: EventEmitter2,
  ) {}

  async execute(command: PlaceOrderCommand): Promise<OrderId> {
    const order = Order.place(
      await this.orders.nextIdentity(),
      command.customerId,
      command.items,
    );

    await this.orders.save(order);

    for (const event of order.releaseEvents()) {
      this.events.emit(event.constructor.name, event);
    }

    return order.id;
  }
}

// Decoupled listeners
@Injectable()
class ReserveInventoryOnOrderPlaced {
  @OnEvent(OrderPlaced.name)
  async handle(event: OrderPlaced): Promise<void> {
    // Handle inventory
  }
}

@Injectable()
class SendConfirmationOnOrderPlaced {
  @OnEvent(OrderPlaced.name)
  async handle(event: OrderPlaced): Promise<void> {
    // Send email
  }
}
```

### Facade for Subsystem

```typescript
// Multiple services needed for complex operation
interface ShippingFacade {
  calculateRate(shipment: Shipment): Promise<Money>;
  createLabel(shipment: Shipment): Promise<ShippingLabel>;
  trackPackage(number: TrackingNumber): Promise<TrackingInfo>;
}

@Injectable()
class ShippingFacadeImpl implements ShippingFacade {
  constructor(
    private readonly carriers: CarrierRegistry,
    private readonly calculator: RateCalculator,
    private readonly labelGenerator: LabelGenerator,
    private readonly tracking: TrackingService,
  ) {}

  async calculateRate(shipment: Shipment): Promise<Money> {
    const carrier = this.carriers.get(shipment.carrier);
    return this.calculator.calculate(carrier, shipment);
  }

  async createLabel(shipment: Shipment): Promise<ShippingLabel> {
    return this.labelGenerator.generate(shipment);
  }

  async trackPackage(number: TrackingNumber): Promise<TrackingInfo> {
    return this.tracking.track(number);
  }
}

// Client only depends on facade
@Injectable()
class ShipOrderHandler {
  constructor(
    private readonly orders: OrderRepository,
    private readonly shipping: ShippingFacade, // Single dependency
  ) {}

  async execute(command: ShipOrderCommand): Promise<void> {
    const order = await this.orders.get(command.orderId);
    const label = await this.shipping.createLabel(order.shipment);
    order.ship(label.trackingNumber);
    await this.orders.save(order);
  }
}
```

### Data Transfer Objects

```typescript
// HIGH COUPLING: Passing entire entity
interface ReportGenerator {
  generate(order: Order): Report;
  // Coupled to Order class structure
}

// LOW COUPLING: Pass only needed data
interface ReportGenerator {
  generate(data: ReportData): Report;
}

class ReportData {
  constructor(
    public readonly orderNumber: string,
    public readonly customerName: string,
    public readonly lineItems: LineItemDto[],
    public readonly total: Money,
  ) {}

  static fromOrder(order: Order): ReportData {
    return new ReportData(
      order.number.value,
      order.customer.fullName(),
      order.lines.map((line) => ({
        product: line.productName,
        quantity: line.quantity.value,
        price: line.price.formatted(),
      })),
      order.total(),
    );
  }
}
```

## DDD Application

### Bounded Context Isolation

```typescript
// Orders context shouldn't depend on Shipping internals
// src/orders/application/ports/shipping.adapter.ts
interface ShippingAdapter {
  calculateShipping(orderId: OrderId): Promise<Money>;
  requestShipment(orderId: OrderId): Promise<TrackingNumber>;
}

// Implementation in Infrastructure
// src/orders/infrastructure/shipping/shipping-context.adapter.ts
@Injectable()
class ShippingContextAdapter implements ShippingAdapter {
  constructor(private readonly client: ShippingApiClient) {}

  async calculateShipping(orderId: OrderId): Promise<Money> {
    const result = await this.client.getQuote(orderId.value);
    return Money.fromCents(result.amount, result.currency);
  }

  async requestShipment(orderId: OrderId): Promise<TrackingNumber> {
    const result = await this.client.createShipment(orderId.value);
    return new TrackingNumber(result.trackingNumber);
  }
}
```

### Anti-Corruption Layer

```typescript
// Protect domain from external system coupling
interface LegacyOrderAdapter {
  importOrder(legacyOrderId: string): Promise<Order>;
  exportOrder(order: Order): Promise<void>;
}

@Injectable()
class LegacyErpAdapter implements LegacyOrderAdapter {
  constructor(
    private readonly erp: ErpClient,
    private readonly translator: OrderTranslator,
  ) {}

  async importOrder(legacyOrderId: string): Promise<Order> {
    const legacyData = await this.erp.getOrder(legacyOrderId);
    return this.translator.toOrder(legacyData);
  }

  async exportOrder(order: Order): Promise<void> {
    const legacyData = this.translator.toLegacy(order);
    await this.erp.createOrder(legacyData);
  }
}
```

## Metrics

| Metric                   | Good    | Warning            | Critical     |
| ------------------------ | ------- | ------------------ | ------------ |
| Afferent coupling (Ca)   | ≤10     | 11-20              | >20          |
| Efferent coupling (Ce)   | ≤7      | 8-12               | >12          |
| Instability (Ce/(Ca+Ce)) | 0.3-0.7 | 0.1-0.3 or 0.7-0.9 | <0.1 or >0.9 |
| Circular dependencies    | 0       | 0                  | >0           |
