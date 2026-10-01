import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Lote de armado (ASSEMBLE) o desarmado (DISASSEMBLE) de un kit. Sus
 * movimientos de Kardex referencian este registro (strReferenceId).
 */
@Entity({ name: 'combo_assemblies', schema: 'manufacturing' })
@Index(['strTenantId', 'strComboId'])
export class ComboAssembly {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'varchar', length: 100 })
  strTenantId: string;

  @Column({ type: 'uuid' })
  strComboId: string;

  @Column({ type: 'varchar', length: 12 })
  strType: 'ASSEMBLE' | 'DISASSEMBLE';

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  fltQuantity: number;

  /** Costo unitario del lote (suma del costo de los componentes). */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  fltUnitCost: number;

  @Column({ type: 'varchar', length: 50 })
  strBatchReference: string;

  @Column({ type: 'date' })
  dtmDate: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  strNotes: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  strCreatedBy: string | null;

  @CreateDateColumn()
  dtmCreationDate: Date;
}
