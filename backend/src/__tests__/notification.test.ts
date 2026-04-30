import 'dotenv/config';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import User from '../models/User';
import Notification from '../models/Notification';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-chars-long';
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await mongoose.connection.dropDatabase();
});

function makeToken(user: { _id: unknown; email: string; role: string }): string {
  return jwt.sign({ _id: String(user._id), email: user.email, role: user.role }, process.env.JWT_SECRET!, { expiresIn: '1h' });
}

async function seedUsers() {
  const user1 = await User.create({ name: 'User1', email: 'u1@test.com', password: 'pass12345', role: 'employee' });
  const user2 = await User.create({ name: 'User2', email: 'u2@test.com', password: 'pass12345', role: 'employee' });
  return { user1, token1: makeToken(user1), user2, token2: makeToken(user2) };
}

async function seedNotification(userId: mongoose.Types.ObjectId, isRead = false) {
  return Notification.create({
    userId,
    type: 'schedule_published',
    title: 'לוח משמרות פורסם',
    body: 'גוף ההתראה',
    isRead,
  });
}

describe('GET /api/v1/notifications', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });

  it('user sees only own notifications', async () => {
    const { user1, token1, user2 } = await seedUsers();
    await seedNotification(user1._id);
    await seedNotification(user2._id);

    const res = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${token1}`);
    expect(res.status).toBe(200);
    expect(res.body.notifications.length).toBe(1);
    expect(String(res.body.notifications[0].userId)).toBe(String(user1._id));
  });

  it('filters by isRead=false', async () => {
    const { user1, token1 } = await seedUsers();
    await seedNotification(user1._id, false);
    await seedNotification(user1._id, true);

    const res = await request(app).get('/api/v1/notifications?isRead=false').set('Authorization', `Bearer ${token1}`);
    expect(res.status).toBe(200);
    expect(res.body.notifications.length).toBe(1);
    expect(res.body.notifications[0].isRead).toBe(false);
  });
});

describe('PATCH /api/v1/notifications/:id/read', () => {
  it('returns 401 with no token', async () => {
    const { user1 } = await seedUsers();
    const n = await seedNotification(user1._id);
    const res = await request(app).patch(`/api/v1/notifications/${n._id}/read`);
    expect(res.status).toBe(401);
  });

  it('user cannot mark another user\'s notification as read', async () => {
    const { user1, token2 } = await seedUsers();
    const n = await seedNotification(user1._id);
    const res = await request(app).patch(`/api/v1/notifications/${n._id}/read`).set('Authorization', `Bearer ${token2}`);
    expect(res.status).toBe(404);
  });

  it('user can mark own notification as read', async () => {
    const { user1, token1 } = await seedUsers();
    const n = await seedNotification(user1._id, false);
    const res = await request(app).patch(`/api/v1/notifications/${n._id}/read`).set('Authorization', `Bearer ${token1}`);
    expect(res.status).toBe(200);
    expect(res.body.notification.isRead).toBe(true);
  });
});

describe('PATCH /api/v1/notifications/read-all', () => {
  it('marks all own unread notifications as read', async () => {
    const { user1, token1, user2 } = await seedUsers();
    await seedNotification(user1._id, false);
    await seedNotification(user1._id, false);
    await seedNotification(user2._id, false);

    const res = await request(app).patch('/api/v1/notifications/read-all').set('Authorization', `Bearer ${token1}`);
    expect(res.status).toBe(200);

    const unread = await Notification.find({ userId: user1._id, isRead: false });
    expect(unread.length).toBe(0);

    const user2Unread = await Notification.find({ userId: user2._id, isRead: false });
    expect(user2Unread.length).toBe(1);
  });
});

describe('DELETE /api/v1/notifications/:id', () => {
  it('user cannot delete another user\'s notification', async () => {
    const { user1, token2 } = await seedUsers();
    const n = await seedNotification(user1._id);
    const res = await request(app).delete(`/api/v1/notifications/${n._id}`).set('Authorization', `Bearer ${token2}`);
    expect(res.status).toBe(404);
  });

  it('user can delete own notification', async () => {
    const { user1, token1 } = await seedUsers();
    const n = await seedNotification(user1._id);
    const res = await request(app).delete(`/api/v1/notifications/${n._id}`).set('Authorization', `Bearer ${token1}`);
    expect(res.status).toBe(200);
    expect(await Notification.findById(n._id)).toBeNull();
  });
});

// ─── Broadcast tests ──────────────────────────────────────────────────────────

async function seedManager() {
  const manager = await User.create({ name: 'Manager', email: 'mgr@test.com', password: 'pass12345', role: 'manager' });
  return { manager, token: makeToken(manager) };
}

async function seedEmployees(count: number) {
  return Promise.all(
    Array.from({ length: count }, (_, i) =>
      User.create({ name: `Employee${i}`, email: `emp${i}@test.com`, password: 'pass12345', role: 'employee' })
    )
  );
}

describe('POST /api/v1/notifications/broadcast', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/broadcast')
      .send({ title: 'Test', body: 'Hello' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for employee', async () => {
    const { token1 } = await seedUsers();
    const res = await request(app)
      .post('/api/v1/notifications/broadcast')
      .set('Authorization', `Bearer ${token1}`)
      .send({ title: 'Test', body: 'Hello' });
    expect(res.status).toBe(403);
  });

  it('manager can broadcast to all active employees', async () => {
    const { token } = await seedManager();
    const employees = await seedEmployees(3);

    const res = await request(app)
      .post('/api/v1/notifications/broadcast')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'עדכון', body: 'הודעה לכל הצוות' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.broadcastId).toBe('string');
    expect(res.body.recipientCount).toBe(employees.length);

    // Verify notifications were created in DB
    const notifications = await Notification.find({ refId: res.body.broadcastId });
    expect(notifications).toHaveLength(employees.length);
    expect(notifications.every(n => n.type === 'announcement')).toBe(true);
    expect(notifications.every(n => n.isRead === false)).toBe(true);

    // Manager is NOT included in recipients
    const { manager } = await seedManager();
    const managerNotif = notifications.find(n => String(n.userId) === String(manager._id));
    expect(managerNotif).toBeUndefined();
  });

  it('manager can broadcast to specific userIds only', async () => {
    const { token } = await seedManager();
    const employees = await seedEmployees(3);

    const targetIds = [String(employees[0]._id), String(employees[1]._id)];

    const res = await request(app)
      .post('/api/v1/notifications/broadcast')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'מבצע', body: 'פנייה מיוחדת', userIds: targetIds });

    expect(res.status).toBe(200);
    expect(res.body.recipientCount).toBe(2);

    const notifications = await Notification.find({ refId: res.body.broadcastId });
    expect(notifications).toHaveLength(2);
    const recipientIds = notifications.map(n => String(n.userId)).sort();
    expect(recipientIds).toEqual(targetIds.sort());
  });

  it('returns 400 when body is missing required fields', async () => {
    const { token } = await seedManager();
    const res = await request(app)
      .post('/api/v1/notifications/broadcast')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'only title' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/notifications/broadcast/:broadcastId/status', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app)
      .get(`/api/v1/notifications/broadcast/${new mongoose.Types.ObjectId()}/status`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for employee', async () => {
    const { token1 } = await seedUsers();
    const res = await request(app)
      .get(`/api/v1/notifications/broadcast/${new mongoose.Types.ObjectId()}/status`)
      .set('Authorization', `Bearer ${token1}`);
    expect(res.status).toBe(403);
  });

  it('returns correct isRead state per recipient', async () => {
    const { token } = await seedManager();
    const employees = await seedEmployees(2);

    // Send broadcast
    const broadcastRes = await request(app)
      .post('/api/v1/notifications/broadcast')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'בדיקה', body: 'קריאה נכונה' });

    const { broadcastId } = broadcastRes.body;

    // Mark employee[0]'s notification as read directly in DB
    await Notification.findOneAndUpdate(
      { refId: broadcastId, userId: employees[0]._id },
      { $set: { isRead: true } }
    );

    // Query status
    const statusRes = await request(app)
      .get(`/api/v1/notifications/broadcast/${broadcastId}/status`)
      .set('Authorization', `Bearer ${token}`);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.success).toBe(true);
    expect(statusRes.body.recipients).toHaveLength(2);

    const read = statusRes.body.recipients.find(
      (r: { userId: string; isRead: boolean }) => r.userId === String(employees[0]._id)
    );
    const unread = statusRes.body.recipients.find(
      (r: { userId: string; isRead: boolean }) => r.userId === String(employees[1]._id)
    );

    expect(read?.isRead).toBe(true);
    expect(unread?.isRead).toBe(false);
  });

  it('returns empty recipients for unknown broadcastId', async () => {
    const { token } = await seedManager();
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/v1/notifications/broadcast/${fakeId}/status`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.recipients).toHaveLength(0);
  });
});
