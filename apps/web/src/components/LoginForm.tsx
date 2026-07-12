import { Button, Input } from '@heroui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useDispatch } from 'react-redux';
import { z } from 'zod';

import { setCredentials } from 'store/slices/authSlice';

import type React from 'react';
import type { AppDispatch } from 'store/index';

const loginSchema = z.object({
  email: z.string().email({ message: 'Enter a valid email address' }),
  password: z
    .string()
    .min(8, { message: 'Password must be at least 8 characters' }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const LoginForm = (): React.ReactElement => {
  const dispatch = useDispatch<AppDispatch>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = (values: LoginFormValues): void => {
    dispatch(
      setCredentials({ user: { email: values.email }, token: 'mock-token' }),
    );
  };

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

export default LoginForm;
