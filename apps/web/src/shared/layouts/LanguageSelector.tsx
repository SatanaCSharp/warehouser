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

const LANGUAGE_LABEL_KEYS: Record<SupportedLanguage, string> = {
  en: 'language.english',
  uk: 'language.ukrainian',
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
  const currentLabel = t(LANGUAGE_LABEL_KEYS[baseLanguage]);
  const accessibleLabel = `${t('language.label')}: ${currentLabel}`;

  return (
    <Dropdown>
      <DropdownTrigger>
        <Button
          variant="light"
          aria-label={accessibleLabel}
          startContent={<GlobeIcon />}
          endContent={<ChevronDownIcon />}
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
        <DropdownItem key="en">{t('language.english')}</DropdownItem>
        <DropdownItem key="uk">{t('language.ukrainian')}</DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
};
