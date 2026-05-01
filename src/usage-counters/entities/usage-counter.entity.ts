import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity({ name: 'usage_counters', schema: 'manufacturing' })
@Unique(['tenantId', 'variableName'])
export class UsageCounter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  tenantId: string;

  @Column({ type: 'varchar', length: 50 })
  variableName: string;

  @Column({ type: 'int', default: 0 })
  currentCount: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
