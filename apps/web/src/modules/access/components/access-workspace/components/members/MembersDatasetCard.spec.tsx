import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MembersDatasetCard } from 'modules/access/components/access-workspace/components/members/MembersDatasetCard';

import type { AccessMember } from 'modules/access/types/access.types';
import type { AccessDataset } from 'modules/access/utils/access-dataset';

// `new URL('./x', import.meta.url)` is rewritten by Vite into an asset URL, so
// the subject is resolved from this spec's own directory instead.
const source = readFileSync(
  posix.join(
    posix.dirname(fileURLToPath(import.meta.url)),
    'MembersDatasetCard.tsx',
  ),
  'utf8',
);

const member: AccessMember = {
  userId: '00000000-0000-4000-8000-000000000002',
  roleId: '00000000-0000-4000-8000-000000000012',
  roleKind: 'custom',
  email: 'member@example.test',
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
  items: AccessMember[],
  isError = false,
): AccessDataset<AccessMember> => {
  const unsettled = {
    items,
    isError,
    isFetching: true,
    isLoading: true,
    isReady: false,
  };

  return unsettled;
};

describe('MembersDatasetCard', () => {
  it('passes the card no loading contract (CR-AC-07)', () => {
    expect(source).not.toMatch(/loading/iu);
    expect(source).toContain('dataset.items.length === 0');
  });

  it('states that the Members read failed (CR-RG-05)', () => {
    render(<MembersDatasetCard dataset={dataset([], true)} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Members could not be loaded safely. Try again.',
    );
  });

  it('states that there are no Members when the dataset carries none (CR-RG-05)', () => {
    render(<MembersDatasetCard dataset={dataset([])} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'No members are available.',
    );
  });

  it('lists the Members it was given', () => {
    render(<MembersDatasetCard dataset={dataset([member])} />);

    expect(
      screen.getByRole('list', { name: 'Warehouse members' }),
    ).toHaveTextContent(member.userId);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
