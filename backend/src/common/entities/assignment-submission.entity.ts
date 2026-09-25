import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Assignment } from './assignment.entity';
import { User } from './user.entity';

export enum SubmissionStatus {
  // 首次/订正答案已提交，等待评分
  SUBMITTED = 'submitted',
  // 已评分（定稿）
  GRADED = 'graded',
  // 教师退回，要求学生订正
  RETURNED = 'returned',
}

@Entity('assignment_submissions')
// 同一份作业同一名学生可保留多个版本（原答案 + 历次订正），由版本号保证唯一
@Index('uq_submissions_assignment_student_attempt', ['assignmentId', 'studentId', 'attempt'], { unique: true })
export class AssignmentSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  assignmentId: string;

  @Column()
  studentId: string;

  // 第几次作答：1 为原答案，2 及以后为各次订正
  @Column({ type: 'int', default: 1 })
  attempt: number;

  @Column({ type: 'text', nullable: true })
  textAnswer: string;

  @Column({ type: 'simple-json', nullable: true })
  choiceAnswers: any;

  @Column({ type: 'simple-array', nullable: true })
  attachmentUrls: string[];

  @Column({ type: 'enum', enum: SubmissionStatus, default: SubmissionStatus.SUBMITTED })
  status: SubmissionStatus;

  @Column({ type: 'int', nullable: true })
  score: number;

  @Column({ type: 'text', nullable: true })
  feedback: string;

  // 教师退回时填写的订正要求（仅在 status=returned 的原答案上填写）
  @Column({ type: 'text', nullable: true })
  revisionRequirement: string;

  // 订正答案所依据的上一版本提交 id
  @Column({ type: 'uuid', nullable: true })
  parentSubmissionId: string;

  @Column({ type: 'timestamp', nullable: true })
  returnedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  gradedAt: Date;

  @ManyToOne(() => Assignment)
  @JoinColumn({ name: 'assignmentId' })
  assignment: Assignment;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'studentId' })
  student: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
