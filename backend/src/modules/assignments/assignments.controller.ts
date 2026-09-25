import { Controller, Get, Post, Param, Body, UseGuards, Request, Query, ForbiddenException } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../../common/entities/user.entity';

@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Get()
  findByCourse(@Query('courseId') courseId: string) {
    return this.assignmentsService.findByCourse(courseId);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Request() req, @Body() data: any) {
    if (req.user.role !== UserRole.TEACHER) {
      throw new ForbiddenException('只有教师可以布置作业');
    }
    return this.assignmentsService.create(req.user.id, data);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.assignmentsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/submit')
  submit(@Param('id') assignmentId: string, @Body() data: any, @Request() req) {
    if (req.user.role !== UserRole.STUDENT) {
      throw new ForbiddenException('只有学生可以提交作业');
    }
    return this.assignmentsService.submit(req.user.id, assignmentId, data);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/my-submission')
  findMySubmission(@Param('id') assignmentId: string, @Request() req) {
    return this.assignmentsService.findMySubmission(req.user.id, assignmentId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/my-submission/history')
  findMySubmissionHistory(@Param('id') assignmentId: string, @Request() req) {
    return this.assignmentsService.findMySubmissionHistory(req.user.id, assignmentId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/submissions')
  findSubmissions(@Param('id') assignmentId: string, @Request() req) {
    if (req.user.role !== UserRole.TEACHER) {
      throw new ForbiddenException('只有教师可以查看提交列表');
    }
    return this.assignmentsService.findSubmissionsByAssignment(assignmentId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/submissions/versions')
  findSubmissionVersions(
    @Param('id') assignmentId: string,
    @Query('studentId') studentId: string,
    @Request() req,
  ) {
    return this.assignmentsService.findSubmissionVersions(req.user.id, assignmentId, studentId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('submissions/:submissionId/grade')
  grade(
    @Param('submissionId') submissionId: string,
    @Body() body: { score: number; feedback: string },
    @Request() req,
  ) {
    if (req.user.role !== UserRole.TEACHER) {
      throw new ForbiddenException('只有教师可以批改作业');
    }
    return this.assignmentsService.grade(req.user.id, submissionId, body.score, body.feedback);
  }

  @UseGuards(JwtAuthGuard)
  @Post('submissions/:submissionId/return')
  returnForRevision(
    @Param('submissionId') submissionId: string,
    @Body() body: { revisionRequirement: string },
    @Request() req,
  ) {
    if (req.user.role !== UserRole.TEACHER) {
      throw new ForbiddenException('只有教师可以退回作业');
    }
    return this.assignmentsService.returnForRevision(
      req.user.id,
      submissionId,
      body.revisionRequirement,
    );
  }
}
