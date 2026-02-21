import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInvoiceCodeToSales1738700000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add column as nullable first
        await queryRunner.query(`
            ALTER TABLE manufacturing.sales 
            ADD COLUMN IF NOT EXISTS "strInvoiceCode" VARCHAR(50)
        `);
        
        // Update existing rows with generated invoice codes
        await queryRunner.query(`
            UPDATE manufacturing.sales 
            SET "strInvoiceCode" = 'INV-' || "strId" 
            WHERE "strInvoiceCode" IS NULL
        `);
        
        // Now make it NOT NULL and add unique constraint
        await queryRunner.query(`
            ALTER TABLE manufacturing.sales 
            ALTER COLUMN "strInvoiceCode" SET NOT NULL
        `);
        
        await queryRunner.query(`
            ALTER TABLE manufacturing.sales 
            ADD CONSTRAINT "UQ_sales_strInvoiceCode" UNIQUE ("strInvoiceCode")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE manufacturing.sales 
            DROP CONSTRAINT IF EXISTS "UQ_sales_strInvoiceCode"
        `);
        
        await queryRunner.query(`
            ALTER TABLE manufacturing.sales 
            DROP COLUMN IF EXISTS "strInvoiceCode"
        `);
    }
}
