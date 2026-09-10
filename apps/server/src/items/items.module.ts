import { Module } from '@nestjs/common';
import { ItemsRestModule } from 'items/rest/rest.module.js';
import { ItemsUsecaseModule } from 'items/usecases/usecase.module.js';

// Combines `items`' application API and its REST adapter, mirroring `auth/auth.module.ts` — the
// one file `app.module.ts` imports for this feature (T7, `tasks/items-rest-surface.md`).
@Module({
  imports: [ItemsUsecaseModule, ItemsRestModule],
  exports: [ItemsUsecaseModule],
})
export class ItemsModule {}
