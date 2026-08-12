import { readFileSync } from 'node:fs';

// Static-analysis primitives for the T30 two-level authorization-coverage architecture check
// (docs/features/workspaces/sad.md §8 "Authorization coverage", AC-30, AC-31). These functions
// parse real TypeScript source with lightweight, structural regex/line scanning rather than a full
// TypeScript compiler — the source under scan (NestJS controllers) has a narrow, consistent shape
// (decorators immediately above class/method declarations), so a line-oriented scan is sufficient
// and keeps this module dependency-free.

const HTTP_VERB_DECORATORS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'All']);
const READ_VERBS = new Set(['Get']);
const MUTATING_VERBS = new Set(['Post', 'Put', 'Patch', 'Delete']);

/**
 * Strips full-line `//` comments and `/** ... *\/` block comments so they cannot be mistaken for
 * decorators or declarations. Comments never carry decorator or class/method syntax in this
 * codebase's controllers, so removing them whole is safe.
 */
const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//u.test(line))
    .join('\n');

/**
 * Joins a decorator invocation that spans multiple physical lines (e.g. a `RequiredWorkspacePermission(
 *   WorkspacePermissionId.WORKSPACE_OWNER_ROLE_REASSIGN,
 * )` written across three lines) into one logical line by tracking parenthesis balance.
 */
const joinDecoratorLines = (lines) => {
  const joined = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (/^\s*@\w+/u.test(line)) {
      let merged = line;
      let balance = (line.match(/\(/gu) ?? []).length - (line.match(/\)/gu) ?? []).length;
      let cursor = index;
      while (balance > 0 && cursor + 1 < lines.length) {
        cursor += 1;
        const next = lines[cursor];
        merged += ` ${next.trim()}`;
        balance +=
          (next.match(/\(/gu) ?? []).length - (next.match(/\)/gu) ?? []).length;
      }
      joined.push(merged);
      index = cursor + 1;
    } else {
      joined.push(line);
      index += 1;
    }
  }
  return joined;
};

const DECORATOR_PATTERN = /^\s*@(\w+)(?:\(([\s\S]*)\))?\s*$/u;
const CONTROLLER_DECORATOR_PATTERN = /^\s*@Controller\(\s*['"]([^'"]*)['"]\s*\)\s*$/u;
const CLASS_PATTERN = /\bclass\s+(\w+)/u;
const METHOD_PATTERN =
  /^\s*(?:public\s+|private\s+|protected\s+|static\s+)?(?:async\s+)?(\w+)\s*\(/u;
const RESERVED_METHOD_NAMES = new Set([
  'constructor',
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'function',
]);

/**
 * Parses one controller (or fixture) file's handlers: every class method decorated with an HTTP
 * verb decorator (`@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`, `@All`). For each handler this
 * records its decorators, the guards passed to `@UseGuards(...)`, its HTTP verb, and its full
 * route (the `@Controller` base path plus the verb decorator's own path argument), which is what
 * every rule below (warehouseId presence, guard pairing, read/mutating verb, archived tolerance)
 * inspects.
 */
const parseControllerFile = (filePath) => {
  const source = stripComments(readFileSync(filePath, 'utf8'));
  const lines = joinDecoratorLines(source.split('\n'));

  let basePath = '';
  let pendingDecorators = [];
  const handlers = [];

  for (const line of lines) {
    const controllerMatch = CONTROLLER_DECORATOR_PATTERN.exec(line);
    if (controllerMatch) {
      basePath = controllerMatch[1];
      pendingDecorators = [];
      continue;
    }

    const decoratorMatch = DECORATOR_PATTERN.exec(line);
    if (decoratorMatch) {
      pendingDecorators.push({ name: decoratorMatch[1], args: decoratorMatch[2] ?? '' });
      continue;
    }

    if (CLASS_PATTERN.test(line)) {
      pendingDecorators = [];
      continue;
    }

    const methodMatch = METHOD_PATTERN.exec(line);
    if (methodMatch && !RESERVED_METHOD_NAMES.has(methodMatch[1])) {
      const verbDecorator = pendingDecorators.find((decorator) =>
        HTTP_VERB_DECORATORS.has(decorator.name),
      );
      if (verbDecorator) {
        const pathArgMatch = /['"]([^'"]*)['"]/u.exec(verbDecorator.args);
        const methodPath = pathArgMatch ? pathArgMatch[1] : '';
        const route = [basePath, methodPath].filter(Boolean).join('/');
        const useGuardsDecorator = pendingDecorators.find(
          (decorator) => decorator.name === 'UseGuards',
        );
        const guards = useGuardsDecorator
          ? [...useGuardsDecorator.args.matchAll(/\b(\w+)\b/gu)].map((match) => match[1])
          : [];

        handlers.push({
          methodName: methodMatch[1],
          verb: verbDecorator.name,
          route,
          decorators: pendingDecorators,
          guards,
          hasWorkspacePermission: pendingDecorators.some(
            (decorator) => decorator.name === 'RequiredWorkspacePermission',
          ),
          hasWarehousePermission: pendingDecorators.some(
            (decorator) => decorator.name === 'RequiredPermission',
          ),
          hasArchivedTolerantRead: pendingDecorators.some(
            (decorator) => decorator.name === 'ArchivedTolerantRead',
          ),
        });
      }
      pendingDecorators = [];
    }
  }

  return handlers;
};

/**
 * Classifies every handler reachable from `controllerFiles` into sad.md §8's classes and returns
 * every violation found. This is genuine static analysis over the parsed decorator/guard/route
 * data above, not a lookup against a hardcoded allowlist of file paths — the only allowlists this
 * function consults (`selfProjectionReads`, `infrastructureExempt`,
 * `admittedArchivedTolerantMutations`) are the three named, reasoned exceptions sad.md §8 itself
 * documents by handler identity, and every other handler is classified purely from its own source.
 */
export const classifyControllers = (
  controllerFiles,
  {
    selfProjectionReads = new Set(),
    infrastructureExempt = new Map(),
    admittedArchivedTolerantMutations = new Map(),
  } = {},
) => {
  const violations = [];

  for (const file of controllerFiles) {
    const handlers = parseControllerFile(file);

    for (const handler of handlers) {
      const handlerId = `${file}::${handler.methodName}`;

      if (selfProjectionReads.has(handlerId) || infrastructureExempt.has(handlerId)) {
        continue;
      }

      const { hasWorkspacePermission, hasWarehousePermission } = handler;

      if (!hasWorkspacePermission && !hasWarehousePermission) {
        violations.push(
          `${handlerId}: declares no classification (no Workspace Permission, Warehouse Permission, ` +
            'self-projection-read, or infrastructure-exempt listing) — sad.md §8',
        );
        continue;
      }

      if (hasWorkspacePermission && hasWarehousePermission) {
        violations.push(
          `${handlerId}: declares both a Workspace Permission and a Warehouse Permission — sad.md §8`,
        );
        continue;
      }

      if (hasWorkspacePermission) {
        if (!handler.guards.includes('WorkspaceAccessGuard')) {
          violations.push(
            `${handlerId}: declares a Workspace Permission but is not guarded by WorkspaceAccessGuard ` +
              '(level confusion, sad.md §8, AC-31)',
          );
        }
        if (handler.guards.includes('WarehouseAccessGuard')) {
          violations.push(
            `${handlerId}: declares a Workspace Permission behind WarehouseAccessGuard ` +
              '(level confusion, sad.md §8, AC-31)',
          );
        }
        continue;
      }

      // hasWarehousePermission
      if (!handler.guards.includes('WarehouseAccessGuard')) {
        violations.push(
          `${handlerId}: declares a Warehouse Permission but is not guarded by WarehouseAccessGuard ` +
            '(level confusion, sad.md §8, AC-31)',
        );
      }
      if (handler.guards.includes('WorkspaceAccessGuard')) {
        violations.push(
          `${handlerId}: declares a Warehouse Permission behind WorkspaceAccessGuard ` +
            '(level confusion, sad.md §8, AC-31)',
        );
      }
      if (!handler.route.includes(':warehouseId')) {
        violations.push(
          `${handlerId}: declares a Warehouse Permission but its route carries no warehouseId ` +
            'parameter — sad.md §8 class 2',
        );
      }

      if (!READ_VERBS.has(handler.verb) && !MUTATING_VERBS.has(handler.verb)) {
        violations.push(
          `${handlerId}: HTTP verb @${handler.verb}() resolves to no read/mutating classification — ` +
            'sad.md §8',
        );
      }

      if (MUTATING_VERBS.has(handler.verb) && handler.hasArchivedTolerantRead) {
        if (!admittedArchivedTolerantMutations.has(handlerId)) {
          violations.push(
            `${handlerId}: declares archived tolerance on a mutating handler without an ADR 0003 ` +
              'admitted membership-edge justification',
          );
        }
      }
    }
  }

  return { violations };
};

const FRAMEWORK_IMPORT_PATTERN =
  /from\s+['"](@nestjs\/[^'"]*|typeorm|express|@nestjs\/platform-express)['"]/u;
const DOMAIN_SERVICES_SEGMENT_PATTERN = /\/domain\/services\//u;

/**
 * Returns every file among `domainFiles` that imports a NestJS, TypeORM, or HTTP-adapter symbol
 * (server-architecture.md §Layer responsibilities "Domain" forbids exactly this). Files under a
 * `domain/services/` segment are exempt: server-architecture.md's "Services" section places
 * injectable business services there and requires NestJS DI (`@Injectable`) for them, so the
 * framework-free constraint applies to domain entities and value objects, not services (mirrored
 * by the accepted `workspaces/domain/module-boundaries.spec.ts`).
 */
export const findDomainFrameworkImports = (domainFiles) =>
  domainFiles.filter((file) => {
    if (DOMAIN_SERVICES_SEGMENT_PATTERN.test(file)) {
      return false;
    }
    const source = readFileSync(file, 'utf8');
    return FRAMEWORK_IMPORT_PATTERN.test(source);
  });

/**
 * Returns every file among `files` that imports from the given forbidden module segment (e.g.
 * `access` importing `workspaces`), matching both bare-specifier imports (`from 'workspaces/...'`)
 * and relative imports that traverse into that module.
 */
export const findForbiddenImports = (files, forbiddenModuleSegment) => {
  const importPattern = new RegExp(
    `from\\s+['"]([^'"]*)['"]`,
    'gu',
  );
  const segmentPattern = new RegExp(`(^|/)${forbiddenModuleSegment}(/|$)`, 'u');

  return files.filter((file) => {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      if (segmentPattern.test(specifier)) {
        return true;
      }
    }
    return false;
  });
};
