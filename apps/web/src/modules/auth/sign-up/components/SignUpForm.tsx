import { Button } from '@heroui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link as RouterLink } from '@tanstack/react-router';
import type { SignUpFormValues } from 'modules/auth/sign-up/schemas/sign-up-form.schema';
import { signUpFormSchema } from 'modules/auth/sign-up/schemas/sign-up-form.schema';
import type { ReactElement, SubmitEvent } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Conditional } from 'shared/components/Conditional';
import { FormTextField } from 'shared/components/FormTextField';
import { PasswordInput } from 'shared/components/PasswordInput';
import { ROUTES } from 'shared/constants/routes';

type Props = {
  emailError?: string;
  onSubmit: (values: SignUpFormValues) => void | Promise<void>;
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

export const SignUpForm = ({ emailError, onSubmit }: Props): ReactElement => {
  const { t } = useTranslation('sign-up');
  const { t: translateValidation } = useTranslation('validation');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpFormSchema),
    shouldFocusError: true,
  });
  const emailMessage = fieldMessage(
    errors.email,
    translateValidation,
    emailError,
  );
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
        isInvalid={Boolean(emailMessage)}
        errorMessage={emailMessage}
        {...register('email')}
      />
      <Conditional when={emailError}>
        <RouterLink to={ROUTES.LOGIN} className="link text-accent">
          {t('duplicate.signIn')}
        </RouterLink>
      </Conditional>
      <PasswordInput
        label={t('form.password.label')}
        placeholder={t('form.password.placeholder')}
        description={t('form.password.help')}
        autoComplete="new-password"
        isDisabled={isSubmitting}
        isInvalid={Boolean(errors.password)}
        errorMessage={fieldMessage(errors.password, translateValidation)}
        hideLabel={t('form.password.hide')}
        showLabel={t('form.password.show')}
        hideText={t('form.password.hideShort')}
        showText={t('form.password.showShort')}
        {...register('password')}
      />
      <FormTextField
        label={t('form.warehouseName.label')}
        placeholder={t('form.warehouseName.placeholder')}
        description={t('form.warehouseName.help')}
        autoComplete="organization"
        isDisabled={isSubmitting}
        isInvalid={Boolean(errors.warehouseName)}
        errorMessage={fieldMessage(errors.warehouseName, translateValidation)}
        {...register('warehouseName')}
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
