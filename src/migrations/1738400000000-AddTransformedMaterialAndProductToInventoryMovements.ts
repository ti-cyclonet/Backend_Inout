import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTransformedMaterialAndProductToInventoryMovements1738400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Hacer strMaterialId nullable
    await queryRunner.changeColumn(
      'manufacturing.inventory_movements',
      'strMaterialId',
      new TableColumn({
        name: 'strMaterialId',
        type: 'uuid',
        isNullable: true,
      }),
    );

    // Agregar strTransformedMaterialId
    await queryRunner.addColumn(
      'manufacturing.inventory_movements',
      new TableColumn({
        name: 'strTransformedMaterialId',
        type: 'uuid',
        isNullable: true,
      }),
    );

    // Agregar strProductId
    await queryRunner.addColumn(
      'manufacturing.inventory_movements',
      new TableColumn({
        name: 'strProductId',
        type: 'uuid',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('manufacturing.inventory_movements', 'strProductId');
    await queryRunner.dropColumn('manufacturing.inventory_movements', 'strTransformedMaterialId');
    
    await queryRunner.changeColumn(
      'manufacturing.inventory_movements',
      'strMaterialId',
      new TableColumn({
        name: 'strMaterialId',
        type: 'uuid',
        isNullable: false,
      }),
    );
  }
}
