import { Global, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CustomerAddressBookService } from 'customers/domain/services/customer-address-book.service';
import { CustomersUsecaseModule } from 'customers/usecases/usecase.module';
import { DataSource } from 'typeorm';

// `CustomersUsecaseModule` declares its own repositories as local providers rather than reaching
// them from the `@Global()` `DomainModule`, exactly as `customer-orders` and `purchase-drafts` do.
// The one dependency that leaves unsupplied is the `DataSource` those repositories take a
// constructor parameter of — provided globally here as a double, as `DomainModule` provides the
// real one at boot, so the module's own providers construct for real and the graph resolves through
// Nest exactly as it does at boot.
@Global()
@Module({
  providers: [{ provide: DataSource, useValue: {} }],
  exports: [DataSource],
})
class TestDataSourceDoubleModule {}

// A module outside `customers` that tries to reach the service the way a consumer would: by
// importing the feature's use-case module and injecting the provider. `module-boundaries.spec.ts`
// proves the `exports` declaration by regex; only compiling this graph proves the *consequence* the
// DoD states — "nothing outside `customers` can reach it".
@Injectable()
class OutsideConsumer {
  constructor(readonly addressBook: CustomerAddressBookService) {}
}

@Module({
  imports: [CustomersUsecaseModule],
  providers: [OutsideConsumer],
})
class OutsideModule {}

describe('CustomersUsecaseModule Nest DI graph', () => {
  // sad.md §5 — `CustomerAddressBookService` is "registered on the `UsecaseModule`". Compiling the
  // real graph is what catches a constructor parameter Nest cannot resolve, which a regex over the
  // module source cannot see.
  it('constructs CustomerAddressBookService through Nest injection', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestDataSourceDoubleModule, CustomersUsecaseModule],
    }).compile();

    expect(moduleRef.get(CustomerAddressBookService)).toBeInstanceOf(
      CustomerAddressBookService,
    );
  });

  // sad.md §5 — "**not** exported; nothing outside `customers` calls it". A module that imports
  // `CustomersUsecaseModule` and injects the service must fail to compile: the provider is not on
  // the module's declared public surface, so Nest cannot resolve it for a consumer.
  it('refuses to resolve the service for a module outside customers', async () => {
    await expect(
      Test.createTestingModule({
        imports: [TestDataSourceDoubleModule, OutsideModule],
      }).compile(),
    ).rejects.toThrow(/CustomerAddressBookService/u);
  });
});
