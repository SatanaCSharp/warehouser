import { globSync, readFileSync } from 'node:fs';

// T20 — the static-analysis primitives behind the architecture check
// `docs/features/delivery-addresses/sad.md` §10 requires: **every read whose response schema can
// carry a customer-identity field declares `@ObservedPermission(CUSTOMERS:WATCH)`**.
//
// §11 chose *two mechanical defences rather than a review pass*, "because a missed surface leaks
// silently and forever". The contract shape is one (T13, T19); this is the other, and §8 states
// exactly why it has to exist: "A surface that forgets it fails silently and undetectably in
// production."
//
// **The surface list is derived, never enumerated.** Nothing here holds a list of handler names or
// of identity-bearing endpoints. The set is computed from the contract schemas themselves and then
// joined to handlers through each handler's declared return type, so a read added tomorrow whose
// response reaches customer identity fails this check **without anyone editing this file**. That is
// the whole point: a hand-maintained list is exactly the "remembered" defence §10 replaces, and the
// three stale module lists this repository already carries
// (`shared/domain/repositories/repository-boundaries.spec.ts` and two `module-boundaries.spec.ts`
// files, none of which lists `purchase-drafts`) are the standing evidence that such lists rot.

const CONTRACTS_GLOB = 'packages/contracts/src/**/*.ts';

// The projections module whose every schema **is** customer identity by subject rather than by
// field. `customers-projections.ts` says so itself: "This schema has no redacted form: every
// operation returning it already requires a `CUSTOMERS:*` Permission, so an actor who reaches it
// holds the Permission the identity is gated on (AC-09)."
const CUSTOMER_SUBJECT_MODULE = 'packages/contracts/src/customers/customers-projections.ts';

// The fields the redaction itself removes, read off the identified/redacted pair in
// `purchase-drafts-projections.ts`: `customer`, `customerName` and both the captured and the current
// Delivery Address are "absent as properties rather than null" on the redacted form (AC-09a).
//
// `addressText` and `accessNotes` are deliberately **not** here. They appear on
// `lineWarehouseDestinationSchema` too, which the contract states is "readable by any member holding
// `PURCHASE_DRAFTS:WATCH` in that Warehouse and is **never** gated on `CUSTOMERS:WATCH`" — the
// operator's own premises data, not a third party's. Keying on them would flag every Via Warehouse
// read and make the check noise. They are reached anyway wherever they matter, because a customer
// address is only ever nested under one of the customer-naming fields below.
const IDENTITY_FIELDS = [
  'customer',
  'customerId',
  'customerName',
  'customerDestination',
  'customerDeliveryAddressId',
];

const isProductionContract = (file) =>
  !file.includes('.spec.') && !file.endsWith('/index.ts');

/**
 * Every `const <name> = <body>;` declaration in one contract source, exported or not.
 *
 * Both forms matter. `export const fooSchema = z.strictObject({...})` is the schema a type infers
 * from; a bare `const fooCommonShape = {...}` is spread into two schemas and is how the identified
 * and redacted forms "can never drift in a field that is not the redaction itself". A walk that saw
 * only exported schemas would miss every field that reaches a projection through a shape.
 *
 * The body is taken by bracket balance rather than by regex, so a nested object, a `.refine(...)`
 * callback or a union spanning forty lines is captured whole.
 */
const declarationsIn = (source) => {
  const declarations = new Map();
  const pattern = /(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=/gu;

  for (const match of source.matchAll(pattern)) {
    let cursor = match.index + match[0].length;
    let depth = 0;
    let body = '';

    while (cursor < source.length) {
      const character = source[cursor];
      if ('([{'.includes(character)) {
        depth += 1;
      } else if (')]}'.includes(character)) {
        depth -= 1;
      } else if (character === ';' && depth === 0) {
        break;
      }
      body += character;
      cursor += 1;
    }

    declarations.set(match[1], body);
  }

  return declarations;
};

/** Field names a declaration states directly, e.g. `customerName: z.string()`. */
const declaredFields = (body) =>
  Array.from(body.matchAll(/(?:^|[{,\s])([A-Za-z0-9_$]+)\s*:/gu)).map(
    (match) => match[1],
  );

/** Other declarations this one names — a schema reference or a spread shape. */
const referencedDeclarations = (body) =>
  Array.from(body.matchAll(/\b([A-Za-z0-9_$]+)\b/gu)).map((match) => match[1]);

/**
 * Computes the identity-bearing closure over every contract declaration, then resolves it to the
 * **exported TypeScript type names** a controller can annotate a handler with.
 *
 * Seeded two ways, both rules rather than lists:
 *   1. any declaration stating one of `IDENTITY_FIELDS` directly;
 *   2. every declaration in the `customers` projections module, whose subject *is* the Customer.
 *
 * Then propagated to a fixpoint: a schema that references an identity-bearing schema or spreads an
 * identity-bearing shape is itself identity-bearing. `PurchaseDraftDetail` is reached this way —
 * detail → line → `lineCustomerDestinationSchema` → `customerName` — with no step written down.
 */
export const identityBearingContractTypes = () => {
  const files = globSync(CONTRACTS_GLOB).filter(isProductionContract).sort();

  const declarations = new Map();
  const declarationFile = new Map();
  const typeToSchema = new Map();

  for (const file of files) {
    const source = readFileSync(file, 'utf8');

    for (const [name, body] of declarationsIn(source)) {
      declarations.set(name, body);
      declarationFile.set(name, file);
    }

    // `export type X = z.infer<typeof xSchema>` is uniform across every contract module, which is
    // what lets a handler's return-type annotation be joined to a schema at all.
    for (const match of source.matchAll(
      /export\s+type\s+([A-Za-z0-9_$]+)\s*=\s*z\.infer<\s*typeof\s+([A-Za-z0-9_$]+)\s*>/gu,
    )) {
      typeToSchema.set(match[1], match[2]);
    }
  }

  const identityDeclarations = new Set();

  for (const [name, body] of declarations) {
    const statesIdentityField = declaredFields(body).some((field) =>
      IDENTITY_FIELDS.includes(field),
    );

    // Scoped to the **record** schemas of that module, not to every declaration in it. It also
    // defines two bare value schemas — `addressTextSchema` and `accessNotesSchema` — which the
    // Warehouse's own `lineWarehouseDestinationSchema` shares. Seeding those would propagate
    // identity into the one destination the contract is explicit is *never* gated on
    // `CUSTOMERS:WATCH`, and from there into the **redacted** line form, flagging the very shape
    // that exists to prove the redaction. A shared string value object is not customer identity;
    // the record that carries it is.
    const isCustomerRecord =
      declarationFile.get(name) === CUSTOMER_SUBJECT_MODULE &&
      /^\s*z\s*\.\s*(?:strict)?[oO]bject\s*\(/u.test(body);

    if (statesIdentityField || isCustomerRecord) {
      identityDeclarations.add(name);
    }
  }

  // Fixpoint. Bounded by the declaration count, so it terminates on any graph including a cyclic
  // one; contracts have no cycles today, and this does not depend on that staying true.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, body] of declarations) {
      if (identityDeclarations.has(name)) {
        continue;
      }
      if (
        referencedDeclarations(body).some(
          (reference) =>
            reference !== name && identityDeclarations.has(reference),
        )
      ) {
        identityDeclarations.add(name);
        changed = true;
      }
    }
  }

  const types = new Set();
  for (const [typeName, schemaName] of typeToSchema) {
    if (identityDeclarations.has(schemaName)) {
      types.add(typeName);
    }
  }

  return { types, declarations: identityDeclarations };
};

const HTTP_VERB_DECORATORS = new Set([
  'Get',
  'Post',
  'Put',
  'Patch',
  'Delete',
  'All',
]);

const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//u.test(line))
    .join('\n');

/**
 * Every handler in one controller, with the decorators above it and the contract type it returns.
 *
 * A handler is a method carrying an HTTP verb decorator. Its response type is read from the
 * `): Promise<X>` / `): Promise<X[]>` annotation that closes the parameter list — the annotation is
 * mandatory under this repository's lint rules, so a handler cannot dodge the check by omitting it,
 * and one that somehow did is reported rather than skipped.
 */
const parseHandlers = (file) => {
  const source = stripComments(readFileSync(file, 'utf8'));
  const lines = source.split('\n');

  const handlers = [];
  let pending = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    const decorator = /^\s*@([A-Za-z0-9_$]+)/u.exec(line);
    if (decorator) {
      pending.push({ name: decorator[1], text: line });
      continue;
    }

    if (/\bclass\s+[A-Za-z0-9_$]+/u.test(line)) {
      pending = [];
      continue;
    }

    const method =
      /^\s*(?:public\s+|private\s+|protected\s+|static\s+)?(?:async\s+)?([A-Za-z0-9_$]+)\s*\(/u.exec(
        line,
      );
    if (!method || method[1] === 'constructor') {
      continue;
    }

    const verb = pending.find((entry) => HTTP_VERB_DECORATORS.has(entry.name));
    if (verb) {
      // The annotation may sit many lines below the method name, past a decorated parameter list.
      const window = lines.slice(index, index + 40).join('\n');
      const returnType =
        /\)\s*:\s*Promise<\s*([A-Za-z0-9_$]+)\s*(\[\])?\s*>/u.exec(window);

      handlers.push({
        file,
        methodName: method[1],
        verb: verb.name,
        responseType: returnType ? returnType[1] : null,
        decorators: pending.map((entry) => entry.text).join('\n'),
      });
    }

    pending = [];
  }

  return handlers;
};

const OBSERVES_CUSTOMERS_WATCH =
  /@ObservedPermission\(\s*PermissionId\.CUSTOMERS_WATCH\s*\)/u;

// A handler that already **requires** a `CUSTOMERS:*` Permission needs no observed declaration: the
// identity is gated by the Permission that admits the request. `customers.controller.ts` states the
// same rule in prose — "No read here declares an `@ObservedPermission`. Both already require
// `CUSTOMERS:WATCH`" — and this is that sentence made mechanical.
const REQUIRES_CUSTOMERS_PERMISSION =
  /@RequiredPermission\(\s*PermissionId\.CUSTOMERS_[A-Z_]+\s*\)/u;

/**
 * The rule itself, over an already-parsed handler set: every handler whose response can carry
 * customer identity but which neither requires a `CUSTOMERS:*` Permission nor declares the
 * observed one, **plus** every handler whose return type the parser could not resolve at all.
 *
 * An unresolved return type — a paginated wrapper, a union, or any shape the
 * `Promise<Identifier>` / `Promise<Identifier[]>` parser cannot read — is reported rather than
 * skipped. The parser's blind spot must not become the check's: whether the response can carry
 * customer identity is unknown, not "no", so an unresolved handler is reported with its own
 * message rather than dropped out of the join silently (sad.md §11: "a missed surface leaks
 * silently and forever").
 *
 * Shared by `findObservedPermissionGaps`, which parses the real controller tree, and
 * `gapsInHandlerSet`, which re-runs the same rule over the positive control's mutated in-memory
 * set — so the two cannot silently diverge into different rules.
 */
const gapsFor = (handlers, identityTypes) => {
  const gaps = [];

  for (const handler of handlers) {
    if (handler.responseType === null) {
      gaps.push(
        `${handler.file}::${handler.methodName}: return type could not be resolved by the ` +
          '`Promise<Identifier>` / `Promise<Identifier[]>` parser, so whether it can carry ' +
          'customer identity is unknown — sad.md §10, AC-09a',
      );
      continue;
    }

    if (!identityTypes.has(handler.responseType)) {
      continue;
    }

    const declaresObserved = OBSERVES_CUSTOMERS_WATCH.test(handler.decorators);
    const requiresCustomers = REQUIRES_CUSTOMERS_PERMISSION.test(
      handler.decorators,
    );

    if (!declaresObserved && !requiresCustomers) {
      gaps.push(
        `${handler.file}::${handler.methodName}: returns ${handler.responseType}, which can carry ` +
          'customer identity, but declares neither @ObservedPermission(CUSTOMERS:WATCH) nor a ' +
          'required CUSTOMERS:* Permission — sad.md §10, AC-09a',
      );
    }
  }

  return gaps;
};

/**
 * Every handler whose response can carry customer identity but which neither requires a
 * `CUSTOMERS:*` Permission nor declares the observed one — the violations sad.md §10's check exists
 * to make impossible to merge.
 *
 * `identityTypes` is supplied by the caller rather than recomputed here so a test can drive this
 * rule against a deliberately altered handler set and prove it fails — the positive control the
 * Definition of Done requires ("proven by removing one").
 */
export const findObservedPermissionGaps = (controllerFiles, identityTypes) =>
  gapsFor(
    controllerFiles.flatMap((file) => parseHandlers(file)),
    identityTypes,
  );

/** Exposed so a test can assert the join actually found handlers rather than passing on an empty set. */
export const identityBearingHandlers = (controllerFiles, identityTypes) =>
  controllerFiles
    .flatMap((file) => parseHandlers(file))
    .filter(
      (handler) =>
        handler.responseType !== null && identityTypes.has(handler.responseType),
    )
    .map((handler) => `${handler.file}::${handler.methodName}`);

/** Every handler, so a test can prove a controller was parsed at all. */
export const allHandlers = (controllerFiles) =>
  controllerFiles.flatMap((file) => parseHandlers(file));

/**
 * Strips the observed-Permission declaration from one named handler's decorator text, returning a
 * handler set the rule can be re-run against.
 *
 * This is the positive control, and it deliberately mutates an **in-memory** copy rather than the
 * shipped source: a fixture file under `apps/server/src` would be compiled by `tsc` and linted by
 * `eslint src`, making the deliberate violation a real one in the tree — the same reasoning
 * `access/module-boundaries.spec.ts` records for using inline fixtures.
 */
export const withoutObservedPermission = (controllerFiles, methodName) =>
  controllerFiles.flatMap((file) =>
    parseHandlers(file).map((handler) =>
      handler.methodName === methodName
        ? {
            ...handler,
            decorators: handler.decorators.replace(
              OBSERVES_CUSTOMERS_WATCH,
              '',
            ),
          }
        : handler,
    ),
  );

/** Re-runs the observed-Permission rule over an already-parsed handler set. */
export const gapsInHandlerSet = (handlers, identityTypes) =>
  gapsFor(handlers, identityTypes);
