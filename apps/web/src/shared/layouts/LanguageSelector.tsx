import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from '@heroui/react';
import { useTranslation } from 'react-i18next';

import type { ReactElement } from 'react';

type SupportedLanguage = 'en' | 'uk';

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  uk: 'Українська',
};

export const resolveBaseLanguage = (
  language: string | undefined,
): SupportedLanguage => (language?.split('-')[0] === 'uk' ? 'uk' : 'en');

const GlobeIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    className="size-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c1.657 0 3-4.03 3-9s-1.343-9-3-9-3 4.03-3 9 1.343 9 3 9Zm-9-9h18"
    />
  </svg>
);

const CheckIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    className="size-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="m4.5 12.75 6 6 9-13.5"
    />
  </svg>
);

const ChevronDownIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    className="hidden size-4 sm:block"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="m19.5 8.25-7.5 7.5-7.5-7.5"
    />
  </svg>
);

export const LanguageSelector = (): ReactElement => {
  const { t, i18n } = useTranslation('common');
  const baseLanguage = resolveBaseLanguage(i18n.resolvedLanguage);
  const currentLabel = LANGUAGE_LABELS[baseLanguage];
  const accessibleLabel = `${t('language.label')}: ${currentLabel}`;

  return (
    <Dropdown>
      <DropdownTrigger>
        <Button
          variant="light"
          aria-label={accessibleLabel}
          startContent={<GlobeIcon />}
          endContent={<ChevronDownIcon />}
          className="w-10 min-w-10 gap-0 px-0 sm:w-auto sm:min-w-20 sm:gap-2 sm:px-4"
        >
          <span className="hidden sm:inline">{currentLabel}</span>
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label={t('language.label')}
        onAction={(key) => {
          void i18n.changeLanguage(String(key));
        }}
      >
        <DropdownItem
          key="en"
          endContent={baseLanguage === 'en' ? <CheckIcon /> : null}
        >
          {LANGUAGE_LABELS.en}
        </DropdownItem>
        <DropdownItem
          key="uk"
          endContent={baseLanguage === 'uk' ? <CheckIcon /> : null}
        >
          {LANGUAGE_LABELS.uk}
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
};
