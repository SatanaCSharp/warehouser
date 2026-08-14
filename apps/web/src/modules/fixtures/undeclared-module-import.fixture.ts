// Negative fixture for `modules/module-boundaries.spec.ts`.
//
// `modules/workspace/hooks/useRenameWorkspace` is a real, working import that
// is deliberately **not** part of `modules/workspace`'s declared public
// surface. The boundary spec asserts that scanning this file reports exactly
// one violation, which is what proves the rule has teeth: without it, a spec
// that reported nothing would be indistinguishable from a spec that checked
// nothing.
//
// It lives outside every scanned production tree — `modules/fixtures/` is not a
// module and is excluded from both the scan and the module list — following the
// `tests/access/fixtures/` precedent.
import { useRenameWorkspace } from 'modules/workspace/hooks/useRenameWorkspace';

export const undeclaredModuleImportFixture = useRenameWorkspace;
