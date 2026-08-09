import { Button, Dropdown, Label } from '@heroui/react';
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
      <Button
        variant="ghost"
        aria-label={accessibleLabel}
        className="w-10 min-w-10 gap-0 px-0 sm:w-auto sm:min-w-20 sm:gap-2 sm:px-4"
      >
        <GlobeIcon />
        <span className="hidden sm:inline">{currentLabel}</span>
        <ChevronDownIcon />
      </Button>
      <Dropdown.Popover>
        <Dropdown.Menu
          aria-label={t('language.label')}
          onAction={(key) => {
            void i18n.changeLanguage(String(key));
          }}
        >
          <Dropdown.Item id="en" textValue={LANGUAGE_LABELS.en}>
            <Label>{LANGUAGE_LABELS.en}</Label>
            {baseLanguage === 'en' ? <CheckIcon /> : null}
          </Dropdown.Item>
          <Dropdown.Item id="uk" textValue={LANGUAGE_LABELS.uk}>
            <Label>{LANGUAGE_LABELS.uk}</Label>
            {baseLanguage === 'uk' ? <CheckIcon /> : null}
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
};
