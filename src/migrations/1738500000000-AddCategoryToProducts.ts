import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddCategoryToProducts1738500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'manufacturing.products',
      new TableColumn({
        name: 'intCategoryId',
        type: 'int',
        isNullable: true,
      })
    );

    await queryRunner.createForeignKey(
      'manufacturing.products',
      new TableForeignKey({
        columnNames: ['intCategoryId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'manufacturing.categories',
        onDelete: 'SET NULL',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('manufacturing.products');
    const foreignKey = table.foreignKeys.find(fk => fk.columnNames.indexOf('intCategoryId') !== -1);
    if (foreignKey) {
      await queryRunner.dropForeignKey('manufacturing.products', foreignKey);
    }
    await queryRunner.dropColumn('manufacturing.products', 'intCategoryId');
  }
}
