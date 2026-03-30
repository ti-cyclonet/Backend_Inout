import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class UpdateCustomersTable1738900000000 implements MigrationInterface {
  name = 'UpdateCustomersTable1738900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop old userId column
    await queryRunner.dropColumn('customer', 'userId');

    // Add new columns
    await queryRunner.addColumns('customer', [
      new TableColumn({
        name: 'potential_user_id',
        type: 'int',
        isNullable: true,
      }),
      new TableColumn({
        name: 'customer_code',
        type: 'varchar',
        length: '50',
        isUnique: true,
        isNullable: true,
      }),
      new TableColumn({
        name: 'business_name',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
      new TableColumn({
        name: 'contact_person',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
      new TableColumn({
        name: 'phone',
        type: 'varchar',
        length: '20',
        isNullable: true,
      }),
      new TableColumn({
        name: 'email',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
      new TableColumn({
        name: 'address',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'status',
        type: 'varchar',
        length: '20',
        default: "'ACTIVE'",
      }),
    ]);

    // Create index on potential_user_id
    await queryRunner.createIndex('customer', new TableIndex({
      name: 'IDX_customer_potential_user_id',
      columnNames: ['potential_user_id'],
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop new columns
    await queryRunner.dropColumns('customer', [
      'potential_user_id',
      'customer_code',
      'business_name',
      'contact_person',
      'phone',
      'email',
      'address',
      'status',
    ]);

    // Add back old userId column
    await queryRunner.addColumn('customer', new TableColumn({
      name: 'userId',
      type: 'varchar',
      isUnique: true,
    }));
  }
}