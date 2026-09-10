import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessRestModule } from 'access/index.js';
import { AuthModule } from 'auth/auth.module.js';
import { CustomerOrdersModule } from 'customer-orders/index.js';
import { CustomersModule } from 'customers/index.js';
import { ItemsModule } from 'items/index.js';
import { PurchaseDraftsModule } from 'purchase-drafts/index.js';
import { createTypeOrmOptions } from 'shared/database/typeorm.options.js';
import { DomainModule } from 'shared/domain/domain.module.js';
import { WriteRateLimitModule } from 'shared/guards/write-rate-limit.module.js';
import { AppLoggerModule } from 'shared/logger/app-logger.module.js';
import { createBullMqOptions } from 'shared/queue/bullmq.options.js';
import { UsersModule } from 'users/users.module.js';
import { WarehousesRestModule } from 'warehouses/index.js';
import { WorkspacesRestModule } from 'workspaces/index.js';

@Module({
  imports: [
    UsersModule,
    ConfigModule.forRoot({ isGlobal: true }),
    AppLoggerModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createTypeOrmOptions(config),
    }),
    DomainModule,
    WriteRateLimitModule,
    AuthModule,
    AccessRestModule,
    ItemsModule,
    CustomerOrdersModule,
    CustomersModule,
    PurchaseDraftsModule,
    WarehousesRestModule,
    WorkspacesRestModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createBullMqOptions(config),
    }),
  ],
})
export class AppModule {}
