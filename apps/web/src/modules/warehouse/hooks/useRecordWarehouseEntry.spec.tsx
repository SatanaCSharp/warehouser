import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useRecordWarehouseEntry } from 'modules/warehouse/hooks/useRecordWarehouseEntry';
import { toast } from 'shared/alerts/toast';
import { makeStore } from 'store';
import { accessIds } from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type { ReactElement } from 'react';

// T8 / CR-AC-09 — `useRecordWarehouseEntry` writes the entered Warehouse as
// the actor's stored selection through the existing `setActiveWarehouse`
// endpoint, only when it differs from `effectiveWarehouseId` (the only
// stored selection the web can observe). The write is fire-and-forget: it
// must never block rendering, and a rejection must never surface an alert or
// retry.
vi.mock('shared/alerts/toast', () => ({
  toast: { danger: vi.fn() },
}));

const warehouseId = accessIds.warehouse;
const otherWarehouseId = accessIds.otherWarehouse;

const contextPath = '/api/v1/workspace/context';
const activeWarehousePath = '/api/v1/workspace/active-warehouse';

const requestUrl = (input: RequestInfo | URL): string =>
  input instanceof Request ? input.url : String(input);

const requestMethod = (
  input: Request | string | URL,
  init?: RequestInit,
): string => init?.method ?? (input instanceof Request ? input.method : 'GET');

/** Every request this file stubs sends a JSON string body via `JSON.stringify`. */
const parsedBody = (body: BodyInit | null | undefined): unknown =>
  typeof body === 'string' ? JSON.parse(body) : undefined;

const workspaceContext = (
  effectiveWarehouseId: string | null,
): Record<string, unknown> => ({
  workspace: { id: accessIds.workspace, name: 'Acme Logistics' },
  workspacePermissionIds: [],
  warehouses: [],
  effectiveWarehouseId,
});

type StubOptions = {
  effectiveWarehouseId: string | null;
  writeStatus?: number;
};

const stubServer = ({
  effectiveWarehouseId,
  writeStatus = 200,
}: StubOptions): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn(
    (input: Request | string | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = requestMethod(input, init);

      if (url === contextPath && method === 'GET') {
        return Promise.resolve(
          Response.json(workspaceContext(effectiveWarehouseId)),
        );
      }

      if (url === activeWarehousePath && method === 'PUT') {
        if (writeStatus !== 200) {
          return Promise.resolve(
            Response.json({ code: 'api.unexpected' }, { status: writeStatus }),
          );
        }
        const body = parsedBody(init?.body);
        const writtenId =
          typeof body === 'object' && body !== null && 'warehouseId' in body
            ? (body as { warehouseId: string }).warehouseId
            : null;
        return Promise.resolve(
          Response.json({ effectiveWarehouseId: writtenId }),
        );
      }

      return Promise.resolve(Response.json({}, { status: 404 }));
    },
  );

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const writeCalls = (fetchMock: ReturnType<typeof vi.fn>): unknown[] =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      requestUrl(input as RequestInfo | URL) === activeWarehousePath &&
      requestMethod(
        input as Request | string | URL,
        init as RequestInit | undefined,
      ) === 'PUT',
  );

const contextRequested = (fetchMock: ReturnType<typeof vi.fn>): boolean =>
  fetchMock.mock.calls.some(
    ([input]) => requestUrl(input as RequestInfo | URL) === contextPath,
  );

const Probe = (): ReactElement => {
  useRecordWarehouseEntry();
  return <div data-testid="rendered">rendered</div>;
};

describe('useRecordWarehouseEntry', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('writes nothing on first render when the entered Warehouse is already the effective selection', async () => {
    const fetchMock = stubServer({ effectiveWarehouseId: warehouseId });
    renderInEnteredWarehouse(<Probe />, makeStore(), warehouseId);

    await screen.findByTestId('rendered');
    await waitFor(() => expect(contextRequested(fetchMock)).toBe(true));
    expect(writeCalls(fetchMock)).toEqual([]);
  });

  it('writes nothing again re-entering (remounting) the Warehouse the effective value already names', async () => {
    const fetchMock = stubServer({ effectiveWarehouseId: warehouseId });
    const store = makeStore();

    const first = renderInEnteredWarehouse(<Probe />, store, warehouseId);
    await first.findByTestId('rendered');
    await waitFor(() => expect(contextRequested(fetchMock)).toBe(true));
    expect(writeCalls(fetchMock)).toEqual([]);
    first.unmount();

    const second = renderInEnteredWarehouse(<Probe />, store, warehouseId);
    await second.findByTestId('rendered');
    expect(writeCalls(fetchMock)).toEqual([]);
  });

  it('issues exactly one write when entering a Warehouse that differs from the effective selection', async () => {
    const fetchMock = stubServer({ effectiveWarehouseId: otherWarehouseId });
    renderInEnteredWarehouse(<Probe />, makeStore(), warehouseId);

    await waitFor(() => expect(writeCalls(fetchMock)).toHaveLength(1));
    const [, init] = writeCalls(fetchMock)[0] as [unknown, RequestInit];
    expect(parsedBody(init.body)).toEqual({ warehouseId });

    // Stays at exactly one write once everything has settled.
    await screen.findByTestId('rendered');
    expect(writeCalls(fetchMock)).toHaveLength(1);
  });

  it('renders without waiting for the write to resolve', async () => {
    const fetchMock = vi.fn(
      (input: Request | string | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        const method = requestMethod(input, init);
        if (url === contextPath && method === 'GET') {
          return Promise.resolve(
            Response.json(workspaceContext(otherWarehouseId)),
          );
        }
        if (url === activeWarehousePath && method === 'PUT') {
          // Never resolves — proves rendering does not wait on the write.
          return new Promise<Response>(() => {});
        }
        return Promise.resolve(Response.json({}, { status: 404 }));
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    renderInEnteredWarehouse(<Probe />, makeStore(), warehouseId);

    expect(await screen.findByTestId('rendered')).toBeInTheDocument();
  });

  it('leaves the Warehouse view rendered and raises no alert when the write is rejected, and does not retry', async () => {
    const fetchMock = stubServer({
      effectiveWarehouseId: otherWarehouseId,
      writeStatus: 500,
    });
    renderInEnteredWarehouse(<Probe />, makeStore(), warehouseId);

    await waitFor(() => expect(writeCalls(fetchMock)).toHaveLength(1));
    expect(screen.getByTestId('rendered')).toBeInTheDocument();
    expect(toast.danger).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(writeCalls(fetchMock)).toHaveLength(1);
  });
});
