import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCostToProducts1738900000003 implements MigrationInterface {
    name = 'AddCostToProducts1738900000003'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "manufacturing"."products" ADD "fltCost" NUMERIC(10,2) NOT NULL DEFAULT 0`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "manufacturing"."products" DROP COLUMN "fltCost"`);
    }
}
