import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddDisplayModeToMarketplaceConfig1738900000007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'marketplace_config',
      new TableColumn({
        name: 'displayMode',
        type: 'varchar',
        length: '10',
        default: "'grid'",
        isNullable: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('marketplace_config', 'displayMode');
  }
}
