import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPersonalFieldsToCustomers1738900000001 implements MigrationInterface {
  name = 'AddPersonalFieldsToCustomers1738900000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE manufacturing.customer 
      ADD COLUMN IF NOT EXISTS person_type VARCHAR,
      ADD COLUMN IF NOT EXISTS document_type VARCHAR,
      ADD COLUMN IF NOT EXISTS first_name VARCHAR,
      ADD COLUMN IF NOT EXISTS second_name VARCHAR,
      ADD COLUMN IF NOT EXISTS first_surname VARCHAR,
      ADD COLUMN IF NOT EXISTS second_surname VARCHAR,
      ADD COLUMN IF NOT EXISTS birth_date DATE,
      ADD COLUMN IF NOT EXISTS marital_status VARCHAR,
      ADD COLUMN IF NOT EXISTS sex VARCHAR
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE manufacturing.customer 
      DROP COLUMN IF EXISTS person_type,
      DROP COLUMN IF EXISTS document_type,
      DROP COLUMN IF EXISTS first_name,
      DROP COLUMN IF EXISTS second_name,
      DROP COLUMN IF EXISTS first_surname,
      DROP COLUMN IF EXISTS second_surname,
      DROP COLUMN IF EXISTS birth_date,
      DROP COLUMN IF EXISTS marital_status,
      DROP COLUMN IF EXISTS sex
    `);
  }
}