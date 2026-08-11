import {
  Description,
  FieldError,
  Input,
  Label,
  TextField,
} from '@heroui/react';
import { forwardRef } from 'react';

import type {
  ComponentProps,
  ComponentPropsWithoutRef,
  ReactNode,
} from 'react';

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
    description?: ReactNode;
    errorMessage?: ReactNode;
    label: ReactNode;
  };

export const FormTextField = forwardRef<HTMLInputElement, FormTextFieldProps>(
  (
    {
      autoComplete,
      autoFocus,
      className,
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
      className={className}
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
      {description ? <Description>{description}</Description> : null}
      <FieldError>{errorMessage}</FieldError>
    </TextField>
  ),
);

FormTextField.displayName = 'FormTextField';
