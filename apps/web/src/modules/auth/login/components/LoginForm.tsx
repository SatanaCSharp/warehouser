import { Button } from '@heroui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import type { LoginFormValues } from 'modules/auth/login/schemas/login-form.schema';
import { loginFormSchema } from 'modules/auth/login/schemas/login-form.schema';
import type { ReactElement, SubmitEvent } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormTextField } from 'shared/components/FormTextField';
import { PasswordInput } from 'shared/components/PasswordInput';

type Props = {
  onSubmit: (values: LoginFormValues) => void | Promise<void>;
};

/** The message a refused field shows: its rule translated, or — for the email — the refusal the
 * server named, which has no rule of its own. `undefined` where the field was not refused at all. */
const fieldMessage = (
  error: { message?: string } | undefined,
  translateValidation: (key: string) => string,
  fallback?: string,
): string | undefined =>
  error?.message ? translateValidation(error.message) : fallback;

/** One label for the button and its accessible name, so the two can never disagree. */
const submitLabelOf = (
  isSubmitting: boolean,
  t: (key: string) => string,
): string => (isSubmitting ? t('form.submitting') : t('form.submit'));

export const LoginForm = ({ onSubmit }: Props): ReactElement => {
  const { t } = useTranslation('sign-in');
  const { t: translateValidation } = useTranslation('validation');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    shouldFocusError: true,
  });

  const submitLabel = submitLabelOf(isSubmitting, t);

  // `handleSubmit` returns a promise the DOM handler must not; discarding it
  // here keeps the rejection with React Hook Form, which already owns it.
  const onSubmitForm = (event: SubmitEvent<HTMLFormElement>): void =>
    void handleSubmit(onSubmit)(event);

  return (
    <form onSubmit={onSubmitForm} className="flex flex-col gap-4" noValidate>
      <FormTextField
        label={t('form.email.label')}
        placeholder={t('form.email.placeholder')}
        description={t('form.email.help')}
        type="email"
        autoComplete="email"
        isDisabled={isSubmitting}
        isInvalid={Boolean(errors.email)}
        errorMessage={fieldMessage(errors.email, translateValidation)}
        {...register('email')}
      />
      <PasswordInput
        label={t('form.password.label')}
        placeholder={t('form.password.placeholder')}
        description={t('form.password.help')}
        autoComplete="current-password"
        isDisabled={isSubmitting}
        isInvalid={Boolean(errors.password)}
        errorMessage={fieldMessage(errors.password, translateValidation)}
        hideLabel={t('form.password.hide')}
        showLabel={t('form.password.show')}
        hideText={t('form.password.hideShort')}
        showText={t('form.password.showShort')}
        {...register('password')}
      />
      <Button
        type="submit"
        aria-label={submitLabel}
        variant="primary"
        className="min-h-11 w-full font-semibold"
        isPending={isSubmitting}
        isDisabled={isSubmitting}
      >
        {submitLabel}
      </Button>
    </form>
  );
};
