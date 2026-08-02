import { createSlice } from '@reduxjs/toolkit';

import { authActions } from 'modules/auth/store/auth.actions';

export type AuthStatus = 'anonymous' | 'authenticated' | 'unknown';
export type AuthUser = { id: string };

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
}

const initialState: AuthState = { status: 'unknown', user: null };

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: authActions,
});

export const { authBecameAnonymous, authBecameAuthenticated } =
  authSlice.actions;
export const authReducer = authSlice.reducer;
