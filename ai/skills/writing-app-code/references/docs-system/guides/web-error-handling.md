# Web Error Handling and Action Feedback

This guide applies to `apps/web`. It defines how the web application normalizes API failures,
presents form errors, displays error and success alerts, and translates all user-visible
descriptions.

The server remains responsible for classifying failures and returning the safe REST error envelope
defined in `@warehouser/contracts`. The web application is responsible for presentation and
localization.

## 1. Normalize API failures once

Normalize API failures at one shared API boundary:

- Parse the contract-defined REST error envelope.
- Preserve its stable error code and safe interpolation parameters.
- Produce a generic normalized error for network failures, malformed responses, and unknown
  failures.
- Return the normalized error through RTK Query's error result so feature workflows and forms can
  react to it without exception-based control flow.

Treat server error codes as identifiers, not display text. Never display raw exception messages,
stack traces, database or vendor details, or other unrestricted server response content.

## 2. Show API failures in error toasts

Show every API failure in an error toast using the HeroUI v3 toast queue (`toast.danger`).

Mount one `Toast.Provider` in the application root. Do not add feature-local or multiple providers.
Prevent duplicate toasts when one failure is observed by more than one layer or when concurrent
requests report the same session-expiry failure. The HeroUI queue has no `toastId` equivalent, so
the shared adapter tracks the failure codes currently on screen and clears each one from its
`onClose` callback.

An intentionally aborted request is not an API failure and must not produce a toast.

Handle normalized API failures centrally with Redux middleware using RTK Query's rejected-action
matcher. The middleware owns the generic error toast, so pages and components must not repeat
`try`/`catch` blocks solely to call the toast notifier.

Keep this cross-feature adapter in `apps/web/src/shared/alerts/`, alongside the registry that names
what each mutation reports (§4).

Import the toast queue through `shared/alerts/toast` rather than the `@heroui/react` barrel. That
single seam is what lets a spec observe toasts without stubbing every HeroUI component it renders.

For mutations, await the trigger without calling `.unwrap()` and branch on the result:

```ts
const result = await updateResource(input);
if ('error' in result) {
  return;
}

completeWorkflow(result.data);
```

The global middleware handles the toast. Success-only state changes, alerts, and navigation must
occur only after confirming the result contains `data`.

A workflow that needs the refusal rather than only the branch normalizes the settled result with
`mutationOutcome()` from `shared/api/client/mutation-outcome.ts`, which reports `success`, the
stable `code`, and the `fieldErrors` the endpoint attached (§3). `FormModalDialog` and
`ConfirmAlertDialog` call it for you — hand them the mutation trigger itself. Only a form that stays
on the page after submitting, having no dialog to close, calls it directly.

## 3. Present form errors through HeroUI

Keep form validation errors inline using HeroUI v3's native validation presentation: wrap each
field in `TextField` with `isInvalid`, and render the message through the field's `<FieldError>`
child (not a v2-style `errorMessage` prop).

Map server field errors to their corresponding controls through HeroUI and the form library. An API
field-validation failure still receives the required error toast, but do not render an additional
custom error banner that duplicates HeroUI's field feedback.

**Which field explains a refusal is the endpoint's declaration, not the caller's.** A refusal the
server named no field for is bound to one by the endpoint's `transformErrorResponse`, built with
`fieldErrorsForCode` (`shared/utils/field-errors.ts`) from a code→fields table, and composed with
`nameValidationKeyMapper` where a rejected Name's rule becomes a validation key. Declare it beside
the endpoint in the api slice so every component triggering that endpoint gets the same explanation
(`docs/system/adr/19-08-2026-generated-mutation-hooks-in-components.md`). Do not re-map codes to
fields in a component, a hook, or a form.

## 4. Show success feedback for completed actions

Show a success toast after every user-triggered action that completes successfully. Emit it only
after the complete workflow succeeds, not merely after an intermediate request.

Report an asynchronous action through a promise toast: a loading toast (`isLoading: true`,
`timeout: 0`) stays on screen for as long as the request is in flight and is replaced by the
success description once the request commits. `mutationFeedbackMiddleware`
(`store/middleware/mutation-feedback.middleware.ts`) raises both, keyed by the request that owns
them, and on a failure only closes the loading toast because §2's middleware already owns the error
toast. Do not reach for HeroUI's `toast.promise`: RTK Query resolves a failed mutation instead of
rejecting it, and `toast.promise` would read that as success.

**Declare the action, do not call the notifier.** `shared/alerts/mutation-actions.ts` holds one
entry per mutation endpoint — its translation scope, the action key when it differs from the
endpoint name (including an endpoint that reports two outcomes, which reads its own argument), and
an optional `describe` that interpolates the outcome's subject. A component triggers the generated
`use<Endpoint>Mutation` hook and writes no feedback code at all.

**An endpoint absent from the registry reports nothing.** That is the opt-out, and it is how three
cases stay quiet: a background write nobody asked for, such as `setActiveWarehouse`; a successful
login; and a multi-request workflow that must alert once at the end rather than per request. A new
endpoint added without an entry is therefore silent rather than wrong — register it deliberately.

Do not show success toasts for:

- reads or background refreshes;
- navigation;
- local UI-only changes;
- successful login.

Successful login is the explicit exception. Login failures still follow the normal API error rules.

Use action-specific descriptions, such as “Warehouse created,” instead of generic “Success” copy
when the completed action can be named.

## 5. Translate every user-visible description

Use i18next for every user-visible error, validation, and success description. Define the copy in
translation resources and reference translation keys from code.

Do not hardcode visible messages in:

- API adapters;
- toast calls;
- Zod schemas;
- form components;
- pages.

Map known server and validation codes explicitly to typed i18next keys. Pass only safe structured
values as interpolation parameters. Use translated generic and network-error keys as fallbacks.
Never expose untranslated server codes or missing translation keys to users.

Prefer storing stable translation keys or validation codes in form and error state, then translate
them at render or notification time. Do not store already translated strings when doing so would
prevent the UI from responding correctly to a language change.

Keep action-specific success descriptions in translation resources. Separate `errors`,
`validation`, and `success` namespaces when that improves ownership and discoverability.

## 6. Test the complete presentation policy

Test:

- API-envelope parsing;
- unknown, malformed-response, and network fallbacks;
- API field-error mapping to HeroUI controls;
- error-toast coverage and deduplication;
- translated error, validation, and success descriptions;
- successful-action toasts;
- the absence of a success toast after login;
- the absence of toasts for intentionally aborted requests.

Ensure every public API error code and supported success action has a translation in every supported
locale.
