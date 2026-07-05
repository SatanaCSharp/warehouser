import { MovementType } from "@warehouser/shared-types";

export function calcNetStock(
  movements: Array<{ type: MovementType; quantity: number }>
): number {
  return movements.reduce((acc, m) => {
    if (m.type === MovementType.In) return acc + m.quantity;
    if (m.type === MovementType.Out) return acc - m.quantity;
    return acc;
  }, 0);
}
