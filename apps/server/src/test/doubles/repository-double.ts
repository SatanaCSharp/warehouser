/**
 * Types a partial jest double as the concrete repository a use case's
 * constructor expects.
 *
 * The double keeps its own literal type, so `expect(double.findById)` still
 * sees a `jest.Mock`, while the value is accepted where the real repository is
 * required. Only the methods the use case under test may touch are stubbed —
 * an unexpected call is a loud `TypeError`, never a silent `undefined` — and
 * the `Partial<TRepository>` constraint still rejects a stub named after a
 * method the repository does not have.
 */
export const repositoryDouble =
  <TRepository>() =>
  <TDouble extends Partial<TRepository>>(
    double: TDouble,
  ): TDouble & TRepository =>
    double as TDouble & TRepository;
