import {
  Button,
  Description,
  FieldError,
  InputGroup,
  Label,
  TextField,
} from '@heroui/react';
import { forwardRef, useState } from 'react';

import { Conditional } from 'shared/components/Conditional';

import type {
  ComponentProps,
  ComponentPropsWithoutRef,
  ReactNode,
} from 'react';

/**
 * `FormTextField`'s password sibling: HeroUI v3 renders an in-field affordance
 * through `InputGroup.Suffix`, so the reveal toggle is a real `Button` inside
 * the input group instead of the bare `endContent` element v2 used.
 */
type PasswordInputProps = Pick<
  ComponentProps<typeof TextField>,
  'className' | 'isDisabled' | 'isInvalid' | 'isRequired' | 'validationBehavior'
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
    hideLabel: string;
    hideText?: string;
    label: ReactNode;
    showLabel: string;
    showText?: string;
  };

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  (
    {
      autoComplete,
      autoFocus,
      className,
      description,
      errorMessage,
      hideLabel,
      hideText,
      isDisabled,
      isInvalid,
      isRequired,
      label,
      name,
      onBlur,
      onChange,
      placeholder,
      showLabel,
      showText,
      validationBehavior,
    },
    ref,
  ) => {
    const [isVisible, setIsVisible] = useState(false);

    const onToggleVisibility = (): void => setIsVisible((visible) => !visible);

    return (
      <TextField
        className={className}
        isDisabled={isDisabled}
        isInvalid={isInvalid}
        isRequired={isRequired}
        validationBehavior={validationBehavior}
      >
        <Label>{label}</Label>
        <InputGroup>
          <InputGroup.Input
            ref={ref}
            autoComplete={autoComplete}
            autoFocus={autoFocus}
            name={name}
            placeholder={placeholder}
            type={isVisible ? 'text' : 'password'}
            onBlur={onBlur}
            onChange={onChange}
          />
          <InputGroup.Suffix>
            <Button
              aria-label={isVisible ? hideLabel : showLabel}
              className="min-h-11 min-w-11 text-sm"
              size="sm"
              variant="ghost"
              onPress={onToggleVisibility}
            >
              {isVisible ? (hideText ?? hideLabel) : (showText ?? showLabel)}
            </Button>
          </InputGroup.Suffix>
        </InputGroup>
        <Conditional when={description}>
          <Description>{description}</Description>
        </Conditional>
        <FieldError>{errorMessage}</FieldError>
      </TextField>
    );
  },
);

PasswordInput.displayName = 'PasswordInput';
