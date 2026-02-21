import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCodeToProducts1738600000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE manufacturing.products 
            ADD COLUMN IF NOT EXISTS "strCode" VARCHAR(50)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE manufacturing.products 
            DROP COLUMN IF EXISTS "strCode"
        `);
    }
}
