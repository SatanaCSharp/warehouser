import { Global, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ArrivalInspectionService } from 'purchase-drafts/domain/services/arrival-inspection.service';
import { AddPurchaseDraftLineCommand } from 'purchase-drafts/usecases/commands/add-purchase-draft-line.command';
import { AddPurchaseDraftLineLinkCommand } from 'purchase-drafts/usecases/commands/add-purchase-draft-line-link.command';
import { AmendPurchaseDraftRejectionCommand } from 'purchase-drafts/usecases/commands/amend-purchase-draft-rejection.command';
import { ClosePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/close-purchase-draft.command';
import { ConfirmPurchaseDraftLineArrivalCommand } from 'purchase-drafts/usecases/commands/confirm-purchase-draft-line-arrival.command';
import { CreatePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/create-purchase-draft.command';
import { DiscardPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/discard-purchase-draft.command';
import { ReadyPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/ready-purchase-draft.command';
import { RecordPurchaseDraftLineDeliveryCommand } from 'purchase-drafts/usecases/commands/record-purchase-draft-line-delivery.command';
import { RemovePurchaseDraftLineCommand } from 'purchase-drafts/usecases/commands/remove-purchase-draft-line.command';
import { RemovePurchaseDraftLineLinkCommand } from 'purchase-drafts/usecases/commands/remove-purchase-draft-line-link.command';
import { RevisePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/revise-purchase-draft.command';
import { RevisePurchaseDraftLineCommand } from 'purchase-drafts/usecases/commands/revise-purchase-draft-line.command';
import { RevisePurchaseDraftLineLinkCommand } from 'purchase-drafts/usecases/commands/revise-purchase-draft-line-link.command';
import { ListPackagingTypesQuery } from 'purchase-drafts/usecases/queries/list-packaging-types.query';
import { ListPurchaseDraftsQuery } from 'purchase-drafts/usecases/queries/list-purchase-drafts.query';
import { ReadPurchaseDraftQuery } from 'purchase-drafts/usecases/queries/read-purchase-draft.query';
import { PurchaseDraftsUsecaseModule } from 'purchase-drafts/usecases/usecase.module';
import { DataSource } from 'typeorm';

// Unlike `warehouses`/`workspaces`, `PurchaseDraftsUsecaseModule` declares its own repositories
// as local providers rather than reaching them from the `@Global()` `DomainModule`
// (`customer-orders/usecases/usecase.module.ts` establishes the same pattern for
// `ConsolidatedDemandRepository`). The one dependency that module boundary still leaves
// unsupplied is the `DataSource` those repositories take a constructor parameter of — provided
// globally here as a double, exactly as `DomainModule` provides the real one at boot, so the
// module's own repository providers construct for real and the graph resolves through Nest
// exactly as it does at boot.
@Global()
@Module({
  providers: [{ provide: DataSource, useValue: {} }],
  exports: [DataSource],
})
class TestDataSourceDoubleModule {}

// T14 — `module-boundaries.spec.ts` proves the providers/exports declaration by regex, which
// cannot catch a constructor parameter that erases to `Object` under
// `emitDecoratorMetadata` (a `Pick<Repository, 'method'>` injection-site type) and therefore
// cannot be resolved by Nest's injector. Compiling the real module graph through the DI container
// is the only way this repository observes that failure without a database.
describe('PurchaseDraftsUsecaseModule Nest DI graph', () => {
  it('constructs every exported Purchase Draft use case through Nest injection', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestDataSourceDoubleModule, PurchaseDraftsUsecaseModule],
    }).compile();

    expect(moduleRef.get(ReadyPurchaseDraftCommand)).toBeInstanceOf(
      ReadyPurchaseDraftCommand,
    );
    expect(moduleRef.get(ClosePurchaseDraftCommand)).toBeInstanceOf(
      ClosePurchaseDraftCommand,
    );
    expect(moduleRef.get(DiscardPurchaseDraftCommand)).toBeInstanceOf(
      DiscardPurchaseDraftCommand,
    );
    // The per-line endings are the use cases in this module whose graph leaves it: both take
    // `DemandAllocationService`, which resolves only
    // because `PurchaseDraftsUsecaseModule` imports `CustomerOrdersUsecaseModule` and that module
    // exports it (ADR 0002). Compiling it here is what proves the cross-module edge is wired, and
    // that the command's `@Optional()` runtime parameter — an interface, so `Object` under
    // `emitDecoratorMetadata` — does not stop the injector resolving the rest.
    expect(
      moduleRef.get(ConfirmPurchaseDraftLineArrivalCommand),
    ).toBeInstanceOf(ConfirmPurchaseDraftLineArrivalCommand);
    expect(
      moduleRef.get(RecordPurchaseDraftLineDeliveryCommand),
    ).toBeInstanceOf(RecordPurchaseDraftLineDeliveryCommand);
    expect(moduleRef.get(ReadPurchaseDraftQuery)).toBeInstanceOf(
      ReadPurchaseDraftQuery,
    );
    expect(moduleRef.get(ListPurchaseDraftsQuery)).toBeInstanceOf(
      ListPurchaseDraftsQuery,
    );
  });

  // The create and revise use cases. Between them they reach four repositories (assembly, item
  // catalogue, customer-order lifecycle, packaging-type catalogue), none of which `DomainModule`
  // provides, so every one has to be a local provider of this module exactly as
  // `PurchaseDraftAssemblyRepository` already is. Compiling the graph is what proves that, and that
  // every one of the eight assembly commands is registered at all.
  it('constructs every Purchase Draft assembly use case through Nest injection', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestDataSourceDoubleModule, PurchaseDraftsUsecaseModule],
    }).compile();

    expect(moduleRef.get(CreatePurchaseDraftCommand)).toBeInstanceOf(
      CreatePurchaseDraftCommand,
    );
    expect(moduleRef.get(RevisePurchaseDraftCommand)).toBeInstanceOf(
      RevisePurchaseDraftCommand,
    );
    expect(moduleRef.get(AddPurchaseDraftLineCommand)).toBeInstanceOf(
      AddPurchaseDraftLineCommand,
    );
    expect(moduleRef.get(RevisePurchaseDraftLineCommand)).toBeInstanceOf(
      RevisePurchaseDraftLineCommand,
    );
    expect(moduleRef.get(RemovePurchaseDraftLineCommand)).toBeInstanceOf(
      RemovePurchaseDraftLineCommand,
    );
    expect(moduleRef.get(AddPurchaseDraftLineLinkCommand)).toBeInstanceOf(
      AddPurchaseDraftLineLinkCommand,
    );
    expect(moduleRef.get(RevisePurchaseDraftLineLinkCommand)).toBeInstanceOf(
      RevisePurchaseDraftLineLinkCommand,
    );
    expect(moduleRef.get(RemovePurchaseDraftLineLinkCommand)).toBeInstanceOf(
      RemovePurchaseDraftLineLinkCommand,
    );
    // AC-13 — the catalogue the Packaging Type rule refuses against is also the catalogue the
    // member picks from, served at `/packaging-types` (openapi.yaml).
    expect(moduleRef.get(ListPackagingTypesQuery)).toBeInstanceOf(
      ListPackagingTypesQuery,
    );
  });
});

// T11/AC-18 — the Rejection amendment reaches `PurchaseDraftRejectionRepository`, which
// `DomainModule` does not provide either, so it has to be a local provider of this module exactly
// as the assembly repositories are. Its own `describe` block, following T14's/T15's/T8's
// precedent, so a concurrent addition to this file never collides with theirs. The export claim
// itself is proved in `module-boundaries.spec.ts` (T11), not here — `moduleRef.get()` on a
// compiled testing module resolves a non-exported provider too, so this case only proves
// construction.
describe('PurchaseDraftsUsecaseModule Nest DI graph (T11)', () => {
  it('constructs the Rejection amendment use case through Nest injection', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestDataSourceDoubleModule, PurchaseDraftsUsecaseModule],
    }).compile();

    expect(moduleRef.get(AmendPurchaseDraftRejectionCommand)).toBeInstanceOf(
      AmendPurchaseDraftRejectionCommand,
    );
  });
});

// T8 — `ArrivalInspectionService` is the module's second internal collaborator, beside
// `PurchaseDraftAssemblyService`. Its own dependency, `RejectionReasonCatalogueRepository`, is not
// provided by the `@Global()` `DomainModule` either, so it has to become a local provider of this
// module exactly as the four catalogue/lifecycle repositories above already are — a fact only a
// compiled graph observes.
//
// Kept as its own `describe` block, following T14's and T15's precedent, so a concurrent addition to
// this file never collides with theirs.
describe('PurchaseDraftsUsecaseModule Nest DI graph (T8)', () => {
  it('constructs ArrivalInspectionService, with the Reason catalogue injected', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestDataSourceDoubleModule, PurchaseDraftsUsecaseModule],
    }).compile();

    expect(moduleRef.get(ArrivalInspectionService)).toBeInstanceOf(
      ArrivalInspectionService,
    );
  });

  // sad.md §5 — "registered on `UsecaseModule` and **not** exported". The service holds a rule of
  // the two ending commands, so nothing outside this module may reach it: a transport adapter, and
  // any other feature module, reaches these rules only through the use cases that own them
  // (server-architecture.md §"NestJS modules and exports").
  //
  // Proven behaviourally rather than by reading the decorator: a provider in an importing module
  // that asks for it cannot be constructed, which is the consequence the rule exists to produce.
  it('does not export ArrivalInspectionService, so no importing module can inject it', async () => {
    @Injectable()
    class ArrivalInspectionProbe {
      constructor(readonly inspection: ArrivalInspectionService) {}
    }

    @Module({
      imports: [PurchaseDraftsUsecaseModule],
      providers: [ArrivalInspectionProbe],
    })
    class ProbeModule {}

    await expect(
      Test.createTestingModule({
        imports: [TestDataSourceDoubleModule, ProbeModule],
      }).compile(),
    ).rejects.toThrow(/ArrivalInspectionService/u);
  });

  // The control for the case above: the same probe shape resolves for a provider this module does
  // export, so the refusal above is the missing export and not a broken probe.
  it('resolves an exported use case through the same probe shape', async () => {
    @Injectable()
    class ExportedUsecaseProbe {
      constructor(readonly command: ReadyPurchaseDraftCommand) {}
    }

    @Module({
      imports: [PurchaseDraftsUsecaseModule],
      providers: [ExportedUsecaseProbe],
    })
    class ProbeModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [TestDataSourceDoubleModule, ProbeModule],
    }).compile();

    expect(
      moduleRef.get(ExportedUsecaseProbe, { strict: false }),
    ).toBeInstanceOf(ExportedUsecaseProbe);
  });
});
