import { readFileSync } from 'node:fs';

// Static extraction of the server's resolved HTTP route table
// (docs/change-requests/modules-level-refactor/sad.md §5.5, CR-AC-11). The repository has no
// `@nestjs/swagger` and no route-listing code, and a runtime capture would need the application to
// bootstrap, which needs a database the unit tier does not have. So this module parses controller
// **source** the way `tests/access/authorization-coverage-classifier.mjs` already does — line
// oriented regex/structural scanning, never loading Nest.
//
// A route entry deliberately records **no file path and no class name**: those are exactly what the
// refactor moves. What must not change is the surface a client sees — method, full path, guard
// classes, permission metadata and the request DTO class — so that is all an entry carries.

const HTTP_VERB_DECORATORS = new Map([
  ['Get', 'GET'],
  ['Post', 'POST'],
  ['Put', 'PUT'],
  ['Patch', 'PATCH'],
  ['Delete', 'DELETE'],
  ['All', 'ALL'],
]);

const PERMISSION_DECORATORS = new Set([
  'RequiredPermission',
  'RequiredWorkspacePermission',
]);

/**
 * Strips full-line `//` comments and block comments so prose can never be mistaken for a decorator
 * or a declaration. Controllers in this codebase never carry decorator syntax inside a comment,
 * so removing comments whole is safe.
 */
const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//u.test(line))
    .join('\n');

/**
 * Joins a decorator invocation written across several physical lines (e.g. a
 * `@RequiredWorkspacePermission(\n  WorkspacePermissionId.WORKSPACE_OWNER_ROLE_REASSIGN,\n)`) into
 * one logical line by tracking parenthesis balance. A parameter decorator such as
 * `@Body() input: WarehouseWriteDto,` is already balanced and passes through untouched.
 */
const joinDecoratorLines = (lines) => {
  const joined = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (/^\s*@\w+/u.test(line)) {
      let merged = line;
      let balance =
        (line.match(/\(/gu) ?? []).length - (line.match(/\)/gu) ?? []).length;
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

const CONTROLLER_DECORATOR_PATTERN =
  /^\s*@Controller\(\s*['"]([^'"]*)['"]\s*\)\s*$/u;
const DECORATOR_PATTERN = /^\s*@(\w+)(?:\(([\s\S]*)\))?\s*$/u;
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
const BODY_PARAMETER_PATTERN = /@Body\(\s*\)\s*\w+\??\s*:\s*([\w.]+)/u;

// A multi-line decorator argument keeps the trailing comma prettier writes; it is formatting, not
// metadata, so it is normalized away and a reflow of the same argument does not read as a change.
const normalizeArgs = (args) =>
  args.replace(/\s+/gu, ' ').trim().replace(/,$/u, '').trim();

/** Reads the handler signature starting at `index`, following it across lines until its parameter
 * list closes, so a `@Body()` parameter declared on its own line is still visible. */
const readSignature = (lines, index) => {
  let signature = lines[index];
  let balance =
    (signature.match(/\(/gu) ?? []).length -
    (signature.match(/\)/gu) ?? []).length;
  let cursor = index;
  while (balance > 0 && cursor + 1 < lines.length) {
    cursor += 1;
    signature += ` ${lines[cursor].trim()}`;
    balance +=
      (lines[cursor].match(/\(/gu) ?? []).length -
      (lines[cursor].match(/\)/gu) ?? []).length;
  }
  return signature;
};

const joinPath = (basePath, handlerPath) =>
  `/${[basePath, handlerPath].filter(Boolean).join('/')}`;

/**
 * Extracts every HTTP route declared by one controller file as
 * `{ method, path, guards, permission, dto }`.
 */
export const extractRoutes = (filePath) => {
  const lines = joinDecoratorLines(
    stripComments(readFileSync(filePath, 'utf8')).split('\n'),
  );

  let basePath = '';
  let pendingDecorators = [];
  const routes = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    const controllerMatch = CONTROLLER_DECORATOR_PATTERN.exec(line);
    if (controllerMatch) {
      basePath = controllerMatch[1];
      pendingDecorators = [];
      continue;
    }

    const decoratorMatch = DECORATOR_PATTERN.exec(line);
    if (decoratorMatch) {
      pendingDecorators.push({
        name: decoratorMatch[1],
        args: decoratorMatch[2] ?? '',
      });
      continue;
    }

    if (CLASS_PATTERN.test(line)) {
      pendingDecorators = [];
      continue;
    }

    const methodMatch = METHOD_PATTERN.exec(line);
    if (!methodMatch || RESERVED_METHOD_NAMES.has(methodMatch[1])) {
      continue;
    }

    const verbDecorator = pendingDecorators.find((decorator) =>
      HTTP_VERB_DECORATORS.has(decorator.name),
    );
    if (verbDecorator) {
      const pathArgMatch = /['"]([^'"]*)['"]/u.exec(verbDecorator.args);
      const useGuardsDecorator = pendingDecorators.find(
        (decorator) => decorator.name === 'UseGuards',
      );
      const permissionDecorator = pendingDecorators.find((decorator) =>
        PERMISSION_DECORATORS.has(decorator.name),
      );
      const bodyMatch = BODY_PARAMETER_PATTERN.exec(
        readSignature(lines, index),
      );

      routes.push({
        method: HTTP_VERB_DECORATORS.get(verbDecorator.name),
        path: joinPath(basePath, pathArgMatch ? pathArgMatch[1] : ''),
        guards: useGuardsDecorator
          ? [...useGuardsDecorator.args.matchAll(/\b(\w+)\b/gu)].map(
              (match) => match[1],
            )
          : [],
        permission: permissionDecorator
          ? `${permissionDecorator.name}(${normalizeArgs(permissionDecorator.args)})`
          : null,
        dto: bodyMatch ? bodyMatch[1] : null,
      });
    }
    pendingDecorators = [];
  }

  return routes;
};

const routeOrder = (left, right) =>
  `${left.path} ${left.method}`.localeCompare(`${right.path} ${right.method}`);

/** The whole route table across `controllerFiles`, sorted so the capture is order-independent. */
export const buildRouteTable = (controllerFiles) =>
  [...controllerFiles].flatMap((file) => extractRoutes(file)).sort(routeOrder);

/** Every `METHOD path` pair served more than once — a shadowed route, which is what splitting one
 * controller into several can silently introduce (CR-AC-11: "no path shadowed and none
 * unreachable"). */
export const findShadowedRoutes = (routes) => {
  const seen = new Map();
  for (const route of routes) {
    const key = `${route.method} ${route.path}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => `${key} is declared ${count} times`)
    .sort();
};
