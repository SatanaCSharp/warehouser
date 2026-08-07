import { Input } from '@heroui/react';
import { useState } from 'react';

import type { ComponentProps, ReactElement } from 'react';

type PasswordInputProps = Omit<
  ComponentProps<typeof Input>,
  'endContent' | 'type'
> & {
  hideLabel: string;
  hideText?: string;
  showLabel: string;
  showText?: string;
};

export const PasswordInput = ({
  hideLabel,
  hideText,
  showLabel,
  showText,
  ...inputProps
}: PasswordInputProps): ReactElement => {
  const [visible, setVisible] = useState(false);

  return (
    <Input
      {...inputProps}
      type={visible ? 'text' : 'password'}
      endContent={
        <button
          type="button"
          className="min-h-11 min-w-11 text-sm text-foreground-500"
          aria-label={visible ? hideLabel : showLabel}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? (hideText ?? hideLabel) : (showText ?? showLabel)}
        </button>
      }
    />
  );
};
