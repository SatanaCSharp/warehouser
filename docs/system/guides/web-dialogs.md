# Writing Web Dialogs

This guide applies to `apps/web`. It defines the two dialog components every modal workflow is
built from, which one a given workflow takes, and what each of them owns so that no dialog writes
the submit sequence again.

Two components cover every modal this application opens:

- `shared/components/FormModalDialog.tsx` — a workflow with **fields to fill in**.
- `shared/components/ConfirmAlertDialog.tsx` — a workflow with **one decision and nothing to
  fill in**.

Neither is a wrapper around HeroUI that a feature is free to bypass. Do not build a modal out of
`Modal.*` or `AlertDialog.*` parts in a feature file; if a workflow needs something neither
component offers, add it here rather than reassembling the parts beside them.

## 1. Choosing between them

**Is anything validated?** That is the whole question.

| The dialog…                                       | Use                  |
| ------------------------------------------------- | -------------------- |
| has a field the actor fills in or picks           | `FormModalDialog`    |
| requires a choice before it may be submitted      | `FormModalDialog`    |
| runs a schema or `parse*` pre-check               | `FormModalDialog`    |
| states what will happen and asks only to go ahead | `ConfirmAlertDialog` |

A "delete" dialog is not automatically a confirmation. `DeleteMemberDialog` has nothing to choose,
so it is a `ConfirmAlertDialog`; `DeleteRoleDialog` asks which Role its members move to, so that
choice is required and validated and it is a `FormModalDialog`. What decides is the presence of
validation, not the destructiveness of the action.

The distinction is not cosmetic. A `ConfirmAlertDialog` renders `role="alertdialog"`, and a test
finds it with `getByRole('alertdialog')` rather than `getByRole('dialog')`.

## 2. `FormModalDialog` owns the submit sequence

Every form dialog used to repeat the same body: validate, set the field errors, request, set the
field errors again, close. That sequence now belongs to `FormModalDialog`, and in this exact order:

1. `react-hook-form` enforces the field-level `rules` — nothing below runs until they pass.
2. `parse(values)` validates the whole form. On failure each rejected field is given its
   translated message and **no request is made**.
3. `onSubmit(input)` makes the request; the dialog normalizes what it settles to with
   `mutationOutcome()`.
4. On success the dialog closes, and only then.
5. On failure the dialog **stays open**: `outcome.fieldErrors` is applied to the fields it names,
   and `onRefusal` is handed `outcome.code` for a dialog that explains a refusal itself.

`onSubmit` is the generated RTK Query mutation trigger, handed over directly — normalizing its
result is step 3 above, not a wrapper hook's job
(`docs/system/adr/19-08-2026-generated-mutation-hooks-in-components.md`).

A dialog therefore hands over the pieces and writes none of the sequence:

```tsx
export const AddWarehouseDialog = (): ReactElement => {
  const { t } = useTranslation('warehouse');
  const { t: translateValidation } = useTranslation('validation');
  const [createWarehouse] = useCreateWarehouseMutation();
  const form = useForm<WarehouseNameFormValues>({
    defaultValues: { name: '' },
  });
  const {
    formState: { errors, isSubmitting },
    register,
  } = form;

  return (
    <FormModalDialog
      title={t('warehouses.add.title')}
      cancelLabel={t('warehouses.add.cancel')}
      submitLabel={t('warehouses.add.submit')}
      form={form}
      parse={parse}
      translateValidation={translateValidation}
      onSubmit={createWarehouse}
    >
      {/* fields */}
    </FormModalDialog>
  );
};
```

What a dialog must **not** contain any more:

- a `handleSubmit` callback body — `form` is passed whole and the dialog calls `handleSubmit`
  itself;
- `useCloseDialog` — closing on success is step 4 above, and cancel closes through
  `<Button slot="close">`;
- an `isSubmitting` prop or a `useState` pending flag — the flag is read from
  `form.formState.isSubmitting`, which the awaited `onSubmit` already drives;
- a `noValidate` prop — every field validates through react-hook-form and reports through
  `validationBehavior="aria"`, so native constraint validation is always off;
- a `useFormFieldErrors` call — the dialog applies both the parse errors and the server's;
- a `mutationOutcome()` call — the dialog normalizes the settled request itself (step 3), so what it
  is handed is the mutation trigger.

`isSubmitting` is still read from `form` inside the dialog body, because the fields it renders are
disabled while a request is in flight.

## 3. Writing the `parse` step

`parse` returns a `FormParseResult` (`shared/utils/form-parse.ts`): the input the request carries,
or a field→code map. The codes are stable identifiers, never display text
([web error handling](web-error-handling.md) §5) — `translateValidation` turns each one into the
message its field shows, at the moment the error is set.

Three shapes cover what exists today:

- **A Zod form schema** — bind it with `parseWithSchema`, declared once at module scope because it
  closes over nothing:

  ```ts
  const parse = parseWithSchema(warehouseNameFormSchema);
  ```

  The schema's issue `message` is the validation key and its `path` names the field, so the two are
  transposed for you. Pair it with the `validation` namespace's `t`, which takes the key directly.

- **A `parse*` helper returning a field map** — pass it through:

  ```ts
  const parse = ({
    email,
  }: EditEmailForm): FormParseResult<EditEmailForm, EmailChangeInput> =>
    parseEmailChangeForm(email);
  ```

- **A helper returning one bare code** — name the field it belongs to:

  ```ts
  const parsed = parseRoleForm(name, permissionIds);
  return parsed.success
    ? parsed
    : { error: { name: parsed.error }, success: false };
  ```

`translateValidation` receives `(code, field)`. A dialog whose messages all live under one key
prefix declares a one-parameter function and ignores the field; a dialog whose fields sit under
different prefixes takes both:

```ts
const translateValidation = (
  code: string,
  field: keyof CreateMemberForm,
): string =>
  t(
    `administration.createMember.validation.${VALIDATION_NAMESPACE[field]}.${code}`,
  );
```

Omit `parse` when the only rule is which fields are required — react-hook-form's `rules` already
enforce that, and `onSubmit` then receives the form values unchanged.

Omit `translateValidation` only when the dialog has no `parse` and expects no `fieldErrors`.
Without it a code has no translation, so `FormModalDialog` sets no field message at all rather than
showing a raw code; the failure's toast reports it instead.

## 4. `ConfirmAlertDialog` owns the confirm sequence

A confirmation has no form, no `useForm`, and no submit event. It is given what to say and what to
run:

```tsx
<ConfirmAlertDialog
  title={t('administration.deleteMember.title', { email: member.email })}
  cancelLabel={t('administration.cancel')}
  confirmLabel={t('administration.deleteMember.confirm')}
  onConfirm={onDelete}
>
  <p>{t('administration.deleteMember.body', { email: member.email })}</p>
</ConfirmAlertDialog>
```

It owns the pending state — the request it awaits is its own — closes on success, and hands
`onRefusal` the refusal code otherwise. It defaults to the `danger` status and a `danger` confirm
button, because every confirmation this application opens today is destructive; pass `status` and
`confirmVariant` for one that is not.

Escape dismisses it. HeroUI defaults an `AlertDialog` to explicit action only; this component turns
that off, because a dialog a keyboard cannot leave is not a cancellable one.

## 5. Neither component knows whether it is open

This is unchanged by the split and holds for both. A dialog never owns its own open state:

- a control that sits beside its dialog wraps both in a `Modal` root (form) or an `AlertDialog`
  root (confirmation), with `TriggeredDialog` around the dialog so it mounts only while open;
- a list row, which is not a control the dialog can sit beside, mounts `DialogHost` for the record
  it was opened for.

Both publish the same React Aria overlay state, so cancel closes through `<Button slot="close">`
and the success path closes through `useCloseDialog` inside the shared component. No dialog is ever
handed an `onClose`.

## 6. Where a refusal is explained

The normalized `MutationOutcome.code` is a stable server code, not display text. A dialog that must explain the
refusal where the decision was made keeps that code in its own `useState` and renders a
feature-owned alert from it:

```tsx
const [refusalCode, setRefusalCode] = useState<string>();

<FormModalDialog form={form} onRefusal={setRefusalCode} onSubmit={onSubmit}>
  {/* fields */}
  <WorkspaceRefusalAlert code={refusalCode} />
</FormModalDialog>;
```

Do not add `onRefusal` where nothing renders the code. Every failure already produces an error
toast at the API boundary ([web error handling](web-error-handling.md) §2), and a dialog that
stays open with its values intact is the rest of the answer.

## 7. Testing

- Query a form dialog with `getByRole('dialog')` and a confirmation with `getByRole('alertdialog')`.
- Assert the closing behaviour through the outcome, not the mechanism: a successful mutation leaves
  no dialog in the document, a refused one leaves it in place with its message on the field.
- Cancel precedes the destructive primary in both footers, and Escape closes both — the
  accessibility suites assert this per surface.
