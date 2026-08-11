# Information Expert Pattern

## Definition

Assign responsibility to the class that has the information needed to fulfill it. The class with the data should have the behavior that operates on that data.

## When to Apply

- Deciding which class should have a method
- Choosing where to put calculation logic
- Determining behavior ownership

## Key Indicators

### Violation Signs

| Indicator    | Detection              | Severity |
| ------------ | ---------------------- | -------- |
| Feature Envy | Multiple getter chains | CRITICAL |
| Data Class   | Only getters/setters   | CRITICAL |
| Train Wreck  | `.get().get().get()`   | WARNING  |
| Anemic Model | Service does all logic | WARNING  |

### Compliance Signs

- Data and behavior together
- Short method chains
- Rich domain objects
- Tell, don't ask

## Patterns

### Tell, Don't Ask

```typescript
// BAD: Asking for data, then deciding
@Injectable()
class OrderService {
  canShip(order: Order): boolean {
    if (order.getStatus() !== OrderStatus.Paid) {
      return false;
    }
    if (order.getShippingAddress() === null) {
      return false;
    }
    for (const line of order.getLines()) {
      if (line.getProduct().getStock() < line.getQuantity()) {
        return false;
      }
    }
    return true;
  }
}

// GOOD: Telling the object what to do
class Order {
  canShip(): boolean {
    return (
      this.status === OrderStatus.Paid &&
      this.shippingAddress !== null &&
      this.hasStock()
    );
  }

  private hasStock(): boolean {
    return this.lines.every((line) => line.hasStock());
  }
}

class OrderLine {
  hasStock(): boolean {
    return this.product.hasStockFor(this.quantity);
  }
}
```

### Calculation in Owner

```typescript
// BAD: External calculation
@Injectable()
class PriceCalculator {
  calculateLineTotal(line: OrderLine): Money {
    const price = line.getProduct().getPrice();
    const quantity = line.getQuantity().getValue();
    const discount = line.getDiscount()?.getPercentage() ?? 0;

    return price.multiply(quantity).multiply(1 - discount / 100);
  }
}

// GOOD: Calculation where data lives
class OrderLine {
  constructor(
    private readonly product: Product,
    private readonly quantity: Quantity,
    private readonly discount: Discount | null = null,
  ) {}

  total(): Money {
    const linePrice = this.product.price.multiply(this.quantity.value);
    return this.discount?.apply(linePrice) ?? linePrice;
  }
}

class Discount {
  constructor(private readonly percentage: Percentage) {}

  apply(price: Money): Money {
    return price.multiply(1 - this.percentage.value / 100);
  }
}
```

### Validation in Entity

```typescript
// BAD: External validation
@Injectable()
class OrderValidator {
  validate(order: Order): string[] {
    const errors: string[] = [];

    if (order.getLines().length === 0) {
      errors.push('Order must have at least one line');
    }

    if (order.getTotal().isNegative()) {
      errors.push('Order total cannot be negative');
    }

    return errors;
  }
}

// GOOD: Self-validating entity
class Order {
  private lines: OrderLine[] = [];

  addLine(line: OrderLine): void {
    this.lines.push(line);
  }

  place(): void {
    this.ensureHasLines();
    this.ensurePositiveTotal();

    this.status = OrderStatus.Placed;
    this.placedAt = new Date();
  }

  private ensureHasLines(): void {
    if (this.lines.length === 0) {
      throw new EmptyOrderException();
    }
  }

  private ensurePositiveTotal(): void {
    if (this.total().isNegative()) {
      throw new InvalidOrderTotalException();
    }
  }
}
```

## DDD Application

### Aggregate Behavior

```typescript
// Aggregate has all information for its invariants
class Cart {
  private items: CartItem[] = [];

  addItem(product: Product, quantity: Quantity): void {
    const existingItem = this.findItem(product.id);

    if (existingItem !== null) {
      existingItem.increaseQuantity(quantity);
    } else {
      this.items.push(new CartItem(product, quantity));
    }
  }

  removeItem(productId: ProductId): void {
    this.items = this.items.filter((item) => !item.productId.equals(productId));
  }

  total(): Money {
    return this.items.reduce(
      (sum, item) => sum.add(item.subtotal()),
      Money.zero(),
    );
  }

  private findItem(id: ProductId): CartItem | null {
    return this.items.find((item) => item.productId.equals(id)) ?? null;
  }
}
```

## Anti-patterns

### Feature Envy

```typescript
// ANTIPATTERN: Method uses another object's data more
@Injectable()
class InvoiceGenerator {
  generate(order: Order): Invoice {
    // Accesses Order's internal data extensively
    const invoice = new Invoice();
    invoice.customerName = order.getCustomer().getName();
    invoice.customerAddress = order.getCustomer().getAddress().format();
    invoice.customerEmail = order.getCustomer().getEmail();

    for (const line of order.getLines()) {
      invoice.addLine(
        line.getProduct().getName(),
        line.getQuantity().getValue(),
        line.getProduct().getPrice().getValue(),
      );
    }

    return invoice;
  }
}

// FIX: Move to Order
class Order {
  toInvoice(): Invoice {
    return new Invoice(
      this.customer.toInvoiceRecipient(),
      this.lines.map((l) => l.toInvoiceLine()),
      this.total(),
    );
  }
}
```

## Metrics

| Metric                | Good | Warning | Critical |
| --------------------- | ---- | ------- | -------- |
| Method chain depth    | ≤2   | 3       | >3       |
| Getters per entity    | ≤5   | 6-8     | >8       |
| External calculations | 0    | 1-2     | >2       |
