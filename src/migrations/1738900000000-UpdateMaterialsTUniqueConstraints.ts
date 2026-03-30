import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateMaterialsTUniqueConstraints1738900000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop existing unique constraints
        await queryRunner.query(`ALTER TABLE manufacturing."materials-t" DROP CONSTRAINT IF EXISTS "UQ_materials-t_strName"`);
        await queryRunner.query(`ALTER TABLE manufacturing."materials-t" DROP CONSTRAINT IF EXISTS "UQ_materials-t_strCode"`);
        
        // Create new composite unique constraint for strName + strTenantId
        await queryRunner.query(`ALTER TABLE manufacturing."materials-t" ADD CONSTRAINT "UQ_materials-t_strName_strTenantId" UNIQUE ("strName", "strTenantId")`);
        
        // Create unique constraint for strCode
        await queryRunner.query(`ALTER TABLE manufacturing."materials-t" ADD CONSTRAINT "UQ_materials-t_strCode" UNIQUE ("strCode")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop new constraints
        await queryRunner.query(`ALTER TABLE manufacturing."materials-t" DROP CONSTRAINT IF EXISTS "UQ_materials-t_strName_strTenantId"`);
        await queryRunner.query(`ALTER TABLE manufacturing."materials-t" DROP CONSTRAINT IF EXISTS "UQ_materials-t_strCode"`);
        
        // Restore old constraints
        await queryRunner.query(`ALTER TABLE manufacturing."materials-t" ADD CONSTRAINT "UQ_materials-t_strName" UNIQUE ("strName")`);
        await queryRunner.query(`ALTER TABLE manufacturing."materials-t" ADD CONSTRAINT "UQ_materials-t_strCode" UNIQUE ("strCode")`);
    }
}
