import { ArrivalConfirmationService } from 'purchase-drafts/domain/services/arrival-confirmation.service';
import {
  TRANSACTIONAL_KEY,
  type TransactionalMetadata,
} from 'shared/decorators/transactional.decorator';

// T15 review — `arrival-confirmation.service.integration.spec.ts` proves the *outcome* of
// spec.md §6 "Arrival atomicity" by rolling back an injected mid-way failure, but it cannot prove
// the boundary that delivers it in production. Every test there constructs the service with `new`
// and wraps the call in the suite's own `executeInTransaction(...)`, so the rollback it observes
// belongs to the test's outer transaction. `@Transactional()` is `SetMetadata` — inert until
// `TransactionExecutorService` reads it through Nest — so deleting the decorator leaves every one
// of those tests green while, in production, the draft and line UPDATEs would autocommit and a
// failed allocation would strand a Closed draft carrying received quantities and no Allocation:
// precisely the outcome the atomicity target forbids.
//
// This is the assertion that fails when the decorator goes, following the idiom
// `warehouses/usecases/commands/archive-warehouse.command.spec.ts` and
// `access/usecases/role-lifecycle.spec.ts` already use.
describe('ArrivalConfirmationService transaction boundary', () => {
  it('owns the complete atomic operation under one @Transactional() boundary (spec.md §6, ADR 0002)', () => {
    expect(
      Reflect.getMetadata(
        TRANSACTIONAL_KEY,
        ArrivalConfirmationService.prototype.confirm,
      ) as TransactionalMetadata | undefined,
    ).toBeDefined();
  });
});
