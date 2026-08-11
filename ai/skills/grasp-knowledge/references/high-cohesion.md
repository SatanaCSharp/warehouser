# High Cohesion Pattern

## Definition

Assign responsibilities so that cohesion remains high. Cohesion is a measure of how strongly related and focused the responsibilities of an element are.

## When to Apply

- Evaluating class responsibilities
- Deciding if a class should be split
- Organizing related functionality

## Key Indicators

### Violation Signs

| Indicator                 | Detection                      | Severity |
| ------------------------- | ------------------------------ | -------- |
| Unrelated methods         | Different domains in one class | CRITICAL |
| God class                 | >500 lines, many methods       | CRITICAL |
| Multiple responsibilities | Class name with "And/Or"       | WARNING  |
| Low method relationship   | Methods don't call each other  | WARNING  |

### Compliance Signs

- All methods relate to single purpose
- Class is easily named (noun)
- Methods call each other
- Fits in one screen (~200 lines)

## Types of Cohesion

| Type            | Description                    | Quality |
| --------------- | ------------------------------ | ------- |
| Coincidental    | Random grouping                | BAD     |
| Logical         | Grouped by type, not function  | BAD     |
| Temporal        | Grouped by when executed       | POOR    |
| Procedural      | Grouped by execution order     | POOR    |
| Communicational | Operate on same data           | GOOD    |
| Sequential      | Output of one is input of next | GOOD    |
| Functional      | All contribute to single task  | BEST    |

## Patterns

### Functional Cohesion

```typescript
// HIGH COHESION: All methods support single responsibility
class Order {
  private readonly id: OrderId;
  private readonly customerId: CustomerId;
  private lines: OrderLine[] = [];
  private status: OrderStatus;
  private placedAt: Date | null = null;

  // All methods relate to Order behavior
  addLine(product: Product, quantity: Quantity): void {
    this.ensureNotPlaced();
    this.lines.push(new OrderLine(product, quantity));
  }

  removeLine(lineId: OrderLineId): void {
    this.ensureNotPlaced();
    this.lines = this.lines.filter((line) => !line.id.equals(lineId));
  }

  place(): void {
    this.ensureHasLines();
    this.status = OrderStatus.Placed;
    this.placedAt = new Date();
  }

  total(): Money {
    return this.lines.reduce(
      (sum, line) => sum.add(line.total()),
      Money.zero(),
    );
  }

  private ensureNotPlaced(): void {
    if (this.status !== OrderStatus.Draft) {
      throw new OrderAlreadyPlacedException(this.id);
    }
  }

  private ensureHasLines(): void {
    if (this.lines.length === 0) {
      throw new EmptyOrderException(this.id);
    }
  }
}
```

### Extract Class for Cohesion

```typescript
// LOW COHESION: User class does too many things
class User {
  // Authentication
  login(): void {
    /* ... */
  }
  logout(): void {
    /* ... */
  }
  refreshToken(): void {
    /* ... */
  }

  // Profile
  updateName(): void {
    /* ... */
  }
  updateAvatar(): void {
    /* ... */
  }
  updatePreferences(): void {
    /* ... */
  }

  // Notifications
  enableEmailNotifications(): void {
    /* ... */
  }
  disablePushNotifications(): void {
    /* ... */
  }

  // Subscription
  subscribe(): void {
    /* ... */
  }
  cancelSubscription(): void {
    /* ... */
  }
  upgradeSubscription(): void {
    /* ... */
  }
}

// HIGH COHESION: Split into focused classes
class User {
  private readonly id: UserId;
  private readonly email: Email;
  private profile: UserProfile;
  private preferences: UserPreferences;
  private subscription: Subscription | null = null;

  updateProfile(data: ProfileData): void {
    this.profile = this.profile.update(data);
  }

  subscribe(plan: Plan): void {
    this.subscription = Subscription.create(this.id, plan);
  }
}

class UserProfile {
  constructor(
    private readonly firstName: string,
    private readonly lastName: string,
    private readonly avatar: Avatar | null,
  ) {}

  update(data: ProfileData): UserProfile {
    return new UserProfile(
      data.firstName ?? this.firstName,
      data.lastName ?? this.lastName,
      data.avatar ?? this.avatar,
    );
  }

  fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}

class UserPreferences {
  constructor(
    private readonly emailNotifications: boolean,
    private readonly pushNotifications: boolean,
    private readonly locale: string,
    private readonly timezone: string,
  ) {}

  withEmailNotifications(enabled: boolean): UserPreferences {
    return new UserPreferences(
      enabled,
      this.pushNotifications,
      this.locale,
      this.timezone,
    );
  }
}

class Subscription {
  static create(userId: UserId, plan: Plan): Subscription {
    /* ... */ return null!;
  }
  upgrade(newPlan: Plan): void {
    /* ... */
  }
  cancel(): void {
    /* ... */
  }
  renew(): void {
    /* ... */
  }
}
```

### Service with Single Purpose

```typescript
// LOW COHESION: Service does too many things
@Injectable()
class OrderService {
  createOrder(data: object): Promise<Order> {
    return null!;
  }
  processPayment(order: Order): Promise<void> {
    return null!;
  }
  sendConfirmation(order: Order): Promise<void> {
    return null!;
  }
  generateInvoice(order: Order): Promise<Invoice> {
    return null!;
  }
  updateInventory(order: Order): Promise<void> {
    return null!;
  }
  calculateShipping(order: Order): Promise<Money> {
    return null!;
  }
  applyDiscount(order: Order, coupon: Coupon): Promise<void> {
    return null!;
  }
}

// HIGH COHESION: Each service has single responsibility
@Injectable()
class CreateOrderHandler {
  async execute(command: CreateOrderCommand): Promise<Order> {
    return null!;
  }
}

@Injectable()
class ProcessPaymentHandler {
  async execute(command: ProcessPaymentCommand): Promise<void> {}
}

@Injectable()
class OrderPricingService {
  calculateTotal(order: Order): Money {
    return null!;
  }
  applyDiscount(order: Order, discount: Discount): Money {
    return null!;
  }
}

@Injectable()
class ShippingCalculator {
  calculate(shipment: Shipment): Money {
    return null!;
  }
}

@Injectable()
class InvoiceGenerator {
  generate(order: Order): Invoice {
    return null!;
  }
}
```

### Value Object Cohesion

```typescript
// HIGH COHESION: Value object with related operations
class Money {
  constructor(
    private readonly cents: number,
    private readonly currency: Currency,
  ) {}

  add(other: Money): Money {
    this.ensureSameCurrency(other);
    return new Money(this.cents + other.cents, this.currency);
  }

  subtract(other: Money): Money {
    this.ensureSameCurrency(other);
    return new Money(this.cents - other.cents, this.currency);
  }

  multiply(factor: number): Money {
    return new Money(Math.round(this.cents * factor), this.currency);
  }

  isPositive(): boolean {
    return this.cents > 0;
  }

  isNegative(): boolean {
    return this.cents < 0;
  }

  isGreaterThan(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this.cents > other.cents;
  }

  formatted(): string {
    return this.currency.format(this.cents);
  }

  private ensureSameCurrency(other: Money): void {
    if (!this.currency.equals(other.currency)) {
      throw new CurrencyMismatchException();
    }
  }
}
```

## DDD Application

### Aggregate Cohesion

```typescript
// Aggregate maintains cohesion around consistency boundary
class ShoppingCart {
  private readonly id: CartId;
  private readonly customerId: CustomerId;
  private items: CartItem[] = [];
  private appliedCoupon: Coupon | null = null;

  // All methods relate to cart operations
  addItem(productId: ProductId, quantity: Quantity, price: Money): void {
    const existingItem = this.findItem(productId);

    if (existingItem !== null) {
      existingItem.adjustQuantity(quantity);
    } else {
      this.items.push(new CartItem(productId, quantity, price));
    }
  }

  removeItem(productId: ProductId): void {
    this.items = this.items.filter((item) => !item.productId.equals(productId));
  }

  applyCoupon(coupon: Coupon): void {
    if (!coupon.isApplicableTo(this)) {
      throw new CouponNotApplicableException();
    }
    this.appliedCoupon = coupon;
  }

  subtotal(): Money {
    return this.items.reduce(
      (sum, item) => sum.add(item.total()),
      Money.zero(),
    );
  }

  total(): Money {
    const subtotal = this.subtotal();
    return this.appliedCoupon?.apply(subtotal) ?? subtotal;
  }

  private findItem(productId: ProductId): CartItem | null {
    return this.items.find((item) => item.productId.equals(productId)) ?? null;
  }
}
```

## Metrics

| Metric                  | Good | Warning | Critical |
| ----------------------- | ---- | ------- | -------- |
| Lines of code           | <200 | 200-400 | >400     |
| Public methods          | ≤7   | 8-12    | >12      |
| LCOM (Lack of Cohesion) | <0.3 | 0.3-0.7 | >0.7     |
| Related method calls    | High | Medium  | Low      |
