import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('customer', { schema: 'manufacturing' })
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'potential_user_id', nullable: true })
  @Index()
  potentialUserId: number;

  @Column()
  @Index()
  tenantId: string;

  @Column({ name: 'customer_code', unique: true, nullable: true })
  customerCode: string;

  @Column({ name: 'business_name', nullable: true })
  businessName: string;

  @Column({ name: 'contact_person', nullable: true })
  contactPerson: string;

  @Column({ name: 'contact_phone', nullable: true })
  contactPhone: string;

  @Column({ name: 'contact_email', nullable: true })
  contactEmail: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ name: 'document_number', nullable: true })
  documentNumber: string;

  @Column({ name: 'document_dv', nullable: true })
  documentDv: string;

  @Column({ name: 'person_type', nullable: true })
  personType: string;

  @Column({ name: 'document_type', nullable: true })
  documentType: string;

  @Column({ name: 'first_name', nullable: true })
  firstName: string;

  @Column({ name: 'second_name', nullable: true })
  secondName: string;

  @Column({ name: 'first_surname', nullable: true })
  firstSurname: string;

  @Column({ name: 'second_surname', nullable: true })
  secondSurname: string;

  @Column({ name: 'birth_date', nullable: true })
  birthDate: Date;

  @Column({ name: 'marital_status', nullable: true })
  maritalStatus: string;

  @Column({ nullable: true })
  sex: string;

  @Column({ nullable: true })
  email: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ default: 'ACTIVE' })
  status: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
