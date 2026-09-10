import { Description, FieldError, Label, ListBox, Select } from '@heroui/react';
import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { Conditional } from 'shared/components/Conditional';

export type SelectOption = { id: string; label: string };

/**
 * HeroUI v3 replaces v2's `selectedKeys`/`onSelectionChange` `Select` with a
 * `value`/`onChange` compound built from `Select.Trigger` + `ListBox`. This
 * exposes the single-select case as the flat, string-valued field that React
 * Hook Form's `Controller` already hands us.
 */
type FormSelectFieldProps = Pick<
  ComponentProps<typeof Select>,
  | 'className'
  | 'isDisabled'
  | 'isInvalid'
  | 'isRequired'
  | 'name'
  | 'placeholder'
  | 'validationBehavior'
> & {
  /**
   * An element elsewhere on screen that explains this field — typically the one
   * sentence a surface states once for a whole group rather than repeating into
   * every field's own caption (design-handoff.md §Accessibility). React Aria's
   * `useField` composes it with the `Description` below rather than replacing
   * it, so the field announces both.
   */
  'aria-describedby'?: string;
  description?: ReactNode;
  errorMessage?: ReactNode;
  label: ReactNode;
  onBlur?: () => void;
  onChange: (value: string) => void;
  options: SelectOption[];
  value: string;
};

export const FormSelectField = ({
  'aria-describedby': ariaDescribedBy,
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
  options,
  placeholder,
  validationBehavior,
  value,
}: FormSelectFieldProps): ReactElement => {
  // HeroUI hands back the raw key, which is typed wider than the flat string
  // field React Hook Form owns; an empty string is the field's "no selection".
  const onSelect = (next: unknown): void =>
    onChange(typeof next === 'string' ? next : '');

  return (
    <Select
      aria-describedby={ariaDescribedBy}
      className={className}
      isDisabled={isDisabled}
      isInvalid={isInvalid}
      isRequired={isRequired}
      name={name}
      placeholder={placeholder}
      validationBehavior={validationBehavior}
      value={value === '' ? null : value}
      onBlur={onBlur}
      onChange={onSelect}
    >
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item
              key={option.id}
              id={option.id}
              textValue={option.label}
            >
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
      <Conditional when={description}>
        <Description>{description}</Description>
      </Conditional>
      <FieldError>{errorMessage}</FieldError>
    </Select>
  );
};
