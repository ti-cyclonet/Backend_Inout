import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCodeToMaterialsT1738100000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Agregar columna como nullable primero
    await queryRunner.query(`
      ALTER TABLE manufacturing."materials-t" 
      ADD COLUMN "strCode" varchar(50)
    `);

    // 2. Actualizar registros existentes con códigos únicos
    await queryRunner.query(`
      UPDATE manufacturing."materials-t"
      SET "strCode" = 'ABC-T-' || LPAD(ROW_NUMBER() OVER (ORDER BY "dtmCreationDate")::text, 5, '0')
      WHERE "strCode" IS NULL
    `);

    // 3. Hacer la columna NOT NULL y UNIQUE
    await queryRunner.query(`
      ALTER TABLE manufacturing."materials-t" 
      ALTER COLUMN "strCode" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE manufacturing."materials-t" 
      ADD CONSTRAINT "UQ_materials_t_strCode" UNIQUE ("strCode")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE manufacturing."materials-t" 
      DROP COLUMN "strCode"
    `);
  }
}
