import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum CountStatus {
  DRAFT = 'DRAFT',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  APPLIED = 'APPLIED',
}

@Entity({ name: 'physical_counts', schema: 'manufacturing' })
export class PhysicalCount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  tenantId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  countCode: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string;

  @Column({ type: 'uuid', nullable: true })
  warehouseId: string;

  @Column({ type: 'enum', enum: CountStatus, default: CountStatus.DRAFT })
  status: CountStatus;

  @Column({ type: 'jsonb', nullable: true })
  items: {
    materialId: string;
    materialCode: string;
    materialName: string;
    systemStock: number;
    physicalStock: number;
    difference: number;
    unit: string;
    notes?: string;
  }[];

  @Column({ type: 'int', default: 0 })
  totalItems: number;

  @Column({ type: 'int', default: 0 })
  countedItems: number;

  @Column({ type: 'int', default: 0 })
  discrepancies: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  performedBy: string;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  appliedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
