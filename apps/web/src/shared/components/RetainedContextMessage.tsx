import { Alert, Button } from '@heroui/react';
import type { WorkspaceContext } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEnteredContext } from 'shared/hooks/projections/useEnteredContext';
import { useCurrentWorkspaceContext } from 'shared/hooks/queries/useWorkspacePermissions';
import { WarehouseIcon } from 'shared/icons';

// T19 — CR-RG-03's three retained messages, with their existing copy and
// intent. They accompany the grouped switcher rather than replacing it
// (CR-AC-18), but they are page-level content, not chrome: `RootLayout` mounts
// this once in the main content region above the routed outlet, where the
// switcher's own fixed-height header slot has room for nothing but its trigger
// (review-2026-08-13 finding 5).
//
// Mounting it on EVERY page is load-bearing, not incidental. The selection-
// ended message can only be shown by something that watched
// `effectiveWarehouseId` go non-null → null, and CR-AC-20 leaves the actor
// inside the Warehouse that was archived under them while that happens. A
// block mounted only at `/` would arrive after the fact — the value is already
// null wherever CR-AC-08 rule (3) lands — so it could never name the Warehouse
// and that message would be unreachable.
//
// `effectiveWarehouseId` is read here for exactly one thing: the existing
// trigger condition of these messages. It marks nothing and grants nothing,
// which is why this file, and not the switcher, is one of the three call sites
// the spec §6 allowlist names.

type RememberedWarehouse = { id: string; name: string };
type ContextWarehouse = WorkspaceContext['warehouses'][number];

/** Which of the three retained messages CR-RG-03 asks for. */
type RetainedMessageState =
  'noSelectableWarehouse' | 'nothingChosen' | 'selectionEnded';

const isSelectableWarehouse = (warehouse: ContextWarehouse): boolean =>
  warehouse.archivedAt === null;

/** CR-RG-03 — a retained message accompanies the control only while no context is entered, so an
 * actor inside W whose CR-AC-09 write never landed never reads "nothing chosen" beside the row
 * marked current. `kind` comes from the matched route tree, the same predicate the sidebar and the
 * drawer toggle read, so the three can never disagree about what is entered. */
const isMessageSuppressed = (
  enteredContextKind: string,
  effectiveWarehouseId: string | null,
): boolean => enteredContextKind !== 'none' || effectiveWarehouseId !== null;

/** A Warehouse whose selection ended is named first; otherwise CR-AC-18 separates the member who
 * holds a selectable membership from the one who holds none. */
const resolveMessageState = (
  lastSelected: RememberedWarehouse | null,
  warehouses: readonly ContextWarehouse[],
): RetainedMessageState => {
  if (lastSelected) {
    return 'selectionEnded';
  }

  return warehouses.some(isSelectableWarehouse)
    ? 'nothingChosen'
    : 'noSelectableWarehouse';
};

export const RetainedContextMessage = (): ReactElement | null => {
  const { t } = useTranslation('common');
  const { workspaceContext } = useCurrentWorkspaceContext();
  const enteredContext = useEnteredContext();
  const [lastSelected, setLastSelected] = useState<RememberedWarehouse | null>(
    null,
  );

  // `GET /workspace/context` returns `effectiveWarehouseId: null` for both
  // "never chosen" and "selection ended" — the contract carries no field
  // distinguishing them, and the Warehouse a withdrawn membership named can
  // vanish from `warehouses` entirely, so the only way to name it in this copy
  // is to remember it across a refetch.
  useEffect(() => {
    const activeId = workspaceContext?.effectiveWarehouseId;
    if (!activeId) {
      return;
    }
    const active = workspaceContext.warehouses.find(
      (warehouse) => warehouse.warehouseId === activeId,
    );
    if (active) {
      setLastSelected({ id: active.warehouseId, name: active.name });
    }
  }, [workspaceContext]);

  const onDismiss = (): void => setLastSelected(null);

  if (!workspaceContext) {
    return null;
  }

  if (
    isMessageSuppressed(
      enteredContext.kind,
      workspaceContext.effectiveWarehouseId,
    )
  ) {
    return null;
  }

  const { warehouses } = workspaceContext;

  // The message names the Warehouse it was remembering, so it is resolved here rather than built
  // inside the lookup, which evaluates every arm (`writing-web-conditional-components.md` §2).
  const selectionEndedTitle = t('workspaceSwitcher.selectionEnded.title', {
    name: lastSelected?.name,
  });
  const selectionEnded = (
    <Alert status="accent" role="alert" aria-label={selectionEndedTitle}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{selectionEndedTitle}</Alert.Title>
        <Alert.Description>
          {t('workspaceSwitcher.selectionEnded.description')}
        </Alert.Description>
      </Alert.Content>
      <div className="flex gap-2">
        <Button onPress={onDismiss}>
          {t('workspaceSwitcher.selectionEnded.choose')}
        </Button>
        <Button variant="outline" onPress={onDismiss}>
          {t('workspaceSwitcher.selectionEnded.dismiss')}
        </Button>
      </div>
    </Alert>
  );

  const message: Record<RetainedMessageState, ReactElement> = {
    selectionEnded,
    // CR-AC-18 — a member holding no selectable membership is told their access is unchanged; no
    // action is invented for them, because the grouped control above this message already lists
    // everything they hold.
    noSelectableWarehouse: (
      <div className="flex flex-col items-start gap-2">
        <WarehouseIcon />
        <h2 className="text-lg font-bold text-foreground">
          {t('workspaceSwitcher.unavailable.title')}
        </h2>
        <p className="text-sm text-muted">
          {t('workspaceSwitcher.unavailable.description')}
        </p>
      </div>
    ),
    nothingChosen: (
      <div className="flex flex-col items-start gap-2">
        <WarehouseIcon />
        <h2 className="text-lg font-bold text-foreground">
          {t('workspaceSwitcher.empty.title')}
        </h2>
        <p className="text-sm text-muted">
          {t('workspaceSwitcher.empty.description', {
            count: warehouses.length,
          })}
        </p>
      </div>
    ),
  };

  return message[resolveMessageState(lastSelected, warehouses)];
};
