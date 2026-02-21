import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUpdateDateToMaterials1738800000000 implements MigrationInterface {
    name = 'AddUpdateDateToMaterials1738800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "manufacturing"."materials" ADD "dtmUpdateDate" TIMESTAMP NOT NULL DEFAULT now()`);
        
        // Crear trigger para actualizar automáticamente la fecha
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION update_modified_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW."dtmUpdateDate" = now();
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);
        
        await queryRunner.query(`
            CREATE TRIGGER update_materials_modtime 
            BEFORE UPDATE ON "manufacturing"."materials" 
            FOR EACH ROW EXECUTE FUNCTION update_modified_column();
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TRIGGER IF EXISTS update_materials_modtime ON "manufacturing"."materials"`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS update_modified_column()`);
        await queryRunner.query(`ALTER TABLE "manufacturing"."materials" DROP COLUMN "dtmUpdateDate"`);
    }
}