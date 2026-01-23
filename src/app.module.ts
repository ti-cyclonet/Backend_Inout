import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { MaterialsModule } from './materials/material.module';
import { MaterialsTModule } from './materials-t/material.t.module';
import { TasksModule } from './tasks/tasks.module';
import { CommonModule } from './common/common.module';
import { PeriodsModule } from './periods/periods.module';
import { CustomerParametersPeriodsModule } from './customer-parameters-periods/customer-parameters-periods.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { PurchasesModule } from './purchases/purchases.module';
import { CategoriesModule } from './categories/categories.module';
import { Material } from './materials/entities/material.entity';
import { MaterialImage } from './materials/entities/material-image.entity';
import { Activity } from './materials/entities/activity.entity';
import { MaterialT } from './materials-t/entities/material-t.entity';
import { CompositionOne } from './materials-t/entities/material-composition.entity';
import { Supplier } from './suppliers/entities/supplier.entity';
import { PurchaseRecord } from './purchases/entities/purchase-record.entity';
import { Category } from './categories/entities/category.entity';
import { InventoryMovement } from './inventory-movements/entities/inventory-movement.entity';
import { AuthModule } from './auth/auth.module';
import { InventoryMovementsModule } from './inventory-movements/inventory-movements.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),

    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: +process.env.DB_PORT,
      database: process.env.DB_NAME,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      entities: [Material, MaterialImage, Activity, MaterialT, CompositionOne, Supplier, PurchaseRecord, Category, InventoryMovement], 
      synchronize: true,
    }),
    AuthModule,
    MaterialsModule,
    MaterialsTModule, 
    TasksModule,
    CommonModule,
    PeriodsModule,
    CustomerParametersPeriodsModule,
    SuppliersModule,
    PurchasesModule,
    CategoriesModule,
    InventoryMovementsModule
  ],
})
export class AppModule {}