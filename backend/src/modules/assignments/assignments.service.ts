import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Assignment } from '../../common/entities/assignment.entity';
import { AssignmentSubmission, SubmissionStatus } from '../../common/entities/assignment-submission.entity';
import { SubmissionRevision } from '../../common/entities/submission-revision.entity';
import { CourseEnrollment } from '../../common/entities/course-enrollment.entity';

@Injectable()
export class AssignmentsService {
  constructor(
    @InjectRepository(Assignment)
    private readonly assignmentRepository: Repository<Assignment>,
    @InjectRepository(AssignmentSubmission)
    private readonly submissionRepository: Repository<AssignmentSubmission>,
    @InjectRepository(SubmissionRevision)
    private readonly revisionRepository: Repository<SubmissionRevision>,
    @InjectRepository(CourseEnrollment)
    private readonly enrollmentRepository: Repository<CourseEnrollment>,
  ) {}

  async findByCourse(courseId: string) {
    return this.assignmentRepository.find({
      where: { courseId },
      relations: ['teacher'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const assignment = await this.assignmentRepository.findOne({
      where: { id },
      relations: ['teacher', 'lesson'],
    });
    if (!assignment) {
      throw new NotFoundException('作业不存在');
    }
    return assignment;
  }

  async create(userId: string, data: Partial<Assignment>) {
    const assignment = this.assignmentRepository.create({
      ...data,
      teacherId: userId,
    });
    return this.assignmentRepository.save(assignment);
  }

  async submit(studentId: string, assignmentId: string, data: Partial<AssignmentSubmission>) {
    const assignment = await this.assignmentRepository.findOne({
      where: { id: assignmentId },
    });
    if (!assignment) {
      throw new NotFoundException('作业不存在');
    }

    const enrollment = await this.enrollmentRepository.findOne({
      where: { studentId, courseId: assignment.courseId },
    });
    if (!enrollment) {
      throw new ForbiddenException('未选修此课程，无法提交作业');
    }

    const existingSubmission = await this.submissionRepository.findOne({
      where: { studentId, assignmentId },
    });

    if (existingSubmission) {
      if (existingSubmission.status === SubmissionStatus.GRADED) {
        throw new BadRequestException('作业已批改，如需订正请等待老师退回');
      }
      const isRevision = existingSubmission.status === SubmissionStatus.RETURNED;
      existingSubmission.textAnswer = data.textAnswer;
      existingSubmission.choiceAnswers = data.choiceAnswers;
      existingSubmission.attachmentUrls = data.attachmentUrls;
      existingSubmission.status = SubmissionStatus.SUBMITTED;
      if (isRevision) {
        // 订正提交：原答案与原分数已留档，新答案等待评分
        existingSubmission.score = null;
        existingSubmission.feedback = null;
        existingSubmission.gradedAt = null;
        existingSubmission.revisionCount = Number(existingSubmission.revisionCount || 0) + 1;
      }
      return this.submissionRepository.save(existingSubmission);
    }

    const submission = this.submissionRepository.create({
      textAnswer: data.textAnswer,
      choiceAnswers: data.choiceAnswers,
      attachmentUrls: data.attachmentUrls,
      studentId,
      assignmentId,
      status: SubmissionStatus.SUBMITTED,
    });
    return this.submissionRepository.save(submission);
  }

  async grade(teacherId: string, submissionId: string, score: number, feedback: string) {
    const submission = await this.submissionRepository.findOne({
      where: { id: submissionId },
      relations: ['assignment'],
    });

    if (!submission) {
      throw new NotFoundException('提交不存在');
    }
    if (submission.assignment.teacherId !== teacherId) {
      throw new ForbiddenException('无权批改此作业');
    }
    if (submission.status !== SubmissionStatus.SUBMITTED) {
      throw new BadRequestException('仅待批改的提交可以评分');
    }

    // 订正后的再次评分只更新当前提交（订正结果），历史成绩保留在订正记录中
    submission.score = score;
    submission.feedback = feedback;
    submission.status = SubmissionStatus.GRADED;
    submission.gradedAt = new Date();

    return this.submissionRepository.save(submission);
  }

  async returnForRevision(teacherId: string, submissionId: string, revisionRequirements: string) {
    const submission = await this.submissionRepository.findOne({
      where: { id: submissionId },
      relations: ['assignment'],
    });

    if (!submission) {
      throw new NotFoundException('提交不存在');
    }
    if (submission.assignment.teacherId !== teacherId) {
      throw new ForbiddenException('无权退回此作业');
    }
    if (submission.status !== SubmissionStatus.GRADED) {
      throw new BadRequestException('仅已批改的提交可以退回订正');
    }
    if (!revisionRequirements || !revisionRequirements.trim()) {
      throw new BadRequestException('退回时请填写订正要求');
    }

    // 原答案和原分数留档，之后可查询
    const revision = this.revisionRepository.create({
      submissionId: submission.id,
      textAnswer: submission.textAnswer,
      choiceAnswers: submission.choiceAnswers,
      attachmentUrls: submission.attachmentUrls,
      score: submission.score,
      feedback: submission.feedback,
      gradedAt: submission.gradedAt,
      revisionRequirements,
      returnedAt: new Date(),
    });
    await this.revisionRepository.save(revision);

    submission.status = SubmissionStatus.RETURNED;
    submission.revisionRequirements = revisionRequirements;
    submission.returnedAt = new Date();

    return this.submissionRepository.save(submission);
  }

  async findRevisions(userId: string, submissionId: string) {
    const submission = await this.submissionRepository.findOne({
      where: { id: submissionId },
      relations: ['assignment'],
    });
    if (!submission) {
      throw new NotFoundException('提交不存在');
    }
    const isOwner = submission.studentId === userId;
    const isTeacher = submission.assignment.teacherId === userId;
    if (!isOwner && !isTeacher) {
      throw new ForbiddenException('无权查看订正记录');
    }
    return this.revisionRepository.find({
      where: { submissionId },
      order: { archivedAt: 'DESC' },
    });
  }

  async findSubmissionsByAssignment(assignmentId: string) {
    return this.submissionRepository.find({
      where: { assignmentId },
      relations: ['student'],
      order: { createdAt: 'DESC' },
    });
  }

  async findMySubmission(studentId: string, assignmentId: string) {
    return this.submissionRepository.findOne({
      where: { studentId, assignmentId },
    });
  }
}
