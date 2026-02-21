import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateProductsTable1738400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'manufacturing.products',
        columns: [
          { name: 'strId', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'strTenantId', type: 'varchar', length: '100' },
          { name: 'strName', type: 'varchar', length: '100' },
          { name: 'strDescription', type: 'text', isNullable: true },
          { name: 'fltPrice', type: 'decimal', precision: 10, scale: 2 },
          { name: 'ingQuantity', type: 'decimal', precision: 10, scale: 2, default: 0 },
          { name: 'strMeasurementUnit', type: 'varchar', length: '50' },
          { name: 'ingStockMin', type: 'decimal', precision: 10, scale: 2, isNullable: true },
          { name: 'ingStockMax', type: 'decimal', precision: 10, scale: 2, isNullable: true },
          { name: 'strLocation', type: 'varchar', length: '100', isNullable: true },
          { name: 'strStatus', type: 'varchar', length: '20', default: "'active'" },
          { name: 'dtmCreationDate', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: 'manufacturing.product_composition',
        columns: [
          { name: 'strId', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'strProductId', type: 'uuid' },
          { name: 'strMaterialId', type: 'uuid' },
          { name: 'fltQuantity', type: 'decimal', precision: 10, scale: 2 },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('manufacturing.product_composition');
    await queryRunner.dropTable('manufacturing.products');
  }
}
