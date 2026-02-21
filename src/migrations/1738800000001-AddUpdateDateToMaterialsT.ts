import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUpdateDateToMaterialsT1738800000001 implements MigrationInterface {
    name = 'AddUpdateDateToMaterialsT1738800000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "manufacturing"."materials-t" ADD "dtmUpdateDate" TIMESTAMP NOT NULL DEFAULT now()`);
        
        await queryRunner.query(`
            CREATE TRIGGER update_materials_t_modtime 
            BEFORE UPDATE ON "manufacturing"."materials-t" 
            FOR EACH ROW EXECUTE FUNCTION update_modified_column();
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TRIGGER IF EXISTS update_materials_t_modtime ON "manufacturing"."materials-t"`);
        await queryRunner.query(`ALTER TABLE "manufacturing"."materials-t" DROP COLUMN "dtmUpdateDate"`);
    }
}
