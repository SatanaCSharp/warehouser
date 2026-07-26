import { useNavigate } from '@tanstack/react-router';

import { signIn } from 'modules/auth/api/auth-api';
import { LoginForm } from 'modules/auth/login/components/LoginForm';
import { ROUTES } from 'shared/constants/routes';
import { useAppDispatch } from 'store/hooks';
import { authBecameAuthenticated } from 'store/slices/authSlice';

import type { LoginFormValues } from 'modules/auth/login/schemas/login-form.schema';
import type { ReactElement } from 'react';

export const LoginPage = (): ReactElement => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const handleSubmit = async (values: LoginFormValues): Promise<void> => {
    const result = await signIn(values);
    dispatch(authBecameAuthenticated(result.user));
    await navigate({ to: ROUTES.HOME });
  };

  return <LoginForm onSubmit={handleSubmit} />;
};
