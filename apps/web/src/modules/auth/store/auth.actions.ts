import type { CaseReducer, PayloadAction } from '@reduxjs/toolkit';
import type { AuthState, AuthUser } from 'modules/auth/store/auth.slice';

const authBecameAnonymous: CaseReducer<AuthState> = (state) => {
  state.status = 'anonymous';
  state.user = null;
};

const authBecameAuthenticated: CaseReducer<
  AuthState,
  PayloadAction<AuthUser>
> = (state, action) => {
  state.status = 'authenticated';
  state.user = action.payload;
};

export const authActions = {
  authBecameAnonymous,
  authBecameAuthenticated,
};
