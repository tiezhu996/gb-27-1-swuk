import { Card, Typography, Form, Input, Button, Space, Descriptions, Tag, InputNumber, message, List, Avatar, Modal, Row, Col, Alert, Timeline, Empty } from 'antd';
import { ArrowLeftOutlined, EditOutlined, RollbackOutlined, HistoryOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { assignmentApi } from '@/api/assignment';
import { Assignment, AssignmentType, SubmissionStatus, AssignmentSubmission } from '@/types/assignment';
import { useAuthStore } from '@/store/auth';
import { UserRole } from '@/types/user';

const { Title, Paragraph, Text } = Typography;

export default function AssignmentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submission, setSubmission] = useState<AssignmentSubmission | null>(null);
  const [history, setHistory] = useState<AssignmentSubmission[]>([]);
  const [submissions, setSubmissions] = useState<AssignmentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [form] = Form.useForm();
  const { user } = useAuthStore();

  const isTeacher = user?.role === UserRole.TEACHER;

  useEffect(() => {
    if (id) {
      loadAssignment();
    }
  }, [id]);

  const loadAssignment = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await assignmentApi.get(id);
      setAssignment(data);

      if (isTeacher) {
        const subs = await assignmentApi.getSubmissions(id);
        setSubmissions(subs);
      } else {
        const [mySub, myHistory] = await Promise.all([
          assignmentApi.getMySubmission(id),
          assignmentApi.getMySubmissionHistory(id),
        ]);
        setSubmission(mySub);
        setHistory(myHistory);
        // 订正表单默认留空，不能覆盖原答案
        form.resetFields();
      }
    } finally {
      setLoading(false);
    }
  };

  // 学生首次提交 / 依据退回要求提交订正
  const handleSubmit = async (values: any) => {
    if (!id) return;
    try {
      const result = await assignmentApi.submit(id, {
        textAnswer: values.textAnswer,
      });
      setSubmission(result);
      message.success(submission ? '订正答案已提交，等待教师评分' : '提交成功');
      form.resetFields();
      loadAssignment();
    } catch (error: any) {
      message.error(error.response?.data?.message || '提交失败');
    }
  };

  // 教师退回：填写订正要求
  const handleReturn = (sub: AssignmentSubmission) => {
    let requirement = '';
    Modal.confirm({
      title: '退回订正',
      content: (
        <div style={{ marginTop: 16 }}>
          <Paragraph type="secondary">退回后学生可依据要求提交一次订正答案，原答案与原分数将保留留档。</Paragraph>
          <Input.TextArea
            rows={4}
            placeholder="请填写订正要求"
            defaultValue={sub.revisionRequirement}
            onChange={e => {
              requirement = e.target.value;
            }}
          />
        </div>
      ),
      okText: '确认退回',
      cancelText: '取消',
      onOk: async () => {
        if (!requirement.trim()) {
          message.error('请填写订正要求');
          throw new Error('requirement required');
        }
        try {
          await assignmentApi.returnForRevision(sub.id, requirement);
          message.success('已退回，等待学生订正');
          loadAssignment();
        } catch (error: any) {
          message.error(error.response?.data?.message || '退回失败');
          throw error;
        }
      },
    });
  };

  // 教师评分：只更新当前版本的订正结果
  const handleGrade = (sub: AssignmentSubmission) => {
    let score = sub.score ?? undefined;
    let feedback = sub.feedback ?? '';
    Modal.confirm({
      title: sub.attempt > 1 ? `批改第 ${sub.attempt} 次订正` : '批改作业',
      content: (
        <div style={{ marginTop: 16 }}>
          <Paragraph strong>学生答案：</Paragraph>
          <Paragraph>{sub.textAnswer || '无文本答案'}</Paragraph>
          <Paragraph strong>得分：</Paragraph>
          <InputNumber
            min={0}
            max={assignment?.maxScore ?? 100}
            defaultValue={score}
            onChange={value => {
              score = value as number;
            }}
          />
          <Paragraph strong style={{ marginTop: 16 }}>评语：</Paragraph>
          <Input.TextArea
            rows={3}
            defaultValue={feedback}
            onChange={e => {
              feedback = e.target.value;
            }}
          />
        </div>
      ),
      okText: '提交评分',
      cancelText: '取消',
      onOk: async () => {
        if (score === undefined || score === null) {
          message.error('请输入得分');
          throw new Error('score required');
        }
        try {
          await assignmentApi.grade(sub.id, score, feedback);
          message.success('批改完成');
          loadAssignment();
        } catch (error: any) {
          message.error(error.response?.data?.message || '批改失败');
          throw error;
        }
      },
    });
  };

  // 教师查看某学生历次版本
  const handleViewVersions = async (sub: AssignmentSubmission) => {
    if (!id) return;
    try {
      const versions = await assignmentApi.getSubmissionVersions(id, sub.studentId);
      Modal.info({
        title: '作答与订正记录',
        width: 640,
        content: (
          <Timeline
            style={{ marginTop: 24 }}
            items={versions.map(v => ({
              children: (
                <div>
                  <Space>
                    <Text strong>第 {v.attempt} 次{v.attempt > 1 ? '（订正）' : '（原答案）'}</Text>
                    {getStatusTag(v.status)}
                  </Space>
                  <Paragraph style={{ marginTop: 8, marginBottom: 4 }}>{v.textAnswer || '无文本答案'}</Paragraph>
                  {v.score !== null && v.score !== undefined && <Text>得分：{v.score}</Text>}
                  {v.feedback && <Paragraph type="secondary">评语：{v.feedback}</Paragraph>}
                  {v.revisionRequirement && <Alert type="warning" showIcon message={`订正要求：${v.revisionRequirement}`} />}
                </div>
              ),
            }))}
          />
        ),
      });
    } catch (error: any) {
      message.error(error.response?.data?.message || '查询失败');
    }
  };

  const getTypeText = (type: AssignmentType) => {
    switch (type) {
      case AssignmentType.TEXT:
        return '文本题';
      case AssignmentType.CHOICE:
        return '选择题';
      case AssignmentType.ATTACHMENT:
        return '附件提交';
    }
  };

  const getStatusTag = (status: SubmissionStatus) => {
    switch (status) {
      case SubmissionStatus.SUBMITTED:
        return <Tag color="blue">待批改</Tag>;
      case SubmissionStatus.GRADED:
        return <Tag color="green">已批改</Tag>;
      case SubmissionStatus.RETURNED:
        return <Tag color="orange">待订正</Tag>;
    }
  };

  const renderHistory = () => {
    if (history.length === 0) return null;
    return (
      <Card
        title={
          <Space>
            <HistoryOutlined />
            作答与订正留档
          </Space>
        }
        style={{ marginTop: 24 }}
      >
        <Timeline
          items={history.map(item => ({
            children: (
              <div>
                <Space>
                  <Text strong>
                    第 {item.attempt} 次{item.attempt > 1 ? '（订正答案）' : '（原答案）'}
                  </Text>
                  {getStatusTag(item.status)}
                  <Text type="secondary">{new Date(item.createdAt).toLocaleString()}</Text>
                </Space>
                <Paragraph style={{ marginTop: 8, marginBottom: 4 }}>{item.textAnswer || '无文本答案'}</Paragraph>
                {item.score !== null && item.score !== undefined && (
                  <Text>
                    得分：{item.score} / {assignment?.maxScore}
                  </Text>
                )}
                {item.feedback && <Paragraph type="secondary">教师评语：{item.feedback}</Paragraph>}
                {item.revisionRequirement && (
                  <Alert
                    style={{ marginTop: 8 }}
                    type="warning"
                    showIcon
                    message={`订正要求：${item.revisionRequirement}`}
                  />
                )}
              </div>
            ),
          }))}
        />
      </Card>
    );
  };

  if (loading) {
    return <Card><div style={{ textAlign: 'center', padding: 50 }}>加载中...</div></Card>;
  }

  if (!assignment) {
    return <Card><div style={{ textAlign: 'center', padding: 50 }}>作业不存在</div></Card>;
  }

  // 学生视角下的表单状态
  const noSubmission = !submission;
  const canRevise = submission?.status === SubmissionStatus.RETURNED;
  const showForm = noSubmission || canRevise;

  return (
    <div>
      <Space style={{ marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          返回
        </Button>
        <Title level={3} style={{ margin: 0 }}>
          {assignment.title}
        </Title>
        <Tag>{getTypeText(assignment.type)}</Tag>
      </Space>

      <Row gutter={24}>
        <Col span={16}>
          <Card title="作业详情">
            <Descriptions column={1}>
              <Descriptions.Item label="作业说明">
                <Paragraph>{assignment.description}</Paragraph>
              </Descriptions.Item>
              <Descriptions.Item label="满分">
                {assignment.maxScore} 分
              </Descriptions.Item>
              {assignment.deadline && (
                <Descriptions.Item label="截止时间">
                  {new Date(assignment.deadline).toLocaleString()}
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>

          {!isTeacher && (
            <>
              <Card title="我的答案" style={{ marginTop: 24 }}>
                {submission && (
                  <Space style={{ marginBottom: 16 }}>
                    {getStatusTag(submission.status)}
                    <Text type="secondary">当前为第 {submission.attempt} 次作答</Text>
                  </Space>
                )}

                {submission?.status === SubmissionStatus.GRADED && (
                  <div style={{ padding: 16, background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8 }}>
                    <Paragraph strong>得分：{submission.score} / {assignment.maxScore}</Paragraph>
                    <Paragraph strong style={{ marginBottom: 4 }}>教师评语：</Paragraph>
                    <Paragraph style={{ marginBottom: 0 }}>{submission.feedback || '无'}</Paragraph>
                    <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                      如教师退回作业，可在此提交订正；当前答案与分数已留档，不会被覆盖。
                    </Paragraph>
                  </div>
                )}

                {submission?.status === SubmissionStatus.SUBMITTED && (
                  <Alert type="info" showIcon message="答案已提交，等待教师评分" description={submission.attempt > 1 ? '本次为订正答案。' : undefined} />
                )}

                {canRevise && (
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="教师已退回作业，请按要求订正"
                    description={
                      <div>
                        <Paragraph style={{ marginBottom: 4 }}>
                          <Text strong>订正要求：</Text>
                          {submission.revisionRequirement}
                        </Paragraph>
                        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                          原答案（{submission.score} 分）已保留在下方留档中，提交订正不会覆盖它。
                        </Paragraph>
                      </div>
                    }
                  />
                )}

                {showForm && (
                  <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ marginTop: 16 }}>
                    {assignment.type === AssignmentType.TEXT && (
                      <Form.Item
                        name="textAnswer"
                        label={canRevise ? '订正答案' : '答案'}
                        rules={[{ required: true, message: canRevise ? '请输入订正答案' : '请输入答案' }]}
                      >
                        <Input.TextArea rows={8} placeholder={canRevise ? '请根据订正要求输入新的答案' : '请输入你的答案'} />
                      </Form.Item>
                    )}
                    <Form.Item>
                      <Button type="primary" htmlType="submit" size="large">
                        {canRevise ? '提交订正' : '提交作业'}
                      </Button>
                    </Form.Item>
                  </Form>
                )}
              </Card>

              {renderHistory()}
            </>
          )}

          {isTeacher && (
            <Card title="学生提交" style={{ marginTop: 24 }}>
              <List
                dataSource={submissions}
                locale={{ emptyText: <Empty description="暂无提交" /> }}
                renderItem={(sub) => (
                  <List.Item
                    actions={[
                      <Button key="versions" icon={<HistoryOutlined />} onClick={() => handleViewVersions(sub)}>
                        版本记录
                      </Button>,
                      sub.status === SubmissionStatus.SUBMITTED && (
                        <Button key="grade" type="primary" icon={<EditOutlined />} onClick={() => handleGrade(sub)}>
                          {sub.attempt > 1 ? '批改正' : '批改'}
                        </Button>
                      ),
                      sub.status === SubmissionStatus.GRADED && (
                        <Button key="return" danger icon={<RollbackOutlined />} onClick={() => handleReturn(sub)}>
                          退回订正
                        </Button>
                      ),
                    ].filter(Boolean)}
                  >
                    <List.Item.Meta
                      avatar={<Avatar>{sub.studentId?.[0] || 'U'}</Avatar>}
                      title={
                        <Space>
                          {sub.studentId || '未知用户'}
                          {getStatusTag(sub.status)}
                          {sub.attempt > 1 && <Tag color="purple">第 {sub.attempt} 次（订正）</Tag>}
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={0}>
                          <span>提交时间：{new Date(sub.createdAt).toLocaleString()}</span>
                          {sub.score !== null && sub.score !== undefined && <span>最新得分：{sub.score}</span>}
                          {sub.status === SubmissionStatus.RETURNED && (
                            <span className="ant-tag-orange">订正要求：{sub.revisionRequirement}</span>
                          )}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
}
