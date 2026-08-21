import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DatasetCard } from 'shared/components/DatasetCard';

// CR-AC-07 is a *structural* criterion — "when the file is read after this
// change" — so the contract is asserted against the source of the file this
// spec is colocated with, beside the behaviour CR-RG-05 fixes. One file owns
// both, so both stay here (`docs/system/guides/placing-web-tests.md` §1).
// `new URL('./x', import.meta.url)` is rewritten by Vite into an asset URL, so
// the subject is resolved from this spec's own directory instead.
const source = readFileSync(
  posix.join(posix.dirname(fileURLToPath(import.meta.url)), 'DatasetCard.tsx'),
  'utf8',
);

describe('DatasetCard', () => {
  it('declares no loading contract and keeps no skeleton helper (CR-AC-07)', () => {
    expect(source).not.toMatch(/loading/iu);
    expect(source).not.toContain('DatasetSkeleton');
    expect(source).not.toContain('Skeleton');
  });

  it('states the error before anything else, so a failed read is never read as content (CR-RG-05)', () => {
    render(
      <DatasetCard
        empty
        emptyLabel="No roles are available."
        error
        errorLabel="Roles could not be loaded safely. Try again."
        title="Roles"
      >
        <p>the list</p>
      </DatasetCard>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Roles could not be loaded safely. Try again.',
    );
    expect(
      screen.queryByText('No roles are available.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('the list')).not.toBeInTheDocument();
    expect(screen.getByText('Roles')).toBeInTheDocument();
  });

  it('states the empty case as a status message rather than an alert (CR-RG-05)', () => {
    render(
      <DatasetCard
        empty
        emptyLabel="No roles are available."
        error={false}
        errorLabel="Roles could not be loaded safely. Try again."
        title="Roles"
      >
        <p>the list</p>
      </DatasetCard>,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'No roles are available.',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('the list')).not.toBeInTheDocument();
  });

  it('renders its children when the dataset neither failed nor arrived empty', () => {
    render(
      <DatasetCard
        empty={false}
        emptyLabel="No roles are available."
        error={false}
        errorLabel="Roles could not be loaded safely. Try again."
        title="Roles"
      >
        <p>the list</p>
      </DatasetCard>,
    );

    expect(screen.getByText('the list')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
