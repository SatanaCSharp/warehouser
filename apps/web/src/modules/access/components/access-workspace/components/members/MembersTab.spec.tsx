import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { accessApi } from 'modules/access/api/access-api';
import { MembersTab } from 'modules/access/components/access-workspace/components/members/MembersTab';
import { loadAccessSurface } from 'modules/access/loaders/access-surface.loader';
import { authBecameAnonymous } from 'modules/auth/store/auth.slice';
import { api } from 'shared/api/client/api-client';
import {
  accessIds,
  accessMembers,
  accessPath,
  authenticatedStore,
  failAccessRead,
  stubAccessServer,
} from 'test/access-fixtures';
import { selectHeroOption } from 'test/hero-select';
import { renderInEnteredWarehouse } from 'test/render';

import type { AppStore } from 'store';

const changeMemberEmail = vi.hoisted(() => vi.fn());
const changeMemberPassword = vi.hoisted(() => vi.fn());
const createMember = vi.hoisted(() => vi.fn());
const deleteMember = vi.hoisted(() => vi.fn());

// The components trigger the generated hooks directly, so the mutations are
// stubbed at the endpoint that declares them. Everything else in the slice —
// the reads this tab renders from — stays real and is served by
// `stubAccessServer`.
vi.mock('modules/access/api/access-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('modules/access/api/access-api')>()),
  useChangeMemberEmailMutation: () => [changeMemberEmail, {}],
  useChangeMemberPasswordMutation: () => [changeMemberPassword, {}],
  useCreateMemberMutation: () => [createMember, {}],
  useDeleteMemberMutation: () => [deleteMember, {}],
}));

// `new URL('./x', import.meta.url)` is rewritten by Vite into an asset URL, so
// the subject is resolved from this spec's own directory instead.
const source = readFileSync(
  posix.join(posix.dirname(fileURLToPath(import.meta.url)), 'MembersTab.tsx'),
  'utf8',
);

/**
 * The store the route hands its destination: the shipped loader has already
 * filled every dataset the tab paints (CR-AC-04), so the first render is the
 * one the actor sees. A spec that skipped this would mount a tree whose reads
 * are still out — a state the route no longer produces, and one this tab
 * stopped branching on when its readiness term was removed (CR-AC-15).
 *
 * It settles rather than rejects on a failed dataset (CH-15), so a case may
 * pair it with `failAccessRead` to arrange CR-AC-15 exactly: the primary read
 * succeeded, one dataset did not, and the destination still paints.
 */
const loadAccessSurfaceInto = async (store: AppStore): Promise<void> =>
  loadAccessSurface({
    context: { store, status: 'entered', warehouseId: accessIds.warehouse },
  });

const renderMembersTab = async (
  options: Parameters<typeof stubAccessServer>[0] = {},
  store: AppStore = authenticatedStore(),
): Promise<void> => {
  stubAccessServer(options);
  await loadAccessSurfaceInto(store);
  renderInEnteredWarehouse(<MembersTab />, store);
  await screen.findByLabelText('Search members');
};

/**
 * Holds the next members read open, so a spec can assert what is on screen
 * *while* the refetch is in flight rather than after it has settled.
 */
const holdMembersRead = (): { memberReads: string[]; release: () => void } => {
  const memberReads: string[] = [];
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = (): void => resolve();
  });
  const membersUrl = accessPath(accessIds.warehouse, 'members');

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request | string | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === membersUrl) {
        memberReads.push(url);
        await held;
      }
      return Response.json({
        hasNext: false,
        hasPrev: false,
        nextCursor: null,
        items: accessMembers,
      });
    }),
  );

  return { memberReads, release };
};

/**
 * Records every commit in which the painted member rows are gone or a waiting
 * affordance stands in their place. A point-in-time assertion cannot see a
 * skeleton that appears and disappears between two awaits; this can, which is
 * what makes CR-AC-10 falsifiable rather than merely timed well.
 */
const watchPaintedRows = (): { losses: string[]; stop: () => void } => {
  const losses: string[] = [];
  const observer = new MutationObserver(() => {
    if (
      screen.queryByRole('listitem', { name: /member@example\.test/u }) === null
    ) {
      losses.push('the painted rows were removed');
    }
    if (screen.queryByLabelText('Loading members') !== null) {
      losses.push('a skeleton was painted over the rows');
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return { losses, stop: (): void => observer.disconnect() };
};

/**
 * Lets React commit everything the refetch has already scheduled. Its scheduler
 * commits on a later task than the one the request went out on, so a state the
 * tree renders *only* while the request is out is not on screen the moment the
 * request leaves — an assertion made before this would read a stale tree and
 * pass over a skeleton that was about to appear.
 */
const flushRenders = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 80);
    });
  });
};

const openRowMenu = async (
  user: ReturnType<typeof userEvent.setup>,
): Promise<HTMLElement> => {
  const row = await screen.findByRole('listitem', {
    name: /member@example\.test/u,
  });
  const trigger = within(row).getByRole('button', {
    name: 'Actions for member@example.test',
  });
  await user.click(trigger);
  return trigger;
};

// This suite keeps every Members workflow together so each assertion exercises
// the same rendered tab.
describe('MembersTab', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates a member through the Create Member dialog when authorized (AC-01, AC-03)', async () => {
    const user = userEvent.setup();
    createMember.mockResolvedValue({ data: null });
    await renderMembersTab({
      permissionIds: [PermissionId.USERS_WATCH, PermissionId.USERS_CREATE],
    });

    await user.click(screen.getByRole('button', { name: 'Create member' }));
    const dialog = screen.getByRole('dialog', { name: 'Create member' });
    await user.type(
      within(dialog).getByLabelText('Email'),
      'new.member@example.test',
    );
    await user.type(
      within(dialog).getByLabelText('Initial password'),
      'a-strong-password',
    );
    await selectHeroOption(
      user,
      within(dialog).getByRole('button', { name: /Role/u }),
      'Picker',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Create member' }),
    );

    expect(createMember).toHaveBeenCalledWith({
      warehouseId: accessIds.warehouse,
      input: {
        email: 'new.member@example.test',
        password: 'a-strong-password',
        roleId: accessIds.pickerRole,
      },
    });
  });

  it('hides the Create Member trigger without the USERS:CREATE permission (AC-03)', async () => {
    await renderMembersTab({ permissionIds: [PermissionId.USERS_WATCH] });

    expect(
      screen.queryByRole('button', { name: 'Create member' }),
    ).not.toBeInTheDocument();
  });

  it('changes a member email through the Edit Email dialog when authorized (AC-04)', async () => {
    const user = userEvent.setup();
    changeMemberEmail.mockResolvedValue({ data: null });
    await renderMembersTab();

    await openRowMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Edit email' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Edit email for member@example.test',
    });
    await user.type(
      within(dialog).getByLabelText('New email'),
      'member.new@example.test',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Save email' }),
    );

    expect(changeMemberEmail).toHaveBeenCalledWith({
      warehouseId: accessIds.warehouse,
      userId: accessIds.member,
      input: { email: 'member.new@example.test' },
    });
  });

  it('returns focus to the kebab trigger once the Edit Email dialog is dismissed', async () => {
    const user = userEvent.setup();
    await renderMembersTab();

    const trigger = await openRowMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Edit email' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Edit email for member@example.test',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('resets a member password through the Reset Password dialog when authorized (AC-06)', async () => {
    const user = userEvent.setup();
    changeMemberPassword.mockResolvedValue({ data: null });
    await renderMembersTab();

    await openRowMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Reset password' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Reset password for member@example.test',
    });
    await user.type(
      within(dialog).getByLabelText('New password'),
      'a-new-strong-password',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Reset password' }),
    );

    expect(changeMemberPassword).toHaveBeenCalledWith({
      warehouseId: accessIds.warehouse,
      userId: accessIds.member,
      input: { password: 'a-new-strong-password' },
    });
  });

  it('deletes a member after confirmation through the delete dialog when authorized (AC-08)', async () => {
    const user = userEvent.setup();
    deleteMember.mockResolvedValue({ data: null });
    await renderMembersTab();

    await openRowMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Delete member' }));
    // The confirmation validates nothing, so it is an `AlertDialog`
    // (`docs/system/guides/web-dialogs.md`) and announces itself as one.
    const dialog = screen.getByRole('alertdialog', {
      name: 'Delete member@example.test',
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete member' }),
    );

    expect(deleteMember).toHaveBeenCalledWith({
      warehouseId: accessIds.warehouse,
      userId: accessIds.member,
    });
  });

  it('hides the kebab trigger entirely when the actor holds no per-row action permission', async () => {
    await renderMembersTab({ permissionIds: [PermissionId.USERS_WATCH] });

    const row = screen.getByRole('listitem', { name: /member@example\.test/u });
    expect(
      within(row).queryByRole('button', {
        name: 'Actions for member@example.test',
      }),
    ).not.toBeInTheDocument();
  });

  // CR-RG-01, the merge blocker. `SignOutButton.tsx:26-27` dispatches
  // `authBecameAnonymous()` *before* awaiting `navigate`, so the actor is
  // unresolved while this list is still mounted and painted. The skeleton that
  // used to hide that window is gone (CH-11); what replaces it is the type —
  // `actorUserId` is `string | undefined` and a row withholds every destructive
  // control while it is undefined. This case drives that window specifically:
  // `requireAuth` covers route entry, not this teardown.
  it('renders no row as not-self and offers no destructive control once the actor becomes anonymous mid-session (CR-RG-01)', async () => {
    const store = authenticatedStore(accessIds.member);
    await renderMembersTab({}, store);
    const ownRow = (): HTMLElement =>
      screen.getByRole('listitem', { name: /member@example\.test/u });
    // The actor's own row is painted, and painted as self, before the window
    // opens — without this the assertions below could pass on an empty list.
    expect(within(ownRow()).getByText('You')).toBeInTheDocument();

    act(() => {
      store.dispatch(authBecameAnonymous());
    });

    // The rows the actor is reading stay on screen …
    expect(ownRow()).toBeInTheDocument();
    expect(
      screen.getByRole('listitem', { name: /manager@example\.test/u }),
    ).toBeInTheDocument();
    // … and none of them is offered against an unresolved actor id: the
    // actions menu is the whole not-self rendering, and no row carries one.
    expect(within(ownRow()).queryByRole('button')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Actions for/u }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  // CR-AC-10's component-level clause. Its route-level clause — that the loader
  // does not re-run and `RoutePendingState` never mounts — is pinned in
  // `test/route-readiness/`, which deliberately leaves this half to the tab that
  // owns the subscriber.
  it('leaves the painted rows on screen while a background refetch of the members tag is in flight (CR-AC-10)', async () => {
    const store = authenticatedStore();
    await renderMembersTab({}, store);
    const memberRow = (): HTMLElement | null =>
      screen.queryByRole('listitem', { name: /member@example\.test/u });
    // The cache entry's own status is what says the request is out; the
    // hook-only `isFetching` flag is not on this selector's result.
    const membersRequestStatus = (): string =>
      accessApi.endpoints.listAccessMembers.select(accessIds.warehouse)(
        store.getState(),
      ).status;
    expect(memberRow()).toBeInTheDocument();

    // The refetch is held open so the in-flight window is a real one; resolved
    // immediately it would prove nothing about what is on screen while the
    // request is out.
    const refetch = holdMembersRead();
    const painted = watchPaintedRows();

    act(() => {
      store.dispatch(
        api.util.invalidateTags([
          { type: 'AccessMembers', id: accessIds.warehouse },
        ]),
      );
    });
    // The mounted tab is the subscriber RTK Query refetches in place, so the
    // invalidation genuinely reaches the network — without this the case would
    // prove only that nothing happened at all.
    await waitFor(() => expect(refetch.memberReads).toHaveLength(1));
    await flushRenders();
    expect(membersRequestStatus()).toBe('pending');
    expect(memberRow()).toBeInTheDocument();
    expect(screen.queryByLabelText('Loading members')).not.toBeInTheDocument();

    refetch.release();
    await waitFor(() => expect(membersRequestStatus()).toBe('fulfilled'));
    await flushRenders();
    painted.stop();

    // The rows the actor was reading were on screen for every commit from the
    // invalidation until the new data arrived.
    expect(painted.losses).toEqual([]);
    expect(memberRow()).toBeInTheDocument();
  });

  it('hides destructive controls and shows a You chip on the actor’s own row (AC-11/18)', async () => {
    await renderMembersTab({}, authenticatedStore(accessIds.member));

    const row = screen.getByRole('listitem', { name: /member@example\.test/u });
    expect(within(row).getByText('You')).toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });
});

// The two arms this tab keeps once its readiness term is gone: the permission
// arm and the error arm. They are grouped apart from the workflows because they
// arrange a *failed* read rather than the served one every workflow case
// renders against.
describe('MembersTab dataset arms', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  // CR-AC-15's falsifier. The `!members.isReady` term is what reaches
  // `MembersDatasetCard` — the only renderer of the Members error — today.
  // Dropping it in favour of the permission term alone would send this
  // permitted actor into `MemberDirectory` with `items: []` and tell them no
  // Members exist.
  it('states that the Members read failed rather than that there are none, for a permitted actor (CR-AC-15)', async () => {
    stubAccessServer();
    failAccessRead('members');
    const store = authenticatedStore();
    await loadAccessSurfaceInto(store);
    renderInEnteredWarehouse(<MembersTab />, store);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Members could not be loaded safely. Try again.',
    );
    // Neither the administration directory nor the empty message: a failed read
    // is not an empty one.
    expect(screen.queryByLabelText('Search members')).not.toBeInTheDocument();
    expect(
      screen.queryByText('No members are available.'),
    ).not.toBeInTheDocument();
  });

  it('branches on permission and error alone, never on readiness (CR-AC-15)', () => {
    expect(source).not.toMatch(/is(?:Ready|Loading|Fetching)/u);
    expect(source).toContain('members.isError');
  });
});
