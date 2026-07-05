import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { IUser } from "@warehouser/shared-types";

export interface AuthState {
  user: IUser | null;
  token: string | null;
}

const initialState: AuthState = { user: null, token: null };

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials(state, action: PayloadAction<{ user: IUser; token: string }>) {
      state.user = action.payload.user;
      state.token = action.payload.token;
    },
    clearCredentials(state) {
      state.user = null;
      state.token = null;
    }
  }
});

export const { setCredentials, clearCredentials } = authSlice.actions;
export default authSlice.reducer;
