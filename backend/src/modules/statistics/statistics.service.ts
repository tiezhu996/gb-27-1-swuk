import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Course } from '../../common/entities/course.entity';
import { CourseEnrollment, EnrollmentStatus } from '../../common/entities/course-enrollment.entity';
import { Assignment } from '../../common/entities/assignment.entity';
import { AssignmentSubmission, SubmissionStatus } from '../../common/entities/assignment-submission.entity';
import { AttendanceRecord, AttendanceStatus } from '../../common/entities/attendance-record.entity';

/**
 * 同一份作业的同一名学生可能有原答案与多次订正记录，
 * 学习统计只取“最新一次已评成绩”，避免按多份成绩重复计算平均。
 */
function pickLatestGraded(submissions: AssignmentSubmission[]): AssignmentSubmission[] {
  const latest = new Map<string, AssignmentSubmission>();
  for (const sub of submissions) {
    if (sub.status !== SubmissionStatus.GRADED || sub.score === null || sub.score === undefined) {
      continue;
    }
    const key = `${sub.assignmentId}:${sub.studentId}`;
    const current = latest.get(key);
    if (!current || sub.attempt > current.attempt) {
      latest.set(key, sub);
    }
  }
  return Array.from(latest.values());
}

function average(scores: number[]): number {
  if (scores.length === 0) {
    return 0;
  }
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

@Injectable()
export class StatisticsService {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(CourseEnrollment)
    private readonly enrollmentRepository: Repository<CourseEnrollment>,
    @InjectRepository(Assignment)
    private readonly assignmentRepository: Repository<Assignment>,
    @InjectRepository(AssignmentSubmission)
    private readonly submissionRepository: Repository<AssignmentSubmission>,
    @InjectRepository(AttendanceRecord)
    private readonly attendanceRepository: Repository<AttendanceRecord>,
  ) {}

  async getTeacherStats(teacherId: string) {
    const courses = await this.courseRepository.find({
      where: { teacherId },
    });

    const courseIds = courses.map(c => c.id);

    const totalSales = await this.enrollmentRepository.count({
      where: { courseId: In(courseIds) },
    });

    const totalRevenue = courses.reduce((sum, course) => {
      if (course.type === 'paid' && course.price) {
        return sum;
      }
      return sum;
    }, 0);

    const attendanceRecords = await this.attendanceRepository.find({
      where: { status: AttendanceStatus.PRESENT },
    });

    const assignments = await this.assignmentRepository.find({
      where: { teacherId },
    });
    const assignmentIds = assignments.map(a => a.id);

    const submissions =
      assignmentIds.length > 0
        ? await this.submissionRepository.find({
            where: { assignmentId: In(assignmentIds), status: SubmissionStatus.GRADED },
          })
        : [];

    // 每份作业每名学生只保留最新一次已评成绩
    const latestGraded = pickLatestGraded(submissions);
    const avgScore = average(latestGraded.map(s => s.score));

    return {
      totalCourses: courses.length,
      totalSales,
      totalRevenue,
      attendanceRate: attendanceRecords.length > 0 ? 100 : 0,
      totalAssignments: assignments.length,
      averageScore: Math.round(avgScore),
    };
  }

  async getStudentStats(studentId: string) {
    const enrollments = await this.enrollmentRepository.find({
      where: { studentId },
      relations: ['course'],
    });

    const courseIds = enrollments.map(e => e.courseId);

    const assignments =
      courseIds.length > 0
        ? await this.assignmentRepository.find({
            where: { courseId: In(courseIds) },
          })
        : [];

    const submissions = await this.submissionRepository.find({
      where: { studentId, status: SubmissionStatus.GRADED },
    });

    const attendanceRecords = await this.attendanceRepository.find({
      where: { studentId },
    });

    const totalStudyHours = enrollments.reduce((sum, e) => {
      return sum + (e.progress || 0);
    }, 0);

    // 同一份作业的多次订正只取最新已评成绩
    const latestGraded = pickLatestGraded(submissions);
    const avgScore = average(latestGraded.map(s => s.score));

    const completedCourses = enrollments.filter(e => e.status === EnrollmentStatus.COMPLETED).length;

    return {
      totalCourses: enrollments.length,
      completedCourses,
      totalStudyHours: Math.round(totalStudyHours / 60),
      totalAssignments: assignments.length,
      completedAssignments: latestGraded.length,
      averageScore: Math.round(avgScore),
      attendanceRecords: attendanceRecords.length,
    };
  }
}
