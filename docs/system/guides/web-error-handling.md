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

Show every API failure in an error toast using `react-toastify`.

Mount one `ToastContainer` in the application root. Do not add feature-local or multiple
containers. Prevent duplicate toasts when one failure is observed by more than one layer or when
concurrent requests report the same session-expiry failure.

An intentionally aborted request is not an API failure and must not produce a toast.

Handle normalized API failures centrally with Redux middleware using RTK Query's rejected-action
matcher. The middleware owns the generic error toast, so pages and components must not repeat
`try`/`catch` blocks solely to call the toast notifier.

Keep this cross-feature adapter in `apps/web/src/shared/alerts/`. By contrast, an alert describing
a feature-owned action belongs in `apps/web/src/modules/<module>/alerts/`. Ownership follows the
action, not the toast library: authentication success alerts, for example, belong to the auth
module rather than `shared/alerts/`.

For mutations, await the trigger without calling `.unwrap()` and branch on the result:

```ts
const result = await updateResource(input);
if ('error' in result) {
  return;
}

completeWorkflow(result.data);
```

The global middleware handles the toast. Feature code handles only feature-specific consequences,
such as mapping a known API failure to a form field. Success-only state changes, alerts, and
navigation must occur only after confirming the result contains `data`.

## 3. Present form errors through HeroUI

Keep form validation errors inline using HeroUI's native validation presentation, such as
`Form.validationErrors` or field `isInvalid` and `errorMessage`.

Map server field errors to their corresponding controls through HeroUI and the form library. An API
field-validation failure still receives the required error toast, but do not render an additional
custom error banner that duplicates HeroUI's field feedback.

## 4. Show success feedback for completed actions

Show a success toast after every user-triggered action that completes successfully. Emit it only
after the complete workflow succeeds, not merely after an intermediate request.

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
