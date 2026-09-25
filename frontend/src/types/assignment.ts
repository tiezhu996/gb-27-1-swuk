export enum AssignmentType {
  TEXT = 'text',
  CHOICE = 'choice',
  ATTACHMENT = 'attachment',
}

export enum SubmissionStatus {
  SUBMITTED = 'submitted',
  GRADED = 'graded',
  RETURNED = 'returned',
}

export interface Assignment {
  id: string;
  title: string;
  description: string;
  courseId: string;
  lessonId: string;
  teacherId: string;
  type: AssignmentType;
  questions?: any;
  deadline?: Date;
  maxScore: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssignmentSubmission {
  id: string;
  assignmentId: string;
  studentId: string;
  textAnswer?: string;
  choiceAnswers?: any;
  attachmentUrls?: string[];
  status: SubmissionStatus;
  score?: number;
  feedback?: string;
  gradedAt?: Date;
  revisionRequirements?: string;
  returnedAt?: Date;
  revisionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubmissionRevision {
  id: string;
  submissionId: string;
  textAnswer?: string;
  choiceAnswers?: any;
  attachmentUrls?: string[];
  score?: number;
  feedback?: string;
  gradedAt?: Date;
  revisionRequirements?: string;
  returnedAt?: Date;
  archivedAt: Date;
}
