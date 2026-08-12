// Fixture only — never imported or compiled by the server build. Proves the T30 authorization
// coverage check fails a user-accessible handler that declares neither a Workspace Permission, a
// Warehouse Permission, nor an explicitly listed self-projection-read / infrastructure-exempt
// classification (spec.md AC-30, AC-31; sad.md §8 "Authorization coverage").
import { Controller, Get, UseGuards } from '@nestjs/common';

import { SessionAuthGuard } from 'shared/guards/session-auth.guard';

@Controller('api/v1/fixture/unclassified')
export class UnclassifiedHandlerFixtureController {
  @Get()
  @UseGuards(SessionAuthGuard)
  async readSomething(): Promise<void> {}
}
