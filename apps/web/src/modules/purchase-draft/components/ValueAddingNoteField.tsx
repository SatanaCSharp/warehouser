import { Description, Label, TextArea, TextField } from '@heroui/react';

import { Conditional } from 'shared/components/Conditional';

import type { ChangeEvent, ReactElement, ReactNode } from 'react';

export type ValueAddingNoteFieldProps = {
  className?: string;
  defaultValue: string;
  /** The helper sentence under the field, or why the field is refused. */
  description?: ReactNode;
  isDisabled?: boolean;
  label: ReactNode;
  placeholder?: string;
  onBlur: () => void;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
};

/**
 * The Value-adding Note of one Purchase Draft Line (AC-12, frames
 * `yGhkK`/`F0SpRx`): what the goods need doing to them before or on arrival.
 *
 * It is a **multi-line** field, which is why it is not `FormTextField`. The
 * frames draw a note box two lines tall holding a whole instruction — "Shrink
 * -wrap each pallet and apply the customer's own barcode to the outer face" —
 * and a single-line `<Input>` shows a member only the tail of what they typed
 * and gives them no room to write the next one. HeroUI v3 composes that from
 * `TextField` + `Label` + `TextArea` + `Description`, exactly as `TextField` +
 * `Input` composes the single-line case, so this wraps the composition the same
 * way `FormTextField` wraps that one.
 *
 * It lives in this module rather than beside `FormTextField` in
 * `shared/components/` because this is its only consumer; promote it there the
 * moment a second module needs a multi-line field
 * (`docs/system/guides/placing-web-components.md`).
 */
export const ValueAddingNoteField = ({
  className,
  defaultValue,
  description,
  isDisabled,
  label,
  placeholder,
  onBlur,
  onChange,
}: ValueAddingNoteFieldProps): ReactElement => (
  <TextField
    className={className}
    defaultValue={defaultValue}
    isDisabled={isDisabled}
  >
    <Label>{label}</Label>
    <TextArea
      placeholder={placeholder}
      rows={2}
      onBlur={onBlur}
      onChange={onChange}
    />
    <Conditional when={description}>
      <Description>{description}</Description>
    </Conditional>
  </TextField>
);
