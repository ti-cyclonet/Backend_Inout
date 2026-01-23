import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'suppliers', schema: 'manufacturing' })
export class Supplier {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'varchar', length: 100 })
  strTenantId: string;

  @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
  strCode: string; // Código autoincremental ABC-S-00001

  @Column({ type: 'varchar', length: 255 })
  strName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  strContactName: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  strAddress: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  strDocumentType: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  strDocumentNumber: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  strContactEmail: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  strContactPhone: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  strStatus: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  dtmCreationDate: Date;
}
