/** How a correction resolves a field the submission left out. The rule belongs to the module
 * rather than to the one command that applies it today: the next write that corrects an Item in
 * place has to carry fields forward the same way. */

// A field the request left out is carried forward from the row `findById` already confirmed, never
// silently dropped.
export const correctedValue = (
  stated: string | undefined,
  current: string,
): string => stated ?? current;
