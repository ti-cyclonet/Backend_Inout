import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCodeToMaterials1738100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Agregar columna como nullable primero
    await queryRunner.query(`
      ALTER TABLE manufacturing.materials 
      ADD COLUMN "strCode" varchar(50)
    `);

    // 2. Actualizar registros existentes con códigos únicos
    await queryRunner.query(`
      UPDATE manufacturing.materials
      SET "strCode" = 'ABC-M-' || LPAD(ROW_NUMBER() OVER (ORDER BY "dtmCreationDate")::text, 5, '0')
      WHERE "strCode" IS NULL
    `);

    // 3. Hacer la columna NOT NULL y UNIQUE
    await queryRunner.query(`
      ALTER TABLE manufacturing.materials 
      ALTER COLUMN "strCode" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE manufacturing.materials 
      ADD CONSTRAINT "UQ_materials_strCode" UNIQUE ("strCode")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE manufacturing.materials 
      DROP COLUMN "strCode"
    `);
  }
}
