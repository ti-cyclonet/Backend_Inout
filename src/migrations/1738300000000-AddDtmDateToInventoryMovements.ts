import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddDtmDateToInventoryMovements1738300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'manufacturing.inventory_movements',
      new TableColumn({
        name: 'dtmDate',
        type: 'date',
        isNullable: true,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('manufacturing.inventory_movements', 'dtmDate');
  }
}
