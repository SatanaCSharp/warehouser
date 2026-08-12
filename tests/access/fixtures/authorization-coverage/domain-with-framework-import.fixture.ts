// Fixture only. Proves the check fails when a file under `workspaces/domain` imports a framework
// (NestJS/HTTP/TypeORM) symbol (server-architecture.md §Layer responsibilities — "Domain").
import { Injectable } from '@nestjs/common';

@Injectable()
export class FixtureDomainServiceWithFrameworkImport {}
