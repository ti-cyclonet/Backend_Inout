import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class Application {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'text',
    unique: true,
  })
  strName: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  strDescription: string;

  @Column({
    type: 'text',
    default: '/assets/img/default.jpg',
  })
  strUrlImage: string;

  @Column('text', {
    unique: true,
  })
  strSlug: string;

  @Column('text', {
    array: true,
    default: [],
  })
  strTags: string[]; 
}
