import { Card, Typography, Form, Input, Button, Space, Descriptions, Tag, Alert, message, List, Avatar, Modal, Row, Col } from 'antd';
import { ArrowLeftOutlined, EditOutlined, RollbackOutlined, HistoryOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { assignmentApi } from '@/api/assignment';
import { Assignment, AssignmentType, SubmissionStatus, AssignmentSubmission, SubmissionRevision } from '@/types/assignment';
import { useAuthStore } from '@/store/auth';
import { UserRole } from '@/types/user';

const { Title, Paragraph, Text } = Typography;

export default function AssignmentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submission, setSubmission] = useState<AssignmentSubmission | null>(null);
  const [submissions, setSubmissions] = useState<AssignmentSubmission[]>([]);
  const [revisions, setRevisions] = useState<SubmissionRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [returnTarget, setReturnTarget] = useState<AssignmentSubmission | null>(null);
  const [returnRequirements, setReturnRequirements] = useState('');
  const [returning, setReturning] = useState(false);
  const [history, setHistory] = useState<{ submission: AssignmentSubmission; revisions: SubmissionRevision[] } | null>(null);
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
        const mySub = await assignmentApi.getMySubmission(id);
        setSubmission(mySub);
        if (mySub) {
          form.setFieldsValue({
            textAnswer: mySub.status === SubmissionStatus.RETURNED ? '' : mySub.textAnswer,
          });
          const revs = await assignmentApi.getRevisions(mySub.id);
          setRevisions(revs);
        } else {
          setRevisions([]);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (values: any) => {
    if (!id) return;
    try {
      const result = await assignmentApi.submit(id, {
        textAnswer: values.textAnswer,
      });
      setSubmission(result);
      message.success(result.revisionCount > 0 ? '订正已提交，等待老师批改' : '提交成功');
      loadAssignment();
    } catch (error: any) {
      message.error(error.response?.data?.message || '提交失败');
    }
  };

  const handleGrade = (submission: AssignmentSubmission) => {
    Modal.confirm({
      title: '批改作业',
      content: (
        <div style={{ marginTop: 16 }}>
          <Paragraph strong>学生答案：</Paragraph>
          <Paragraph>{submission.textAnswer || '无文本答案'}</Paragraph>
        </div>
      ),
      okText: '批改',
      onOk: async () => {
        const score = 85;
        const feedback = '做得很好！';
        try {
          await assignmentApi.grade(submission.id, score, feedback);
          message.success('批改完成');
          loadAssignment();
        } catch (error: any) {
          message.error(error.response?.data?.message || '批改失败');
        }
      },
    });
  };

  const handleReturn = async () => {
    if (!returnTarget) return;
    if (!returnRequirements.trim()) {
      message.error('请填写订正要求');
      return;
    }
    setReturning(true);
    try {
      await assignmentApi.returnForRevision(returnTarget.id, returnRequirements.trim());
      message.success('已退回，等待学生订正');
      setReturnTarget(null);
      setReturnRequirements('');
      loadAssignment();
    } catch (error: any) {
      message.error(error.response?.data?.message || '退回失败');
    } finally {
      setReturning(false);
    }
  };

  const showHistory = async (sub: AssignmentSubmission) => {
    try {
      const revs = await assignmentApi.getRevisions(sub.id);
      setHistory({ submission: sub, revisions: revs });
    } catch (error: any) {
      message.error(error.response?.data?.message || '加载订正记录失败');
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
        return <Tag color="orange">已退回待订正</Tag>;
    }
  };

  if (loading) {
    return <Card><div style={{ textAlign: 'center', padding: 50 }}>加载中...</div></Card>;
  }

  if (!assignment) {
    return <Card><div style={{ textAlign: 'center', padding: 50 }}>作业不存在</div></Card>;
  }

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
            <Card title="我的答案" style={{ marginTop: 24 }}>
              {submission && getStatusTag(submission.status)}
              {submission?.status === SubmissionStatus.RETURNED && (
                <Alert
                  style={{ marginTop: 16 }}
                  type="warning"
                  showIcon
                  message="老师已退回，请按订正要求修改后重新提交"
                  description={submission.revisionRequirements}
                />
              )}
              {submission?.status === SubmissionStatus.GRADED && (
                <div style={{ marginTop: 16, padding: 16, background: '#f5f5f5', borderRadius: 8 }}>
                  <Paragraph strong>得分：{submission.score} / {assignment.maxScore}</Paragraph>
                  <Paragraph strong>教师反馈：</Paragraph>
                  <Paragraph>{submission.feedback}</Paragraph>
                </div>
              )}
              {revisions.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <Paragraph strong><HistoryOutlined /> 历史留档（原答案与原分数）：</Paragraph>
                  {revisions.map((rev, index) => (
                    <div key={rev.id} style={{ marginBottom: 12, padding: 12, background: '#fafafa', borderRadius: 8 }}>
                      <Paragraph strong>第 {revisions.length - index} 次提交</Paragraph>
                      <Paragraph>原答案：{rev.textAnswer || '无文本答案'}</Paragraph>
                      <Paragraph>原得分：{rev.score ?? '-'} / {assignment.maxScore}</Paragraph>
                      {rev.feedback && <Paragraph>教师反馈：{rev.feedback}</Paragraph>}
                      <Text type="secondary">
                        批改时间：{rev.gradedAt ? new Date(rev.gradedAt).toLocaleString() : '-'}
                      </Text>
                    </div>
                  ))}
                </div>
              )}
              {submission?.status !== SubmissionStatus.GRADED && (
                <Form
                  form={form}
                  layout="vertical"
                  onFinish={handleSubmit}
                  style={{ marginTop: 16 }}
                >
                  {assignment.type === AssignmentType.TEXT && (
                    <Form.Item name="textAnswer" label="答案" rules={[{ required: true, message: '请输入答案' }]}>
                      <Input.TextArea rows={8} placeholder="请输入你的答案" />
                    </Form.Item>
                  )}
                  <Form.Item>
                    <Space>
                      <Button type="primary" htmlType="submit" size="large">
                        {submission?.status === SubmissionStatus.RETURNED
                          ? '提交订正'
                          : submission
                            ? '重新提交'
                            : '提交作业'}
                      </Button>
                    </Space>
                  </Form.Item>
                </Form>
              )}
            </Card>
          )}

          {isTeacher && (
            <Card title="学生提交" style={{ marginTop: 24 }}>
              <List
                dataSource={submissions}
                locale={{ emptyText: '暂无提交' }}
                renderItem={(sub) => (
                  <List.Item
                    actions={[
                      sub.status === SubmissionStatus.SUBMITTED && (
                        <Button type="primary" icon={<EditOutlined />} onClick={() => handleGrade(sub)}>
                          批改
                        </Button>
                      ),
                      sub.status === SubmissionStatus.GRADED && (
                        <Button danger icon={<RollbackOutlined />} onClick={() => { setReturnTarget(sub); setReturnRequirements(''); }}>
                          退回订正
                        </Button>
                      ),
                      (sub.revisionCount > 0 || sub.status === SubmissionStatus.RETURNED) && (
                        <Button type="link" icon={<HistoryOutlined />} onClick={() => showHistory(sub)}>
                          订正记录
                        </Button>
                      ),
                    ]}
                  >
                    <List.Item.Meta
                      avatar={<Avatar>{sub.studentId?.[0] || 'U'}</Avatar>}
                      title={
                        <Space>
                          {sub.studentId || '未知用户'}
                          {getStatusTag(sub.status)}
                          {sub.revisionCount > 0 && <Tag>已订正 {sub.revisionCount} 次</Tag>}
                        </Space>
                      }
                      description={
                        <Space>
                          <span>提交时间：{new Date(sub.createdAt).toLocaleString()}</span>
                          {sub.score !== null && <span>得分：{sub.score}</span>}
                          {sub.status === SubmissionStatus.RETURNED && sub.returnedAt && (
                            <span>退回时间：{new Date(sub.returnedAt).toLocaleString()}</span>
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

      <Modal
        title="退回订正"
        open={!!returnTarget}
        onOk={handleReturn}
        onCancel={() => setReturnTarget(null)}
        okText="退回"
        confirmLoading={returning}
      >
        <Paragraph strong>学生答案：</Paragraph>
        <Paragraph>{returnTarget?.textAnswer || '无文本答案'}</Paragraph>
        <Paragraph strong>订正要求（必填，学生将按此要求重新提交）：</Paragraph>
        <Input.TextArea
          rows={4}
          value={returnRequirements}
          onChange={(e) => setReturnRequirements(e.target.value)}
          placeholder="请填写订正要求，例如：第 2 题论证不充分，请补充说明"
        />
      </Modal>

      <Modal
        title="订正记录（历史留档）"
        open={!!history}
        footer={null}
        onCancel={() => setHistory(null)}
      >
        {history && history.revisions.length === 0 && <Paragraph>暂无历史版本</Paragraph>}
        {history?.revisions.map((rev, index) => (
          <div key={rev.id} style={{ marginBottom: 12, padding: 12, background: '#fafafa', borderRadius: 8 }}>
            <Paragraph strong>第 {history.revisions.length - index} 次提交（已留档）</Paragraph>
            <Paragraph>原答案：{rev.textAnswer || '无文本答案'}</Paragraph>
            <Paragraph>原得分：{rev.score ?? '-'}</Paragraph>
            {rev.feedback && <Paragraph>教师反馈：{rev.feedback}</Paragraph>}
            {rev.revisionRequirements && <Paragraph>订正要求：{rev.revisionRequirements}</Paragraph>}
            <Text type="secondary">
              批改时间：{rev.gradedAt ? new Date(rev.gradedAt).toLocaleString() : '-'}
            </Text>
          </div>
        ))}
      </Modal>
    </div>
  );
}
