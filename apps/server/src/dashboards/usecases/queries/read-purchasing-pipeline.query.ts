import { Inject, Injectable } from '@nestjs/common';
import type {
  AgeBand,
  OpenPurchaseDraftState,
  PurchasingPipelinePanel,
} from '@warehouser/contracts/dashboards';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { APP_TIMEZONE } from 'shared/config/app-timezone.config';
import { WarehousePurchasingReadRepository } from 'shared/domain/repositories/warehouse-purchasing-read.repository';

// AC-10/AC-11/sad.md §6.5 — Purchasing Pipeline is not a conjunction Panel:
// `@RequiredPermission(PURCHASE_DRAFTS_WATCH)` alone admits it, so this query asserts no observed
// Permission. Its own rule is nesting the repository's eight flat (state, Age Band) rows into
// `openapi.yaml`'s fixed two-state/four-band order — `PurchasingPipelinePanel.states` is exactly
// `draft` then `ready_for_ordering`, each with its four Age Bands in their own fixed order — so a
// band the Warehouse holds no draft for still reports `0` rather than being absent. `timezone` is
// the same bound `APP_TIMEZONE` value every Age Band's "today" is measured against
// (data-model.md § "Time, timezone and the week").
@Injectable()
export class ReadPurchasingPipelineQuery {
  constructor(
    private readonly repository: WarehousePurchasingReadRepository,
    @Inject(APP_TIMEZONE) private readonly timezone: string,
  ) {}

  async execute(
    currentUser: AccessCurrentUser,
  ): Promise<PurchasingPipelinePanel> {
    const bands = await this.repository.readPurchasingPipeline(
      currentUser.warehouseId,
      this.timezone,
    );

    const states: readonly OpenPurchaseDraftState[] = [
      'draft',
      'ready_for_ordering',
    ];
    const ageBands: readonly AgeBand[] = [
      'up_to_7_days',
      'from_8_to_14_days',
      'from_15_to_30_days',
      'over_30_days',
    ];

    return {
      states: states.map((state) => ({
        state,
        bands: ageBands.map((ageBand) => ({
          ageBand,
          draftCount:
            bands.find(
              (band) => band.state === state && band.ageBand === ageBand,
            )?.draftCount ?? 0,
        })),
      })),
    };
  }
}
