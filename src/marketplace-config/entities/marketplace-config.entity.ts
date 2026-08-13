import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'marketplace_config', schema: 'manufacturing' })
export class MarketplaceConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  tenantId: string;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  slug: string;

  @Column({ type: 'json' })
  selectedProductIds: string[];

  @Column({ type: 'varchar', length: 20, nullable: true })
  whatsapp: string;

  @Column({ type: 'varchar', length: 7, nullable: true })
  brandColor: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  welcomeMessage: string;

  @Column({ type: 'json', nullable: true })
  schedule: { day: string; open: string; close: string; active: boolean }[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}