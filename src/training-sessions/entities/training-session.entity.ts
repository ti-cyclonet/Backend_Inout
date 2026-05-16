import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'training_sessions', schema: 'manufacturing' })
export class TrainingSession {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'varchar', length: 100 })
  strTenantId: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  strCode: string;

  @Column({ type: 'varchar', length: 200 })
  strTitle: string;

  @Column({ type: 'text', nullable: true })
  strDescription: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  strInstructor: string;

  @Column({ type: 'date' })
  dtmDate: string;

  @Column({ type: 'int', default: 60 })
  intDurationMinutes: number;

  @Column({ type: 'int', default: 0 })
  intAttendees: number;

  @Column({ type: 'varchar', length: 20, default: 'SCHEDULED' })
  strStatus: string; // SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED

  @Column({ type: 'text', nullable: true })
  strNotes: string;

  @CreateDateColumn()
  dtmCreationDate: Date;

  @UpdateDateColumn()
  dtmUpdateDate: Date;
}
