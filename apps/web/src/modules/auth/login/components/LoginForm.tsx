import { Button, Input } from '@heroui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import {
  loginFormSchema,
  type LoginFormValues,
} from 'modules/auth/login/schemas/login-form.schema';

import type { ReactElement } from 'react';

type Props = {
  onSubmit: (values: LoginFormValues) => void | Promise<void>;
};

export const LoginForm = ({ onSubmit }: Props): ReactElement => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginFormSchema) });

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      className="flex max-w-sm flex-col gap-4 p-6"
    >
      <Input
        label="Email"
        type="text"
        isInvalid={Boolean(errors.email)}
        errorMessage={errors.email?.message}
        {...register('email')}
      />
      <Input
        label="Password"
        type="password"
        isInvalid={Boolean(errors.password)}
        errorMessage={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" color="primary" isLoading={isSubmitting}>
        Log in
      </Button>
    </form>
  );
};
