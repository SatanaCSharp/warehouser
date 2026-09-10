import {
  Description,
  FieldError,
  Input,
  Label,
  TextField,
} from '@heroui/react';
import type {
  ComponentProps,
  ComponentPropsWithoutRef,
  ReactNode,
} from 'react';
import { forwardRef } from 'react';
import { Conditional } from 'shared/components/Conditional';

/**
 * HeroUI v3 splits a text field into `TextField` + `Label` + `Input` +
 * `Description` + `FieldError`. This wraps that composition behind one call so
 * the forms keep passing `label`/`description`/`errorMessage`, and so the ref
 * `register()` hands us lands on the `<input>` rather than on the field
 * wrapper.
 */
type FormTextFieldProps = Pick<
  ComponentProps<typeof TextField>,
  | 'className'
  | 'defaultValue'
  | 'isDisabled'
  | 'isInvalid'
  | 'isRequired'
  | 'type'
  | 'validationBehavior'
> &
  Pick<
    ComponentPropsWithoutRef<'input'>,
    | 'autoComplete'
    | 'autoFocus'
    | 'name'
    | 'onBlur'
    | 'onChange'
    | 'placeholder'
  > & {
    /**
     * An element elsewhere on screen that explains this field — typically the
     * one sentence a surface states once for a whole group rather than
     * repeating into every field's own caption
     * (design-handoff.md §Accessibility). React Aria's `useField` composes it
     * with the `Description` below rather than replacing it, so the field
     * announces both.
     */
    'aria-describedby'?: string;
    description?: ReactNode;
    errorMessage?: ReactNode;
    label: ReactNode;
  };

export const FormTextField = forwardRef<HTMLInputElement, FormTextFieldProps>(
  (
    {
      'aria-describedby': ariaDescribedBy,
      autoComplete,
      autoFocus,
      className,
      defaultValue,
      description,
      errorMessage,
      isDisabled,
      isInvalid,
      isRequired,
      label,
      name,
      onBlur,
      onChange,
      placeholder,
      type,
      validationBehavior,
    },
    ref,
  ) => (
    <TextField
      aria-describedby={ariaDescribedBy}
      className={className}
      defaultValue={defaultValue}
      isDisabled={isDisabled}
      isInvalid={isInvalid}
      isRequired={isRequired}
      type={type}
      validationBehavior={validationBehavior}
    >
      <Label>{label}</Label>
      <Input
        ref={ref}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        name={name}
        placeholder={placeholder}
        onBlur={onBlur}
        onChange={onChange}
      />
      <Conditional when={description}>
        <Description>{description}</Description>
      </Conditional>
      <FieldError>{errorMessage}</FieldError>
    </TextField>
  ),
);

FormTextField.displayName = 'FormTextField';
