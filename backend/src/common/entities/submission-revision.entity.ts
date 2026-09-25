import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { AssignmentSubmission } from './assignment-submission.entity';

@Entity('submission_revisions')
export class SubmissionRevision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  submissionId: string;

  @Column({ type: 'text', nullable: true })
  textAnswer: string;

  @Column({ type: 'simple-json', nullable: true })
  choiceAnswers: any;

  @Column({ type: 'simple-array', nullable: true })
  attachmentUrls: string[];

  @Column({ type: 'int', nullable: true })
  score: number;

  @Column({ type: 'text', nullable: true })
  feedback: string;

  @Column({ type: 'timestamp', nullable: true })
  gradedAt: Date;

  @Column({ type: 'text', nullable: true })
  revisionRequirements: string;

  @Column({ type: 'timestamp', nullable: true })
  returnedAt: Date;

  @ManyToOne(() => AssignmentSubmission)
  @JoinColumn({ name: 'submissionId' })
  submission: AssignmentSubmission;

  @CreateDateColumn()
  archivedAt: Date;
}
