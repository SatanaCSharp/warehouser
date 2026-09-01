import {
  Calendar,
  DateField,
  DatePicker,
  Description,
  FieldError,
  Label,
} from '@heroui/react';
import { parseDate } from '@internationalized/date';
import { useTranslation } from 'react-i18next';

import { Conditional } from 'shared/components/Conditional';

import type { CalendarDate, DateValue } from '@internationalized/date';
import type { ComponentProps, ReactElement, ReactNode } from 'react';

/**
 * The `YYYY-MM-DD` shape every date-valued contract field carries
 * (`z.string().date()`), and the only one `parseDate` accepts. A value that
 * isn't one — the empty string a blank field holds, or anything a server sent
 * in another shape — resolves to "no date" rather than throwing inside render.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

const toCalendarDate = (value: string): CalendarDate | null =>
  ISO_DATE.test(value) ? parseDate(value) : null;

type CalendarSegment = ComponentProps<typeof DateField.Segment>['segment'];
type CalendarCellDate = ComponentProps<typeof Calendar.Cell>['date'];

type FormDateFieldProps = Pick<
  ComponentProps<typeof DatePicker>,
  | 'autoFocus'
  | 'className'
  | 'isDisabled'
  | 'isInvalid'
  | 'isRequired'
  | 'maxValue'
  | 'minValue'
  | 'name'
  | 'validationBehavior'
> & {
  description?: ReactNode;
  errorMessage?: ReactNode;
  label: ReactNode;
  onBlur?: () => void;
  /** The picked day as `YYYY-MM-DD`, or `''` once the field is cleared. */
  onChange: (value: string) => void;
  value: string;
};

/**
 * The date field every form in `apps/web` uses, replacing the native
 * `<input type="date">` a `FormTextField` used to render.
 *
 * A native date input hands the browser both the calendar and the segment
 * order, so it ignores the language i18next resolved, cannot be styled to
 * match the rest of a dialog, and gives assistive technology whatever the
 * platform provides. HeroUI v3's `DatePicker` is React Aria's instead:
 * segments follow the active locale (`LocaleProvider` feeds it i18next's
 * language), the popover is the repository's own `Calendar`, and the
 * roving-focus and announcement behaviour comes from React Aria.
 *
 * Like `FormSelectField`, it exposes the flat, string-valued field React Hook
 * Form's `Controller` already hands us: `value`/`onChange` speak the ISO day
 * the contracts carry, and the `CalendarDate` React Aria wants stays inside.
 */
export const FormDateField = ({
  autoFocus,
  className,
  description,
  errorMessage,
  isDisabled,
  isInvalid,
  isRequired,
  label,
  maxValue,
  minValue,
  name,
  onBlur,
  onChange,
  validationBehavior,
  value,
}: FormDateFieldProps): ReactElement => {
  const { t } = useTranslation('common');

  // React Aria reports the cleared field as `null`; the form field's own
  // "nothing picked" is the empty string every contract's `.date()` rejects.
  const onSelect = (next: DateValue | null): void =>
    onChange(next === null ? '' : next.toString());

  const renderSegment = (segment: CalendarSegment): ReactElement => (
    <DateField.Segment segment={segment} />
  );

  const renderHeaderCell = (day: string): ReactElement => (
    <Calendar.HeaderCell>{day}</Calendar.HeaderCell>
  );

  const renderCell = (date: CalendarCellDate): ReactElement => (
    <Calendar.Cell date={date} />
  );

  const renderYearCell = ({ year }: { year: number }): ReactElement => (
    <Calendar.YearPickerCell year={year} />
  );

  return (
    <DatePicker
      autoFocus={autoFocus}
      className={className}
      isDisabled={isDisabled}
      isInvalid={isInvalid}
      isRequired={isRequired}
      maxValue={maxValue}
      minValue={minValue}
      name={name}
      validationBehavior={validationBehavior}
      value={toCalendarDate(value)}
      onBlur={onBlur}
      onChange={onSelect}
    >
      <Label>{label}</Label>
      <DateField.Group fullWidth>
        <DateField.Input>{renderSegment}</DateField.Input>
        <DateField.Suffix>
          <DatePicker.Trigger aria-label={t('dateField.openCalendar')}>
            <DatePicker.TriggerIndicator />
          </DatePicker.Trigger>
        </DateField.Suffix>
      </DateField.Group>
      <Conditional when={description}>
        <Description>{description}</Description>
      </Conditional>
      <FieldError>{errorMessage}</FieldError>
      <DatePicker.Popover>
        <Calendar aria-label={t('dateField.calendarLabel')}>
          <Calendar.Header>
            <Calendar.YearPickerTrigger
              aria-label={t('dateField.chooseYearAndMonth')}
            >
              <Calendar.YearPickerTriggerHeading />
              <Calendar.YearPickerTriggerIndicator />
            </Calendar.YearPickerTrigger>
            <Calendar.NavButton
              aria-label={t('dateField.previousMonth')}
              slot="previous"
            />
            <Calendar.NavButton
              aria-label={t('dateField.nextMonth')}
              slot="next"
            />
          </Calendar.Header>
          <Calendar.Grid>
            <Calendar.GridHeader>{renderHeaderCell}</Calendar.GridHeader>
            <Calendar.GridBody>{renderCell}</Calendar.GridBody>
          </Calendar.Grid>
          <Calendar.YearPickerGrid>
            <Calendar.YearPickerGridBody>
              {renderYearCell}
            </Calendar.YearPickerGridBody>
          </Calendar.YearPickerGrid>
        </Calendar>
      </DatePicker.Popover>
    </DatePicker>
  );
};
