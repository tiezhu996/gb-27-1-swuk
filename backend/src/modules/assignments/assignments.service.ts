import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Assignment } from '../../common/entities/assignment.entity';
import { AssignmentSubmission, SubmissionStatus } from '../../common/entities/assignment-submission.entity';
import { CourseEnrollment } from '../../common/entities/course-enrollment.entity';

@Injectable()
export class AssignmentsService {
  constructor(
    @InjectRepository(Assignment)
    private readonly assignmentRepository: Repository<Assignment>,
    @InjectRepository(AssignmentSubmission)
    private readonly submissionRepository: Repository<AssignmentSubmission>,
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

  /**
   * 学生提交作业：
   * - 未选修该课程的学生禁止提交
   * - 只有教师退回（status=returned）后，才能在原答案留档的基础上提交一次订正答案
   * - 其余情况（未提交除外）均不允许再次提交，避免覆盖原答案
   */
  async submit(studentId: string, assignmentId: string, data: Partial<AssignmentSubmission>) {
    const assignment = await this.assignmentRepository.findOne({ where: { id: assignmentId } });
    if (!assignment) {
      throw new NotFoundException('作业不存在');
    }

    const enrollment = await this.enrollmentRepository.findOne({
      where: { studentId, courseId: assignment.courseId },
    });
    if (!enrollment) {
      throw new ForbiddenException('未选修该课程，不能提交作业');
    }

    const latest = await this.submissionRepository.findOne({
      where: { studentId, assignmentId },
      order: { attempt: 'DESC' },
    });

    if (!latest) {
      const submission = this.submissionRepository.create({
        ...data,
        studentId,
        assignmentId,
        attempt: 1,
        status: SubmissionStatus.SUBMITTED,
      });
      return this.submissionRepository.save(submission);
    }

    if (latest.status !== SubmissionStatus.RETURNED) {
      throw new BadRequestException(
        latest.status === SubmissionStatus.GRADED
          ? '作业已评分，需教师退回后才能提交订正'
          : '已有待评分的提交，不能重复提交',
      );
    }

    // 原答案保持留档，新增一条订正记录等待评分
    const revision = this.submissionRepository.create({
      ...data,
      studentId,
      assignmentId,
      attempt: latest.attempt + 1,
      parentSubmissionId: latest.id,
      status: SubmissionStatus.SUBMITTED,
    });
    return this.submissionRepository.save(revision);
  }

  /**
   * 教师批改评分：只更新当前提交的评分结果，不触碰历史版本。
   */
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
    if (submission.status === SubmissionStatus.GRADED) {
      throw new BadRequestException('该提交已评分');
    }

    submission.score = score;
    submission.feedback = feedback;
    submission.status = SubmissionStatus.GRADED;
    submission.gradedAt = new Date();

    return this.submissionRepository.save(submission);
  }

  /**
   * 教师退回作业并填写订正要求，只有该作业的任课教师可以操作。
   * 仅已评分的提交可以退回。
   */
  async returnForRevision(teacherId: string, submissionId: string, revisionRequirement: string) {
    if (!revisionRequirement || !revisionRequirement.trim()) {
      throw new BadRequestException('请填写订正要求');
    }

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
      throw new BadRequestException('只能退回已评分的作业');
    }

    submission.status = SubmissionStatus.RETURNED;
    submission.revisionRequirement = revisionRequirement.trim();
    submission.returnedAt = new Date();

    return this.submissionRepository.save(submission);
  }

  async findSubmissionsByAssignment(assignmentId: string) {
    const submissions = await this.submissionRepository.find({
      where: { assignmentId },
      relations: ['student'],
      order: { createdAt: 'DESC' },
    });

    // 每名学生只展示最新一版（教师端列表），历史版本可通过版本记录查看
    const latestByStudent = new Map<string, AssignmentSubmission>();
    for (const sub of submissions) {
      const existing = latestByStudent.get(sub.studentId);
      if (!existing || sub.attempt > existing.attempt) {
        latestByStudent.set(sub.studentId, sub);
      }
    }
    return Array.from(latestByStudent.values());
  }

  /** 学生查看自己的最新一版提交 */
  async findMySubmission(studentId: string, assignmentId: string) {
    return this.submissionRepository.findOne({
      where: { studentId, assignmentId },
      order: { attempt: 'DESC' },
    });
  }

  /** 学生查看自己历次作答（原答案 + 各次订正），供前后对比 */
  async findMySubmissionHistory(studentId: string, assignmentId: string) {
    return this.submissionRepository.find({
      where: { studentId, assignmentId },
      order: { attempt: 'ASC' },
    });
  }

  /** 教师查看某名学生该作业的全部版本 */
  async findSubmissionVersions(teacherId: string, assignmentId: string, studentId: string) {
    const assignment = await this.assignmentRepository.findOne({ where: { id: assignmentId } });
    if (!assignment) {
      throw new NotFoundException('作业不存在');
    }
    if (assignment.teacherId !== teacherId) {
      throw new ForbiddenException('无权查看此作业的提交');
    }

    return this.submissionRepository.find({
      where: { assignmentId, studentId },
      relations: ['student'],
      order: { attempt: 'ASC' },
    });
  }
}
