---
name: grasp-knowledge
description: GRASP principles knowledge base for TypeScript/NestJS projects. Provides quick reference for 9 responsibility assignment patterns (Information Expert, Creator, Controller, Low Coupling, High Cohesion, Polymorphism, Pure Fabrication, Indirection, Protected Variations). Use for architecture audits and design decisions.
---

# GRASP Principles Knowledge Base

## Overview

GRASP (General Responsibility Assignment Software Patterns) provides guidelines for assigning responsibilities to classes and objects in object-oriented design.

| Principle                | Core Question                  | Goal                             |
| ------------------------ | ------------------------------ | -------------------------------- |
| **Information Expert**   | Who has the data?              | Assign to class with information |
| **Creator**              | Who creates objects?           | Assign creation responsibility   |
| **Controller**           | Who handles system events?     | Coordinate use case flow         |
| **Low Coupling**         | How to reduce dependencies?    | Minimize interconnections        |
| **High Cohesion**        | How to focus responsibilities? | Keep related things together     |
| **Polymorphism**         | How to handle type variations? | Use polymorphic operations       |
| **Pure Fabrication**     | What if no domain class fits?  | Create artificial class          |
| **Indirection**          | How to decouple?               | Add intermediate object          |
| **Protected Variations** | How to handle change?          | Hide variation points            |

## Quick Detection Patterns

### Information Expert Violations

```bash
# Feature Envy: Class uses other class's data more
grep -rn "\.get.*\.get.*\.get" --include="*.ts"

# Train wreck calls
grep -rn "\.\w\+()\.\w\+()\.\w\+()" --include="*.ts"
```

**Signs:** Method accesses other object's data extensively, data and behavior separated.

### Creator Violations

```bash
# Random creation locations
grep -rn "new [A-Z][a-zA-Z]*(" --include="*.ts"
```

**Signs:** Objects created in unexpected places, no clear creation ownership.

### Controller Violations

```bash
# Fat controllers (>100 lines)
find . -path "*/controllers/*.ts" -exec wc -l {} \; | awk '$1 > 100'

# Business logic in controllers
grep -rn "if.*&&.*||" --include="*.controller.ts"
```

**Signs:** Controller has >100 lines, business logic in controller.

### Low Coupling Violations

```bash
# High dependency count (>7)
grep -rn "constructor(" --include="*.ts" -A 15

# Concrete type dependencies
grep -rn "private readonly [a-z]\+: [A-Z][a-z]*Repository\b" --include="*.ts"
```

**Signs:** Class has >7 dependencies, depends on concrete classes.

### High Cohesion Violations

```bash
# Unrelated method names
grep -rn "and\|Or" --include="*.service.ts" | grep "public "

# Multiple responsibilities in class name
grep -rn "class.*Manager\|class.*Handler\|class.*Processor" --include="*.ts"
```

**Signs:** Methods don't relate to each other, class does many unrelated things.

## Quick TypeScript/NestJS Examples

### Information Expert

```typescript
// BAD: Logic outside of object with data
@Injectable()
class OrderService {
  calculateTotal(order: Order): Money {
    let total = Money.zero();
    for (const line of order.getLines()) {
      total = total.add(
        line.getProduct().getPrice().multiply(line.getQuantity()),
      );
    }
    return total;
  }
}

// GOOD: Logic in class that has the data
class Order {
  total(): Money {
    return this.lines.reduce(
      (sum, line) => sum.add(line.total()),
      Money.zero(),
    );
  }
}
```

### Low Coupling

```typescript
// BAD: Depends on concrete classes
@Injectable()
class ReportGenerator {
  constructor(
    private readonly typeOrmOrderRepository: TypeOrmOrderRepository,
    private readonly nodemailerMailer: NodemailerMailer,
  ) {}
}

// GOOD: Depends on abstractions
@Injectable()
class ReportGenerator {
  constructor(
    private readonly orders: OrderRepository,
    private readonly mailer: Mailer,
  ) {}
}
```

### High Cohesion

```typescript
// BAD: Low cohesion - unrelated responsibilities
@Injectable()
class UserManager {
  register(data: object): User {
    return null!;
  }
  sendEmail(user: User): void {}
  generateReport(): string {
    return '';
  }
}

// GOOD: High cohesion - focused responsibilities
@Injectable()
class UserRegistrationService {
  register(data: RegistrationData): User {
    return null!;
  }
  confirmEmail(token: Token): void {}
}
```

## GRASP & DDD Integration

| GRASP                | DDD Application                         |
| -------------------- | --------------------------------------- |
| Information Expert   | Entities contain their behavior         |
| Creator              | Aggregates create their entities        |
| Controller           | Application Services / Use Cases        |
| Low Coupling         | Bounded Context boundaries              |
| High Cohesion        | Aggregate consistency boundary          |
| Polymorphism         | Domain Services, Strategies             |
| Pure Fabrication     | Repositories, Factories, Specifications |
| Indirection          | Anti-Corruption Layer, Adapters         |
| Protected Variations | Ports & Adapters, Domain Events         |

## References

For detailed patterns and examples, see `references/`:

- `information-expert.md` — Tell Don't Ask, calculations in owner
- `creator.md` — Factory patterns, aggregation rules
- `controller.md` — Use case handlers, thin controllers
- `low-coupling.md` — Dependency injection, abstractions
- `high-cohesion.md` — Focused responsibilities
- `polymorphism.md` — Strategy pattern, type variations
- `pure-fabrication.md` — Repositories, specifications
- `indirection.md` — Adapters, mediators
- `protected-variations.md` — Stable interfaces
- `antipatterns.md` — Common GRASP violations

## Assets

- `assets/report-template.md` — GRASP audit report format
