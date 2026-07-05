// @ts-check

/**
 * Lint-Staged Configuration for Monorepo
 *
 * This configuration ensures that ESLint runs with the nearest (local) config
 * for each staged file, respecting package-specific rules and overrides.
 *
 * How it works:
 * 1. Groups staged files by their nearest package directory
 * 2. Dynamically filters files using ESLint's ignore patterns from config
 * 3. Runs ESLint from each package directory with its local config
 * 4. Auto-fixes issues where possible
 * 5. Validates no warnings/errors remain (fails commit if any exist)
 * 6. Applies Prettier formatting after linting
 *
 * Benefits:
 * - Only staged files are processed (memory efficient)
 * - ESLint config is the single source of truth for ignore patterns
 * - Each package uses its own ESLint rules (respects local configs)
 * - Automatic fixes are applied and re-staged
 * - Clean separation: linting per package, formatting globally
 * - Zero tolerance: Any remaining warnings or errors will fail the commit
 *
 * Performance:
 * - Time Complexity: O(n*m) where n=files, m=directory depth
 * - Space Complexity: O(n) for grouping files
 * - Optimized with early exits and minimal file system operations
 */

const path = require('path');
const fs = require('fs');
const { ESLint } = require('eslint');

/**
 * Finds the nearest directory containing an ESLint config file
 * @param {string} filePath - Absolute or relative path to the file being linted
 * @returns {string|null} - Absolute path to the package directory or null
 */
const findNearestEslintConfig = (filePath) => {
  const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);

  let currentDir = path.dirname(absolutePath);
  const root = process.cwd();

  while (currentDir.startsWith(root)) {
    const hasEslintConfig =
        fs.existsSync(path.join(currentDir, 'eslint.config.mjs')) ||
        fs.existsSync(path.join(currentDir, 'eslint.config.js'));

    const hasPackageJson = fs.existsSync(
        path.join(currentDir, 'package.json'),
    );

    // Found a package with its own ESLint config
    if (hasEslintConfig && hasPackageJson) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    // Reached filesystem root without finding config
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return null;
};

/**
 * Groups files by their nearest ESLint config directory
 * @param {string[]} files - Array of staged file paths (absolute)
 * @returns {Map<string, string[]>} - Map of package directory to relative file paths
 */
const groupFilesByPackage = (files) => {
  const packageGroups = new Map();

  files.forEach((file) => {
    const packageDir = findNearestEslintConfig(file);

    if (packageDir) {
      // Convert to relative path from package directory for cleaner output
      const relativePath = path.relative(packageDir, file);

      if (!packageGroups.has(packageDir)) {
        packageGroups.set(packageDir, []);
      }
      packageGroups.get(packageDir).push(relativePath);
    }
  });

  return packageGroups;
};

/**
 * Filters files based on ESLint ignore patterns from the config
 * @param {string[]} files - Array of file paths (relative to packageDir)
 * @param {string} packageDir - Absolute path to package directory
 * @returns {Promise<string[]>} - Filtered array of files not ignored by ESLint
 */
const filterIgnoredFiles = async (files, packageDir) => {
  try {
    // Create ESLint instance with config from the package directory
    const eslint = new ESLint({ cwd: packageDir });

    // Convert relative paths to absolute for ESLint API
    const absoluteFiles = files.map((f) => path.join(packageDir, f));

    // Check which files are ignored
    const results = await Promise.all(
        absoluteFiles.map(async (filePath) => ({
          filePath,
          isIgnored: await eslint.isPathIgnored(filePath),
        }))
    );

    // Filter out ignored files and convert back to relative paths
    const filteredFiles = results
        .filter(({ isIgnored }) => !isIgnored)
        .map(({ filePath }) => path.relative(packageDir, filePath));

    return filteredFiles;
  } catch (error) {
    // If ESLint fails to load config, log warning and return all files
    console.warn(
        `⚠️  Failed to load ESLint config in ${packageDir}: ${error.message}`
    );
    return files;
  }
};

/**
 * Generates ESLint commands for each package group
 * Uses shell subcommands to ensure proper error handling
 * @param {string[]} filenames - Array of absolute staged file paths
 * @returns {Promise<string[]>} - Array of shell commands to execute
 */
const generateEslintCommands = async (filenames) => {
  if (filenames.length === 0) {
    return [];
  }

  const packageGroups = groupFilesByPackage(filenames);
  const commands = [];

  for (const [packageDir, files] of packageGroups.entries()) {
    // Filter out files that are ignored by ESLint config
    const filteredFiles = await filterIgnoredFiles(files, packageDir);

    if (filteredFiles.length === 0) {
      // All files in this package are ignored, skip
      continue;
    }

    // Escape file paths for shell execution
    const filesArg = filteredFiles.map((f) => `"${f}"`).join(' ');

    // Combined command: fix, then check with exit on error
    // Wrap in sh -c to ensure proper shell execution
    const command =
        `sh -c 'cd "${packageDir}" && ` +
        `npx eslint ${filesArg} --fix && ` +
        `npx eslint ${filesArg} --max-warnings=0 || ` +
        `(echo "\\n  ❌ ESLint failed in ${packageDir}\\nFiles: ${filteredFiles.join(', ')}\\n" >&2 && exit 1)'`;

    commands.push(command);
  }

  return commands;
};

/**
 * @type {import('lint-staged').Config}
 */
module.exports = {
  // Lint JavaScript/TypeScript files with their nearest ESLint config
  '*.{js,jsx,ts,tsx}': async (filenames) => {
    const eslintCommands = await generateEslintCommands(filenames);
    const prettierCommand = `prettier --write ${filenames.map((f) => `"${f}"`).join(' ')}`;

    return [...eslintCommands, prettierCommand];
  },

  // Format other files with Prettier only
  '*.{json,css,md}': (filenames) => {
    return `prettier --write ${filenames.map((f) => `"${f}"`).join(' ')}`;
  },
};
