import {
  Description,
  FieldError,
  Label,
  TextArea,
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
 * The multi-line half of the field contract `FormTextField` states for one
 * line: the same `label` / `description` / `errorMessage` slots, the same
 * `register()` wiring, and the same HeroUI composition — except that the
 * control inside `TextField` is a `TextArea`, so the ref react-hook-form hands
 * us lands on the `<textarea>`.
 *
 * It exists because some values are long by nature and wrap rather than
 * truncate — a delivery address and the notes a driver needs to get in are the
 * first two (`docs/features/delivery-addresses/design-handoff.md`
 * §Accessibility: "An address is long by nature — every surface that renders
 * one must wrap it, never truncate it into ambiguity"). Typing one into a
 * single-line `Input` hides everything past the caret.
 *
 * There is no `type` here, because a `<textarea>` has none.
 */
type FormTextAreaFieldProps = Pick<
  ComponentProps<typeof TextField>,
  | 'className'
  | 'defaultValue'
  | 'isDisabled'
  | 'isInvalid'
  | 'isRequired'
  | 'validationBehavior'
> &
  Pick<
    ComponentPropsWithoutRef<'textarea'>,
    | 'autoComplete'
    | 'autoFocus'
    | 'maxLength'
    | 'name'
    | 'onBlur'
    | 'onChange'
    | 'placeholder'
    | 'rows'
  > & {
    description?: ReactNode;
    errorMessage?: ReactNode;
    label: ReactNode;
  };

export const FormTextAreaField = forwardRef<
  HTMLTextAreaElement,
  FormTextAreaFieldProps
>(
  (
    {
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
      maxLength,
      name,
      onBlur,
      onChange,
      placeholder,
      rows,
      validationBehavior,
    },
    ref,
  ) => (
    <TextField
      className={className}
      defaultValue={defaultValue}
      isDisabled={isDisabled}
      isInvalid={isInvalid}
      isRequired={isRequired}
      validationBehavior={validationBehavior}
    >
      <Label>{label}</Label>
      <TextArea
        ref={ref}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        maxLength={maxLength}
        name={name}
        placeholder={placeholder}
        rows={rows}
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

FormTextAreaField.displayName = 'FormTextAreaField';
