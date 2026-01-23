import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Material } from '../../materials/entities/material.entity';
import { MaterialT } from '../../materials-t/entities/material-t.entity';

@Entity({ name: 'categories', schema: 'manufacturing' })
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 100 })
  tenantId: string;

  @Column({ type: 'varchar', default: 'active' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Material, material => material.category)
  materials: Material[];

  @OneToMany(() => MaterialT, materialT => materialT.category)
  materialsT: MaterialT[];
}
