import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { CheckIcon, ChevronDownIcon, GlobeIcon } from 'shared/icons';

import type { ReactElement } from 'react';

type SupportedLanguage = 'en' | 'uk';

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  uk: 'Українська',
};

export const resolveBaseLanguage = (
  language: string | undefined,
): SupportedLanguage => (language?.split('-')[0] === 'uk' ? 'uk' : 'en');

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
