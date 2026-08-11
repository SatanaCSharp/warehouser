# Polymorphism Pattern

## Definition

When related alternatives or behaviors vary by type, assign responsibility for the behavior to the types using polymorphic operations instead of conditionals.

## When to Apply

- Multiple types require different behavior
- Type-based conditionals (switch/if-else)
- Behavior varies by classification
- Need to add new types without modification

## Key Indicators

### Violation Signs

| Indicator                  | Detection           | Severity |
| -------------------------- | ------------------- | -------- |
| Type switch                | `switch(type)`      | CRITICAL |
| instanceof chains          | `if instanceof`     | CRITICAL |
| Type-based conditionals    | `if (type === 'X')` | WARNING  |
| Parallel class hierarchies | Similar switches    | WARNING  |

### Compliance Signs

- No type checking conditionals
- Common interface for variants
- New types don't require modification
- Strategy/Plugin architecture

## Patterns

### Replace Type Switch

```typescript
// BEFORE: Type-based conditional
@Injectable()
class NotificationService {
  send(notification: Notification): void {
    switch (notification.type) {
      case 'email':
        this.sendEmail(notification);
        break;
      case 'sms':
        this.sendSms(notification);
        break;
      case 'push':
        this.sendPush(notification);
        break;
      case 'slack':
        this.sendSlack(notification);
        break;
      // Must modify for new types
    }
  }

  private sendEmail(n: Notification): void {
    /* ... */
  }
  private sendSms(n: Notification): void {
    /* ... */
  }
  private sendPush(n: Notification): void {
    /* ... */
  }
  private sendSlack(n: Notification): void {
    /* ... */
  }
}

// AFTER: Polymorphic behavior
interface NotificationChannel {
  supports(notification: Notification): boolean;
  send(notification: Notification): Promise<void>;
}

@Injectable()
class EmailChannel implements NotificationChannel {
  constructor(private readonly mailer: Mailer) {}

  supports(notification: Notification): boolean {
    return notification.channel === 'email';
  }

  async send(notification: Notification): Promise<void> {
    await this.mailer.send(
      notification.recipient.email,
      notification.subject,
      notification.body,
    );
  }
}

@Injectable()
class SmsChannel implements NotificationChannel {
  constructor(private readonly gateway: SmsGateway) {}

  supports(notification: Notification): boolean {
    return notification.channel === 'sms';
  }

  async send(notification: Notification): Promise<void> {
    await this.gateway.send(notification.recipient.phone, notification.body);
  }
}

@Injectable()
class NotificationService {
  constructor(
    @InjectAll(NOTIFICATION_CHANNEL)
    private readonly channels: NotificationChannel[],
  ) {}

  async send(notification: Notification): Promise<void> {
    const channel = this.channels.find((c) => c.supports(notification));

    if (!channel) {
      throw new UnsupportedChannelException(notification.channel);
    }

    await channel.send(notification);
  }
}
```

### Strategy Pattern

```typescript
// Polymorphic strategies for algorithms
interface DiscountStrategy {
  calculate(order: Order): Money;
}

class PercentageDiscount implements DiscountStrategy {
  constructor(private readonly percentage: Percentage) {}

  calculate(order: Order): Money {
    return order.subtotal().multiply(this.percentage.value / 100);
  }
}

class FixedAmountDiscount implements DiscountStrategy {
  constructor(private readonly amount: Money) {}

  calculate(order: Order): Money {
    const subtotal = order.subtotal();
    return this.amount.isGreaterThan(subtotal) ? subtotal : this.amount;
  }
}

class BuyOneGetOneDiscount implements DiscountStrategy {
  calculate(order: Order): Money {
    const eligibleItems = order.eligibleForBogo();
    return eligibleItems.reduce((discount, item) => {
      const freeItems = Math.floor(item.quantity.value / 2);
      return discount.add(item.price.multiply(freeItems));
    }, Money.zero());
  }
}

// Context uses strategy polymorphically
@Injectable()
class PricingService {
  calculateTotal(order: Order, discount: DiscountStrategy | null): Money {
    const subtotal = order.subtotal();

    if (discount === null) {
      return subtotal;
    }

    return subtotal.subtract(discount.calculate(order));
  }
}
```

### State Pattern

```typescript
// Polymorphic state behavior
interface OrderState {
  canAddItems(): boolean;
  canPay(): boolean;
  canShip(): boolean;
  canCancel(): boolean;
}

class DraftState implements OrderState {
  canAddItems(): boolean {
    return true;
  }
  canPay(): boolean {
    return true;
  }
  canShip(): boolean {
    return false;
  }
  canCancel(): boolean {
    return true;
  }
}

class PaidState implements OrderState {
  canAddItems(): boolean {
    return false;
  }
  canPay(): boolean {
    return false;
  }
  canShip(): boolean {
    return true;
  }
  canCancel(): boolean {
    return true;
  }
}

class ShippedState implements OrderState {
  canAddItems(): boolean {
    return false;
  }
  canPay(): boolean {
    return false;
  }
  canShip(): boolean {
    return false;
  }
  canCancel(): boolean {
    return false;
  }
}

class Order {
  private state: OrderState = new DraftState();

  addLine(line: OrderLine): void {
    if (!this.state.canAddItems()) {
      throw new CannotModifyOrderException();
    }
    this.lines.push(line);
  }

  pay(payment: PaymentDetails): void {
    if (!this.state.canPay()) {
      throw new CannotPayOrderException();
    }
    this.processPayment(payment);
    this.state = new PaidState();
  }

  ship(): void {
    if (!this.state.canShip()) {
      throw new CannotShipOrderException();
    }
    this.state = new ShippedState();
  }
}
```

### Plugin Architecture

```typescript
// Extensible plugin system
interface PaymentGateway {
  getName(): string;
  isAvailable(): boolean;
  charge(request: PaymentRequest): Promise<PaymentResult>;
  refund(id: TransactionId, amount: Money): Promise<RefundResult>;
}

@Injectable()
class StripeGateway implements PaymentGateway {
  getName(): string {
    return 'stripe';
  }
  isAvailable(): boolean {
    return true;
  }
  async charge(request: PaymentRequest): Promise<PaymentResult> {
    /* ... */ return null!;
  }
  async refund(id: TransactionId, amount: Money): Promise<RefundResult> {
    /* ... */ return null!;
  }
}

@Injectable()
class PayPalGateway implements PaymentGateway {
  getName(): string {
    return 'paypal';
  }
  isAvailable(): boolean {
    return true;
  }
  async charge(request: PaymentRequest): Promise<PaymentResult> {
    /* ... */ return null!;
  }
  async refund(id: TransactionId, amount: Money): Promise<RefundResult> {
    /* ... */ return null!;
  }
}

// Registry for polymorphic access
@Injectable()
class PaymentGatewayRegistry {
  private gateways = new Map<string, PaymentGateway>();

  register(gateway: PaymentGateway): void {
    this.gateways.set(gateway.getName(), gateway);
  }

  get(name: string): PaymentGateway {
    const gateway = this.gateways.get(name);

    if (!gateway) {
      throw new UnknownGatewayException(name);
    }

    return gateway;
  }

  available(): PaymentGateway[] {
    return [...this.gateways.values()].filter((g) => g.isAvailable());
  }
}
```

### Visitor Pattern

```typescript
// Double dispatch for type-specific operations
interface DocumentVisitor<T = unknown> {
  visitPdf(doc: PdfDocument): T;
  visitWord(doc: WordDocument): T;
  visitExcel(doc: ExcelDocument): T;
}

interface Document {
  accept<T>(visitor: DocumentVisitor<T>): T;
}

class PdfDocument implements Document {
  accept<T>(visitor: DocumentVisitor<T>): T {
    return visitor.visitPdf(this);
  }
}

class WordDocument implements Document {
  accept<T>(visitor: DocumentVisitor<T>): T {
    return visitor.visitWord(this);
  }
}

// Different operations as visitors
class ExportVisitor implements DocumentVisitor<string> {
  visitPdf(doc: PdfDocument): string {
    return this.pdfExporter.export(doc);
  }

  visitWord(doc: WordDocument): string {
    return this.wordExporter.export(doc);
  }

  visitExcel(doc: ExcelDocument): string {
    return this.excelExporter.export(doc);
  }
}
```

## DDD Application

### Value Object Polymorphism

```typescript
// Different address types with common behavior
interface Address {
  formatted(): string;
  country(): Country;
}

class UsAddress implements Address {
  constructor(
    private readonly street: string,
    private readonly city: string,
    private readonly state: UsState,
    private readonly zipCode: ZipCode,
  ) {}

  formatted(): string {
    return `${this.street}\n${this.city}, ${this.state.code} ${this.zipCode.value}`;
  }

  country(): Country {
    return Country.US;
  }
}

class UkAddress implements Address {
  constructor(
    private readonly street: string,
    private readonly city: string,
    private readonly county: string,
    private readonly postCode: PostCode,
  ) {}

  formatted(): string {
    return `${this.street}\n${this.city}\n${this.county}\n${this.postCode.value}`;
  }

  country(): Country {
    return Country.UK;
  }
}
```

## Metrics

| Metric                   | Good       | Warning     | Critical     |
| ------------------------ | ---------- | ----------- | ------------ |
| Type switches            | 0          | 1-2         | >2           |
| instanceof checks        | 0          | 1-3         | >3           |
| Strategy implementations | Many       | Few         | None         |
| Adding new type          | No changes | Few changes | Many changes |
