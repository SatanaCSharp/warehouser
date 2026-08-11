# Controller Pattern

## Definition

Assign responsibility for handling system events to a class that represents the overall system (facade controller) or a use-case scenario (use-case controller).

## When to Apply

- Handling external system events (HTTP, CLI, messages)
- Coordinating use case execution
- Separating UI from domain logic

## Key Indicators

### Violation Signs

| Indicator         | Detection                | Severity |
| ----------------- | ------------------------ | -------- |
| Fat controller    | >100 lines               | CRITICAL |
| Business logic    | `if/else` in controller  | CRITICAL |
| Direct DB access  | Repository in controller | WARNING  |
| Many dependencies | >5 injected              | WARNING  |

### Compliance Signs

- Thin controller (< 50 lines)
- Delegates to use case/handler
- Only maps input/output
- Single responsibility

## Patterns

### Thin NestJS Controller

```typescript
// GOOD: Controller only coordinates
@Controller('orders')
class OrderController {
  constructor(
    private readonly createHandler: CreateOrderHandler,
    private readonly getHandler: GetOrderHandler,
    private readonly cancelHandler: CancelOrderHandler,
  ) {}

  @Post()
  async create(@Body() dto: CreateOrderDto): Promise<{ id: string }> {
    const command = new CreateOrderCommand(
      dto.customerId,
      dto.items,
      dto.shippingAddress,
    );

    const orderId = await this.createHandler.execute(command);

    return { id: orderId.value };
  }

  @Get(':id')
  async show(@Param('id') id: string): Promise<OrderDto> {
    return this.getHandler.execute(new GetOrderQuery(new OrderId(id)));
  }

  @Delete(':id')
  @HttpCode(204)
  async cancel(@Param('id') id: string): Promise<void> {
    await this.cancelHandler.execute(new CancelOrderCommand(new OrderId(id)));
  }
}
```

### Use Case Handler

```typescript
// Application Controller / Use Case
@Injectable()
class CreateOrderHandler {
  constructor(
    private readonly factory: OrderFactory,
    private readonly orders: OrderRepository,
    private readonly events: EventEmitter2,
  ) {}

  async execute(command: CreateOrderCommand): Promise<OrderId> {
    // Coordinate domain objects
    const order = await this.factory.create(command);

    // Persist
    await this.orders.save(order);

    // Dispatch events
    for (const event of order.releaseEvents()) {
      this.events.emit(event.constructor.name, event);
    }

    return order.id;
  }
}
```

### Command/Query Objects

```typescript
// Command: Intent to change state
class CreateOrderCommand {
  constructor(
    public readonly customerId: CustomerId,
    public readonly items: OrderItemDto[],
    public readonly shippingAddress: AddressDto,
  ) {}
}

// Query: Request for data
class GetOrderQuery {
  constructor(public readonly orderId: OrderId) {}
}

@Injectable()
class GetOrderHandler {
  constructor(private readonly orders: OrderReadRepository) {}

  async execute(query: GetOrderQuery): Promise<OrderDto> {
    const order = await this.orders.find(query.orderId);

    if (order === null) {
      throw new OrderNotFoundException(query.orderId);
    }

    return order;
  }
}
```

### Single-Action Controller

```typescript
// Single responsibility: one action per controller class
@Controller('orders')
class CreateOrderAction {
  constructor(private readonly handler: CreateOrderHandler) {}

  @Post()
  async invoke(@Body() dto: CreateOrderDto): Promise<{ id: string }> {
    try {
      const orderId = await this.handler.execute(
        new CreateOrderCommand(dto.customerId, dto.items, dto.shippingAddress),
      );

      return { id: orderId.value };
    } catch (e) {
      if (e instanceof InsufficientStockException) {
        throw new UnprocessableEntityException(e.message);
      }
      throw e;
    }
  }
}
```

### Message Handler Controller

```typescript
// Event/message consumer (NestJS + microservices / EventEmitter2)
@Injectable()
class OrderPlacedHandler {
  constructor(
    private readonly sendConfirmation: SendOrderConfirmationHandler,
    private readonly updateInventory: UpdateInventoryHandler,
  ) {}

  @OnEvent(OrderPlaced.name)
  async handle(event: OrderPlaced): Promise<void> {
    // Coordinate reactions to event
    await this.sendConfirmation.execute(
      new SendConfirmationCommand(event.orderId),
    );

    await this.updateInventory.execute(
      new UpdateInventoryCommand(event.orderId, event.items),
    );
  }
}
```

## Anti-patterns

### Fat Controller

```typescript
// ANTIPATTERN: Controller does too much
@Controller('orders')
class OrderController {
  @Post()
  async create(@Body() body: object, @Res() res: Response): Promise<void> {
    // Validation (should be in DTO/pipe)
    if (!body['items']?.length) {
      res.status(400).json({ error: 'Items required' });
      return;
    }

    // Business logic (should be in domain/handler)
    const customer = await this.customerRepository.findOne(body['customerId']);
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    const order = new Order();
    order.setCustomer(customer);

    let total = Money.zero();
    for (const item of body['items']) {
      const product = await this.productRepository.findOne(item.id);
      if (product.getStock() < item.quantity) {
        res.status(422).json({ error: 'Insufficient stock' });
        return;
      }

      product.decreaseStock(item.quantity);
      await this.productRepository.save(product);

      const line = new OrderLine();
      line.setProduct(product);
      line.setQuantity(item.quantity);
      order.addLine(line);

      total = total.add(product.getPrice().multiply(item.quantity));
    }

    // More business logic...
    if (total.isGreaterThan(Money.fromCents(100000))) {
      await this.notificationService.alertHighValueOrder(order);
    }

    await this.orderRepository.save(order);

    // Side effects
    await this.mailer.send(new OrderConfirmationEmail(order));
    this.logger.log('Order created', { id: order.getId() });

    res.status(201).json({ id: order.getId() });
  }
}
```

### Direct Domain Access

```typescript
// ANTIPATTERN: Controller directly manipulates domain
@Controller('users')
class UserController {
  @Patch(':id/activate')
  async activate(@Param('id') id: string): Promise<{ status: string }> {
    const user = await this.userRepository.find(new UserId(id));
    user.setStatus(UserStatus.Active); // Direct mutation!
    user.setActivatedAt(new Date()); // Direct mutation!
    await this.userRepository.save(user);

    return { status: 'activated' };
  }
}

// FIX: Delegate to handler
@Controller('users')
class UserController {
  constructor(private readonly activateHandler: ActivateUserHandler) {}

  @Patch(':id/activate')
  async activate(@Param('id') id: string): Promise<{ status: string }> {
    await this.activateHandler.execute(new ActivateUserCommand(new UserId(id)));
    return { status: 'activated' };
  }
}
```

## Layer Separation

```
┌─────────────────────────────────────────────────┐
│                 Presentation                     │
│  (Controllers, Guards, Pipes, Filters)          │
│  - Map input DTO to Command/Query               │
│  - Call handler                                 │
│  - Map result to response shape                 │
├─────────────────────────────────────────────────┤
│                  Application                     │
│  (Handlers, Use Cases, Application Services)    │
│  - Coordinate domain objects                    │
│  - Manage transactions                          │
│  - Dispatch events                              │
├─────────────────────────────────────────────────┤
│                    Domain                        │
│  (Entities, Value Objects, Domain Services)     │
│  - Business logic                               │
│  - Invariants                                   │
└─────────────────────────────────────────────────┘
```

## Metrics

| Metric           | Good        | Warning | Critical |
| ---------------- | ----------- | ------- | -------- |
| Controller lines | <50         | 50-100  | >100     |
| Dependencies     | ≤3          | 4-5     | >5       |
| Conditionals     | 0-1         | 2-3     | >3       |
| Domain calls     | 1 (handler) | 2-3     | >3       |
