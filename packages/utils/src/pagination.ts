import type { PaginatedResponse, PaginationDto } from "@warehouser/shared-types";

export function paginate<T>(items: T[], dto: PaginationDto): PaginatedResponse<T> {
  const page = dto.page ?? 1;
  const limit = dto.limit ?? 20;
  const start = (page - 1) * limit;
  return {
    data: items.slice(start, start + limit),
    total: items.length,
    page,
    limit
  };
}
