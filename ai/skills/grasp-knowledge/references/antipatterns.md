# Common GRASP Violations (Antipatterns)

## Overview

This document catalogs common GRASP violations found in TypeScript/NestJS codebases with detection patterns and remediation guidance.

## Information Expert Violations

### Feature Envy

```typescript
// ANTIPATTERN: Method accesses other object's data more than its own
@Injectable()
class OrderReporter {
  generateSummary(order: Order): string {
    // Accesses Order internals extensively
    let summary = `Order: ${order.getId().getValue()}\n`;

    for (const line of order.getLines()) {
      summary += `- ${line.getProduct().getName()} x${line.getQuantity().getValue()} `;
      summary += `@ ${line.getProduct().getPrice().format()} `;
      summary += `= ${line.getProduct().getPrice().multiply(line.getQuantity().getValue()).format()}\n`;
    }

    return summary;
  }
}
```

**Detection:**

```bash
grep -rn "\.get.*()\.get.*()\.get" --include="*.ts"
```

**Fix:** Move logic to Order class

```typescript
class Order {
  toSummary(): string {
    /* ... */
  }
}
```

### Anemic Domain Model

```typescript
// ANTIPATTERN: Entity has no behavior
class User {
  id: number | null = null;
  email: string;
  password: string;
  active = false;

  getId(): number | null {
    return this.id;
  }
  getEmail(): string {
    return this.email;
  }
  setEmail(email: string): void {
    this.email = email;
  }
  // Only getters/setters, no behavior!
}

// All logic in service
@Injectable()
class UserService {
  activate(user: User): void {
    user.setActive(true);
    this.repository.save(user);
    this.mailer.send(new ActivationEmail(user));
  }
}
```

**Fix:** Rich domain model

```typescript
class User {
  activate(): void {
    if (this.active) {
      throw new AlreadyActiveException();
    }
    this.active = true;
    this.events.push(new UserActivated(this.id));
  }
}
```

---

## Creator Violations

### Random Object Creation

```typescript
// ANTIPATTERN: Objects created in wrong places
@Injectable()
class EmailService {
  sendOrderConfirmation(orderData: OrderData): void {
    // EmailService shouldn't create Orders!
    const order = new Order(
      new OrderId(orderData.id),
      new CustomerId(orderData.customerId),
    );

    for (const item of orderData.items) {
      order.addLine(
        new Product(item.productId, item.name),
        new Quantity(item.quantity),
      );
    }

    this.mailer.send(new OrderConfirmation(order));
  }
}
```

**Fix:** Use factory, inject created object

```typescript
@Injectable()
class EmailService {
  sendOrderConfirmation(order: Order): void {
    this.mailer.send(new OrderConfirmation(order));
  }
}
```

---

## Controller Violations

### Fat Controller

```typescript
// ANTIPATTERN: Controller does too much
@Controller('orders')
class OrderController {
  @Post()
  async create(@Body() body: object, @Res() res: Response): Promise<void> {
    // Validation
    if (!body['items']?.length) {
      res.status(400).json({ error: 'Items required' });
      return;
    }

    // Business logic
    const customer = await this.customers.findOne(body['customerId']);
    const order = new Order(customer);

    for (const item of body['items']) {
      const product = await this.products.findOne(item.id);
      if (product.getStock() < item.quantity) {
        res.status(422).json({ error: 'Insufficient stock' });
        return;
      }
      order.addLine(product, new Quantity(item.quantity));
    }

    // Persistence
    await this.orders.save(order);

    // Side effects
    await this.mailer.send(new OrderConfirmation(order));
    await this.inventory.reserve(order);

    res.status(201).json({ id: order.getId() });
  }
}
```

**Detection:**

```bash
find . -path "*/controllers/*.ts" -exec wc -l {} \; | awk '$1 > 100'
```

**Fix:** Delegate to handler

```typescript
@Controller('orders')
class OrderController {
  @Post()
  async create(@Body() dto: CreateOrderDto): Promise<{ id: string }> {
    const orderId = await this.createOrderHandler.execute(
      new CreateOrderCommand(dto.customerId, dto.items),
    );

    return { id: orderId.value };
  }
}
```

---

## Low Coupling Violations

### Dependency Explosion

```typescript
// ANTIPATTERN: Too many dependencies
@Injectable()
class OrderService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly customers: CustomerRepository,
    private readonly products: ProductRepository,
    private readonly inventory: InventoryService,
    private readonly payment: PaymentGateway,
    private readonly tax: TaxCalculator,
    private readonly shipping: ShippingCalculator,
    private readonly discount: DiscountService,
    private readonly mailer: Mailer,
    private readonly sms: SmsGateway,
    private readonly logger: Logger,
    private readonly cache: Cache,
  ) {}
}
```

**Detection:**

```bash
grep -rn "constructor(" --include="*.ts" -A 15 | grep -c "private readonly"
```

**Fix:** Split into focused services

---

## High Cohesion Violations

### God Class

```typescript
// ANTIPATTERN: Class does everything
@Injectable()
class UserManager {
  register(data: object): Promise<User> {
    return null!;
  }
  login(email: string, password: string): Promise<Token> {
    return null!;
  }
  logout(token: Token): Promise<void> {
    return null!;
  }
  sendPasswordReset(email: string): Promise<void> {
    return null!;
  }
  updateProfile(user: User, data: object): Promise<void> {
    return null!;
  }
  uploadAvatar(user: User, file: Express.Multer.File): Promise<void> {
    return null!;
  }
  deleteUser(user: User): Promise<void> {
    return null!;
  }
  exportUserData(user: User): Promise<string> {
    return null!;
  }
  importUsers(csvPath: string): Promise<User[]> {
    return null!;
  }
  generateReport(): Promise<Report> {
    return null!;
  }
  sendNotification(user: User, n: Notification): Promise<void> {
    return null!;
  }
}
```

**Detection:**

```bash
find . -name "*.ts" -exec wc -l {} \; | awk '$1 > 500'
grep -rn "class.*Manager\|class.*Handler" --include="*.ts"
```

**Fix:** Extract focused classes

---

## Polymorphism Violations

### Type Switch

```typescript
// ANTIPATTERN: Type-based conditionals
@Injectable()
class DocumentProcessor {
  process(doc: Document): void {
    switch (doc.getType()) {
      case 'pdf':
        this.processPdf(doc);
        break;
      case 'word':
        this.processWord(doc);
        break;
      case 'excel':
        this.processExcel(doc);
        break;
      case 'image':
        this.processImage(doc);
        break;
      // Must modify for new types!
    }
  }
}
```

**Detection:**

```bash
grep -rn "switch.*getType\|switch.*\.type\b" --include="*.ts"
grep -rn "instanceof.*?\s*:" --include="*.ts"
```

**Fix:** Use polymorphism

```typescript
interface DocumentProcessor {
  supports(doc: Document): boolean;
  process(doc: Document): void;
}
```

---

## Pure Fabrication Violations

### Misplaced Logic

```typescript
// ANTIPATTERN: Infrastructure logic in domain
class Order {
  async save(): Promise<void> {
    // Domain object shouldn't know about persistence!
    const dataSource = new DataSource({ type: 'postgres' /* ... */ });
    await dataSource.getRepository(Order).save(this);
  }

  async sendConfirmation(): Promise<void> {
    // Domain object shouldn't know about email!
    const transporter = nodemailer.createTransport(/* ... */);
    await transporter.sendMail(/* ... */);
  }
}
```

**Fix:** Use Repository and Domain Events

```typescript
class Order {
  private readonly events: DomainEvent[] = [];

  place(): void {
    this.status = OrderStatus.Placed;
    this.events.push(new OrderPlaced(this.id));
  }
}
```

---

## Indirection Violations

### Missing Abstraction

```typescript
// ANTIPATTERN: Direct external system coupling
@Injectable()
class OrderService {
  async process(order: Order): Promise<void> {
    // Direct Stripe dependency!
    const stripe = new Stripe('sk_test_xxx');
    const charge = await stripe.charges.create({
      amount: order.getTotal().getCents(),
      currency: 'usd',
    });

    // Direct AWS dependency!
    const s3 = new S3Client({ region: 'us-east-1' });
    await s3.send(
      new PutObjectCommand({
        Bucket: 'invoices',
        Key: `${order.getId()}.pdf`,
        Body: await this.generateInvoice(order),
      }),
    );
  }
}
```

**Detection:**

```bash
grep -rn "new Stripe\|new S3Client\|new SES\b" --include="*.ts"
```

**Fix:** Adapter pattern

```typescript
interface PaymentGateway {
  charge(request: PaymentRequest): Promise<PaymentResult>;
}

interface FileStorage {
  store(path: string, content: Buffer): Promise<void>;
}
```

---

## Protected Variations Violations

### Hardcoded Variations

```typescript
// ANTIPATTERN: Hardcoded variation points
@Injectable()
class ShippingCalculator {
  async calculate(order: Order): Promise<Money> {
    // Hardcoded carriers!
    switch (order.getShippingMethod()) {
      case 'ups':
        return this.calculateUps(order);
      case 'fedex':
        return this.calculateFedex(order);
      case 'usps':
        return this.calculateUsps(order);
    }
  }

  private async calculateUps(order: Order): Promise<Money> {
    // Hardcoded API key!
    const client = new UpsRateClient('api-key-xxx');
    // ...
  }
}
```

**Fix:** Strategy pattern with interfaces

```typescript
interface ShippingCarrier {
  getName(): string;
  calculateRate(shipment: Shipment): Promise<Money>;
}
```

---

## Quick Reference: Detection Commands

```bash
# Information Expert: Feature Envy
grep -rn "\.get.*()\.get.*()\.get" --include="*.ts"

# Creator: Random creation
grep -rn "new [A-Z][a-zA-Z]*(" --include="*.service.ts"

# Controller: Fat controllers
find . -path "*/controllers/*.ts" -exec wc -l {} \; | awk '$1 > 100'

# Low Coupling: Many dependencies
grep -rn "constructor(" --include="*.ts" -A 15 | grep -c "private readonly"

# High Cohesion: God classes
find . -name "*.ts" -exec wc -l {} \; | awk '$1 > 500'

# Polymorphism: Type switches
grep -rn "switch.*\.type\b\|switch.*getType" --include="*.ts"

# Indirection: Direct coupling
grep -rn "new Stripe\|new S3Client\|new SES\b" --include="*.ts"
```

## Severity Guide

| Severity | Description           | Action                     |
| -------- | --------------------- | -------------------------- |
| CRITICAL | Fundamental violation | Immediate refactoring      |
| WARNING  | Localized violation   | Plan refactoring           |
| INFO     | Minor issue           | Consider in next iteration |
