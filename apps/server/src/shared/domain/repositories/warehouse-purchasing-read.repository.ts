import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { DataSource } from 'typeorm';

// openapi.yaml `PurchasingPipelineStateRow`/`PurchasingPipelineBand`, flattened to one row per
// (state, Age Band) pair because a repository returns persistence-oriented rows, never the nested
// contract shape (`creating-a-server-repository.md`). The REST mapper folds these eight rows back
// into the two-state/four-band nesting the contract declares.
export interface WarehousePurchasingPipelineBandRead {
  readonly state: 'draft' | 'ready_for_ordering';
  readonly ageBand:
    | 'up_to_7_days'
    | 'from_8_to_14_days'
    | 'from_15_to_30_days'
    | 'over_30_days';
  readonly draftCount: number;
}

// sad.md §6.5 / data-model.md § "The read model" — the age a Purchase Draft's Age Band is measured
// from is two different columns in one statement: `created_at` for a Draft, `readied_at` once it is
// Ready for Ordering, so a draft readied yesterday after a month in Draft reads as a day old
// (AC-10).
const AGE_SOURCE_EXPRESSION =
  "CASE WHEN drafts.state = 'draft' THEN drafts.createdAt ELSE drafts.readiedAt END";

// data-model.md § "Time, timezone and the week" binds the Age Band's "today" to `APP_TIMEZONE`
// via `(now() AT TIME ZONE $tz)::date`, and the same cast is applied to the source timestamp so
// both sides of the subtraction fall on the same calendar day boundary.
const AGE_DAYS_EXPRESSION = `((now() AT TIME ZONE :timezone)::date - (${AGE_SOURCE_EXPRESSION} AT TIME ZONE :timezone)::date)`;

// The four Age Bands as a `CASE` over the derived age, computed entirely inside the statement
// (data-model.md § "Repository boundaries": "no repository returns a row set the use case then
// buckets in memory").
const AGE_BAND_EXPRESSION = `CASE
      WHEN ${AGE_DAYS_EXPRESSION} <= 7 THEN 'up_to_7_days'
      WHEN ${AGE_DAYS_EXPRESSION} <= 14 THEN 'from_8_to_14_days'
      WHEN ${AGE_DAYS_EXPRESSION} <= 30 THEN 'from_15_to_30_days'
      ELSE 'over_30_days'
    END`;

// A one-row-per-value derived table for each of the two enumerations this Panel counts over, so
// the cross join below produces all eight (state, Age Band) combinations regardless of what the
// Warehouse currently holds — a band with no draft in it reports 0 rather than being absent
// (`openapi.yaml` `PurchasingPipelineStateRow.bands`: "minItems: 4, maxItems: 4").
const OPEN_STATES_TABLE =
  "(SELECT unnest(ARRAY['draft', 'ready_for_ordering']::text[]) AS state)";
const AGE_BANDS_TABLE =
  "(SELECT unnest(ARRAY['up_to_7_days', 'from_8_to_14_days', 'from_15_to_30_days', 'over_30_days']::text[]) AS age_band)";

// AC-10/AC-11 — one statement over `purchase_drafts`, `state IN ('draft', 'ready_for_ordering')`
// only (AC-11: a Closed or Discarded draft is counted nowhere), counting drafts — never
// quantities — grouped by `state` and by Age Band. The eight (state, Age Band) rows are the
// statement's own cross join of the two open states against the four bands, left-joined to the
// grouped counts.
@Injectable()
export class WarehousePurchasingReadRepository {
  constructor(private readonly dataSource: DataSource) {}

  readPurchasingPipeline(
    warehouseId: string,
    timezone: string,
  ): Promise<WarehousePurchasingPipelineBandRead[]> {
    const manager = getEntityManager(this.dataSource);

    const bandedDraftCounts = manager
      .createQueryBuilder()
      .select('drafts.state', 'state')
      .addSelect(AGE_BAND_EXPRESSION, 'age_band')
      .addSelect('COUNT(*)::int', 'draft_count')
      .from(PurchaseDraftEntity, 'drafts')
      .where('drafts.warehouseId = :warehouseId')
      .andWhere("drafts.state IN ('draft', 'ready_for_ordering')")
      .groupBy('drafts.state')
      .addGroupBy(AGE_BAND_EXPRESSION)
      .getQuery();

    return (
      manager
        .createQueryBuilder()
        .select('states.state', 'state')
        .addSelect('bands.age_band', 'ageBand')
        .addSelect('COALESCE(counts.draft_count, 0)::int', 'draftCount')
        .from(OPEN_STATES_TABLE, 'states')
        // A comma-joined `addFrom` would put `bands` outside the ON-clause scope of the `leftJoin`
        // below (SQL's comma binds looser than `JOIN`, so `a, b LEFT JOIN c ON ...` cannot see `a`
        // from that ON clause) — an explicit always-true INNER JOIN cross-joins `bands` while
        // keeping both `states` and `bands` visible to the join that follows.
        .innerJoin(AGE_BANDS_TABLE, 'bands', '1 = 1')
        .leftJoin(
          `(${bandedDraftCounts})`,
          'counts',
          'counts.state = states.state AND counts.age_band = bands.age_band',
        )
        .setParameters({ warehouseId, timezone })
        .orderBy('states.state', 'ASC')
        .addOrderBy('bands.age_band', 'ASC')
        .getRawMany<WarehousePurchasingPipelineBandRead>()
    );
  }
}
