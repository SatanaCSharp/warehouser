import type { AuthStatus, AuthUser } from 'modules/auth/store/auth.slice';
import type { RootState } from 'store';

export const selectAuthStatus = (state: RootState): AuthStatus =>
  state.auth.status;
export const selectCurrentUser = (state: RootState): AuthUser | null =>
  state.auth.user;
export const selectIsAuthenticated = (state: RootState): boolean =>
  selectAuthStatus(state) === 'authenticated';
