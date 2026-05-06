import 'dotenv/config';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import User from '../models/User';

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

const validUser = { name: 'Test User', email: 'test@example.com', password: 'password123' };
const managerUser = { name: 'Manager', email: 'manager@example.com', password: 'managerpass1' };

/** Creates a manager in the DB and returns a signed JWT for them. */
async function seedManagerToken(): Promise<string> {
  const manager = await User.create({ ...managerUser, role: 'manager' });
  return jwt.sign(
    { _id: String(manager._id), email: manager.email, role: manager.role },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );
}

// ── Register ────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/register', () => {
  it('401 — no token (self-registration blocked)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send(validUser);
    expect(res.status).toBe(401);
  });

  it('403 — employee token rejected', async () => {
    const employee = await User.create({ ...validUser, role: 'employee' });
    const token = jwt.sign(
      { _id: String(employee._id), email: employee.email, role: employee.role },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New', email: 'new@example.com', password: 'password123' });
    expect(res.status).toBe(403);
  });

  it('201 — manager creates user, no token in response', async () => {
    const managerToken = await seedManagerToken();
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${managerToken}`)
      .send(validUser);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeUndefined();
    expect(res.body.user.email).toBe(validUser.email);
    expect(res.body.user.password).toBeUndefined();
  });

  it('409 — duplicate email', async () => {
    const managerToken = await seedManagerToken();
    await request(app)
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${managerToken}`)
      .send(validUser);
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${managerToken}`)
      .send(validUser);
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('400 — password too short', async () => {
    const managerToken = await seedManagerToken();
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ ...validUser, password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('400 — invalid email', async () => {
    const managerToken = await seedManagerToken();
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ ...validUser, email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('201 — sets isFixedMorningEmployee when provided', async () => {
    const managerToken = await seedManagerToken();
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ ...validUser, isFixedMorningEmployee: true });
    expect(res.status).toBe(201);
    expect(res.body.user.isFixedMorningEmployee).toBe(true);
  });
});

// ── Login ────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await User.create({ ...validUser, role: 'employee' });
  });

  it('200 — returns token on valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, password: validUser.password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.password).toBeUndefined();
  });

  it('401 — wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('401 — unknown email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });
    expect(res.status).toBe(401);
  });

  it('403 — deactivated user cannot log in', async () => {
    await User.findOneAndUpdate({ email: validUser.email }, { isActive: false });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, password: validUser.password });
    expect(res.status).toBe(403);
  });
});

// ── /me ──────────────────────────────────────────────────────────────────────

describe('GET /api/v1/auth/me', () => {
  let token: string;

  beforeEach(async () => {
    await User.create({ ...validUser, role: 'employee' });
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, password: validUser.password });
    token = loginRes.body.token;
  });

  it('200 — returns user info with valid token', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(validUser.email);
  });

  it('401 — no token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('401 — malformed token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not.a.valid.token');
    expect(res.status).toBe(401);
  });
});
