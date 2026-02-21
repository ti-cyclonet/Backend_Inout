import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContactFieldsToCustomers1738900000002 implements MigrationInterface {
  name = 'AddContactFieldsToCustomers1738900000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE manufacturing.customer 
      ADD COLUMN IF NOT EXISTS contact_phone VARCHAR,
      ADD COLUMN IF NOT EXISTS contact_email VARCHAR
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE manufacturing.customer 
      DROP COLUMN IF EXISTS contact_phone,
      DROP COLUMN IF EXISTS contact_email
    `);
  }
}