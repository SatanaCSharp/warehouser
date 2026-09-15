import { render, screen } from '@testing-library/react';
import type { WarehouseEntryRefusalProps } from 'shared/components/WarehouseEntryRefusal';
import { WarehouseEntryRefusal } from 'shared/components/WarehouseEntryRefusal';
import { describe, expect, it } from 'vitest';

// CR-AC-07 / CR-AC-17 — the two refusal reasons `WarehouseEntryVerdict.reason`
// (guards/warehouse-entry.guard.ts) can carry. This component is the state
// block T4's `WarehouseLayout` renders instead of `<Outlet />` whenever entry
// is refused.

const disclosingWords = [
  /warehouse/iu,
  /\bid\b/iu,
  /identifier/iu,
  /exist/iu,
  /\brole\b/iu,
  /member/iu,
  /record/iu,
];

describe('WarehouseEntryRefusal', () => {
  describe('reason="not-a-member"', () => {
    // CR-AC-07 — the refusal must read identically whatever Warehouse was
    // addressed. The component's props admit no identifier, so the guarantee
    // is structural; this pins it against a future change that adds one and
    // interpolates it. Passing the id through a cast is the point: even when a
    // caller supplies one, it must never reach the rendered output.
    it('renders identical output whatever warehouse id a caller passes (CR-AC-07 non-disclosure)', () => {
      const renderWith = (extraProps: object): string => {
        const props = {
          reason: 'not-a-member',
          ...extraProps,
        } as WarehouseEntryRefusalProps;
        const { container, unmount } = render(
          <WarehouseEntryRefusal {...props} />,
        );
        const text = container.textContent ?? '';
        unmount();
        return text;
      };

      const withoutId = renderWith({});
      const withWellFormedId = renderWith({
        warehouseId: '3f1b7c4e-59a2-4d6f-8b21-9c0e5a7d4e18',
      });
      const withMalformedId = renderWith({ warehouseId: 'not-a-uuid-at-all' });

      expect(withWellFormedId).toEqual(withoutId);
      expect(withMalformedId).toEqual(withoutId);
      expect(withoutId).not.toMatch(/3f1b7c4e|not-a-uuid-at-all/u);
    });

    it('names no Warehouse, id, existence, Role, member or record', () => {
      const { container } = render(
        <WarehouseEntryRefusal reason="not-a-member" />,
      );

      for (const pattern of disclosingWords) {
        expect(container.textContent).not.toMatch(pattern);
      }
    });

    it('does not render any Warehouse content or a navigation list', () => {
      render(<WarehouseEntryRefusal reason="not-a-member" />);

      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });

    it('points at the context switcher as the way out', () => {
      render(<WarehouseEntryRefusal reason="not-a-member" />);

      expect(screen.getByText(/switcher/iu)).toBeInTheDocument();
    });
  });

  describe('reason="archived"', () => {
    it('names the archived state and nothing further', () => {
      render(<WarehouseEntryRefusal reason="archived" />);

      expect(
        screen.getByRole('heading', { name: /archived/iu }),
      ).toBeInTheDocument();
      for (const pattern of [/\brole\b/iu, /member/iu, /record/iu]) {
        expect(document.body.textContent).not.toMatch(pattern);
      }
    });

    it('does not render any Warehouse content or a navigation list', () => {
      render(<WarehouseEntryRefusal reason="archived" />);

      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });

    it('points at the context switcher as the way out', () => {
      render(<WarehouseEntryRefusal reason="archived" />);

      expect(screen.getByText(/switcher/iu)).toBeInTheDocument();
    });
  });
});
