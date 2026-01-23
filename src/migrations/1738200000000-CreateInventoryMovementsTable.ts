import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateInventoryMovementsTable1738200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'inventory_movements',
        schema: 'manufacturing',
        columns: [
          {
            name: 'strId',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'strTenantId',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'strMaterialId',
            type: 'uuid',
          },
          {
            name: 'strType',
            type: 'varchar',
            length: '20',
          },
          {
            name: 'strReason',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'fltQuantity',
            type: 'decimal',
            precision: 10,
            scale: 2,
          },
          {
            name: 'fltUnitPrice',
            type: 'decimal',
            precision: 10,
            scale: 2,
          },
          {
            name: 'strReferenceId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'strNotes',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'dtmCreationDate',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['strMaterialId'],
            referencedTableName: 'materials',
            referencedSchema: 'manufacturing',
            referencedColumnNames: ['strId'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('manufacturing.inventory_movements');
  }
}
