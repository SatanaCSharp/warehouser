import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RolesDatasetCard } from 'modules/access/components/access-workspace/components/roles/RolesDatasetCard';

import type { AccessRole } from 'modules/access/types/access.types';
import type { AccessDataset } from 'modules/access/utils/access-dataset';

// `new URL('./x', import.meta.url)` is rewritten by Vite into an asset URL, so
// the subject is resolved from this spec's own directory instead.
const source = readFileSync(
  posix.join(
    posix.dirname(fileURLToPath(import.meta.url)),
    'RolesDatasetCard.tsx',
  ),
  'utf8',
);

const pickerRole: AccessRole = {
  id: '00000000-0000-4000-8000-000000000012',
  kind: 'custom',
  name: 'Picker',
  permissionIds: [],
  assignedMemberCount: 1,
};

/**
 * A dataset whose readiness fields still carry the values that *used* to
 * suppress the card's message — mid-load and never ready. Nothing the card
 * renders may depend on them any more, so every case below states its copy in
 * spite of them. The three fields are CH-09's to delete from `AccessDataset`;
 * this helper returns a variable rather than a literal so their removal leaves
 * it compiling untouched.
 */
const dataset = (
  items: AccessRole[],
  isError = false,
): AccessDataset<AccessRole> => {
  const unsettled = {
    items,
    isError,
    isFetching: true,
    isLoading: true,
    isReady: false,
  };

  return unsettled;
};

describe('RolesDatasetCard', () => {
  it('passes the card no loading contract (CR-AC-07)', () => {
    expect(source).not.toMatch(/loading/iu);
    expect(source).toContain('dataset.items.length === 0');
  });

  it('states that the Roles read failed (CR-RG-05)', () => {
    render(<RolesDatasetCard dataset={dataset([], true)} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Roles could not be loaded safely. Try again.',
    );
  });

  it('states that there are no Roles when the dataset carries none (CR-RG-05)', () => {
    render(<RolesDatasetCard dataset={dataset([])} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'No roles are available.',
    );
  });

  it('lists the Roles it was given', () => {
    render(<RolesDatasetCard dataset={dataset([pickerRole])} />);

    expect(
      screen.getByRole('list', { name: 'Warehouse roles' }),
    ).toHaveTextContent('Picker');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
