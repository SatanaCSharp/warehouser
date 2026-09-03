import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// T6 — the executable form of the DoD's purity rule: "`customers/domain` imports no NestJS, HTTP or
// TypeORM symbol", and of sad.md §10's hard rule that `customers` never imports `purchase-drafts`.
//
// This follows `customer-orders/module-boundaries.spec.ts`'s static-source-scan idiom
// (`readdirSync`/`readFileSync` + regex), narrowed to the two rules this task's DoD names. The scan
// reads the *specifier* each production file imports, which is the rule as stated: a domain mapper
// may name a shared TypeORM persistence entity by type — `customer-orders`' mapper already does —
// while the domain itself imports no framework symbol of its own.
const moduleDirectory = __dirname;
const domainDirectory = join(moduleDirectory, 'domain');
const usecaseModulePath = join(
  moduleDirectory,
  'usecases',
  'usecase.module.ts',
);
const sourceRoot = join(__dirname, '..');

// The module list is exactly the directories directly under `src/`
// (adr/14-08-2026-domain-owned-flat-modules.md §Flatness).
const FORBIDDEN_SIBLING = 'purchase-drafts';

// server-architecture.md §Domain — "Domain entities and value objects must not import NestJS, HTTP
// adapters, BullMQ, TypeORM, or concrete persistence models." Forbidden everywhere under `domain/`,
// domain services included: a domain service reaches persistence through an injected repository
// class, never through TypeORM itself, and never through an HTTP or queue transport.
const FORBIDDEN_DOMAIN_SPECIFIERS = [
  '@nestjs/typeorm',
  'typeorm',
  'express',
  'node:http',
  'http',
  'bullmq',
];

// NestJS itself is forbidden in the rule-stating domain — value objects, predicates, error
// factories and mappers, which decide and construct without a framework. `domain/services/` is the
// one exception and only for the DI marker: sad.md §5 requires `CustomerAddressBookService` to be
// "registered on the `UsecaseModule`", and a provider Nest can register is a class carrying
// `@Injectable()`. server-architecture.md §Domain scopes its prohibition to "domain entities and
// value objects" for exactly this reason, and every existing feature service —
// `customer-orders/domain/services/customer-order-lifecycle.service.ts`,
// `demand-allocation.service.ts`, `purchase-drafts/domain/services/purchase-draft-assembly.service.ts`
// — has the same shape.
const FORBIDDEN_NESTJS_SPECIFIERS = ['@nestjs/common', '@nestjs/core'];

// server-error-handling.md §5 — "Domain code and use cases throw framework-independent errors and
// do not import NestJS `HttpException` classes." That holds in a domain service too, so the
// exception above buys the decorator and nothing else.
const FORBIDDEN_DOMAIN_SYMBOLS = /\bHttpException\b|\bHttpStatus\b/u;

const collectProductionSources = (
  directory: string,
): Array<{ path: string; source: string }> =>
  readdirSync(directory).flatMap((entry) => {
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      return collectProductionSources(absolute);
    }
    if (!entry.endsWith('.ts') || entry.includes('.spec.')) {
      return [];
    }
    return [
      {
        path: absolute.slice(sourceRoot.length + 1),
        source: readFileSync(absolute, 'utf8'),
      },
    ];
  });

const importedSpecifiers = (source: string): string[] =>
  Array.from(
    source.matchAll(/(?:from|require\()\s*['"](?<specifier>[^'"]+)['"]/gu),
  ).map((match) => match.groups?.specifier ?? '');

// Catches both spellings of the dependency: a bare specifier (intra-application imports resolve
// through `baseUrl: ./src`) and a relative traversal out of `customers/` into the sibling.
const forbiddenSiblingImportPattern = new RegExp(
  `from\\s+['"](?:\\.\\.\\/)*${FORBIDDEN_SIBLING}\\/`,
  'u',
);

describe('customers module boundaries', () => {
  const domainSources = collectProductionSources(domainDirectory);
  const moduleSources = collectProductionSources(moduleDirectory);

  it('discovers the production sources under customers/domain/', () => {
    expect(domainSources.length).toBeGreaterThan(0);
  });

  it('imports no HTTP or TypeORM symbol anywhere under customers/domain/', () => {
    const offenders = domainSources.flatMap(({ path, source }) =>
      importedSpecifiers(source)
        .filter((specifier) => FORBIDDEN_DOMAIN_SPECIFIERS.includes(specifier))
        .map((specifier) => `${path} -> ${specifier}`),
    );

    expect(offenders).toEqual([]);
  });

  it('imports no NestJS symbol outside customers/domain/services/', () => {
    const offenders = domainSources
      .filter(({ path }) => !path.includes(join('domain', 'services')))
      .flatMap(({ path, source }) =>
        importedSpecifiers(source)
          .filter((specifier) =>
            FORBIDDEN_NESTJS_SPECIFIERS.includes(specifier),
          )
          .map((specifier) => `${path} -> ${specifier}`),
      );

    expect(offenders).toEqual([]);
  });

  it('discovers the rule-stating domain sources the NestJS ban applies to', () => {
    // Guards the filter above against passing because it excluded everything.
    expect(
      domainSources.filter(
        ({ path }) => !path.includes(join('domain', 'services')),
      ).length,
    ).toBeGreaterThan(0);
  });

  it('names no NestJS HTTP exception anywhere under customers/domain/', () => {
    const offenders = domainSources
      .filter(({ source }) => FORBIDDEN_DOMAIN_SYMBOLS.test(source))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it('rejects a fixture that does import a framework symbol, proving the scan has teeth', () => {
    const fixture =
      "import { Injectable } from '@nestjs/common';\nimport { Column } from 'typeorm';";

    expect(
      importedSpecifiers(fixture).filter((specifier) =>
        FORBIDDEN_DOMAIN_SPECIFIERS.includes(specifier),
      ),
    ).toEqual(['typeorm']);
    expect(
      importedSpecifiers(fixture).filter((specifier) =>
        FORBIDDEN_NESTJS_SPECIFIERS.includes(specifier),
      ),
    ).toEqual(['@nestjs/common']);
    expect(
      FORBIDDEN_DOMAIN_SYMBOLS.test(
        "throw new HttpException('nope', HttpStatus.BAD_REQUEST);",
      ),
    ).toBe(true);
  });

  // sad.md §10 — the dependency edge is one-directional: `purchase-drafts` may reach `customers`
  // through its declared public surface; `customers` never imports `purchase-drafts` back.
  it('imports nothing from purchase-drafts anywhere in the module', () => {
    const offenders = moduleSources.filter(({ source }) =>
      forbiddenSiblingImportPattern.test(source),
    );

    expect(offenders.map(({ path }) => path)).toEqual([]);
  });

  // sad.md §5 — `CustomerAddressBookService` is registered on the `UsecaseModule` and **not**
  // exported. The `providers`/`exports` declaration is the module's public surface, and this is its
  // static half; `usecases/usecase.module.di.spec.ts` compiles the graph to prove the consequence.
  it('registers CustomerAddressBookService and keeps it off the module surface', () => {
    const source = readFileSync(usecaseModulePath, 'utf8');
    const providersBlock = /providers:\s*\[(?<providers>[^\]]*)\]/u.exec(
      source,
    );
    const exportsBlock = /exports:\s*\[(?<exported>[^\]]*)\]/u.exec(source);

    expect(providersBlock?.groups?.providers).toMatch(
      /\bCustomerAddressBookService\b/u,
    );
    expect(exportsBlock?.groups?.exported ?? '').not.toMatch(
      /\bCustomerAddressBookService\b/u,
    );
  });

  it('rejects a fixture that does import from purchase-drafts', () => {
    expect(
      forbiddenSiblingImportPattern.test(
        "import { PurchaseDraftEntity } from 'purchase-drafts/domain/entities/purchase-draft';",
      ),
    ).toBe(true);
    expect(
      forbiddenSiblingImportPattern.test(
        "import { PurchaseDraftEntity } from '../../purchase-drafts/domain/entities/purchase-draft';",
      ),
    ).toBe(true);
  });
});
