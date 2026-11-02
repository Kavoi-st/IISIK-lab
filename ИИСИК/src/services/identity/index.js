'use strict';

/**
 * Identity Service — модели данных и чтение 
 */
const { openServiceDb } = require('../../common/db');

const db = openServiceDb('identity');

db.exec(`
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  role_id TEXT NOT NULL REFERENCES roles(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  position TEXT NOT NULL,
  specialization TEXT
);
`);

const queries = {
  findRoleByCode: db.prepare('SELECT * FROM roles WHERE code = ?'),
  findUserById: db.prepare(`
    SELECT u.id, u.login, u.status, u.created_at, r.code AS role
    FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`),
  findUserByLogin: db.prepare(`
    SELECT u.id, u.login, u.password_hash, u.status, u.created_at, r.code AS role
    FROM users u JOIN roles r ON r.id = u.role_id WHERE u.login = ?`),
  findEmployeeByUserId: db.prepare('SELECT * FROM employees WHERE user_id = ?'),
  findEmployeeById: db.prepare('SELECT * FROM employees WHERE id = ?'),
};

const identityOperations = {
  registerUser({ login, password, fullName, phone, email }) {
    if (!login || String(login).trim().length < 3) throw new Error('Логин должен содержать не менее 3 символов');
    if (!password || String(password).length < 4) throw new Error('Пароль должен содержать не менее 4 символов');
    login = String(login).trim();
    if (queries.findUserByLogin.get(login)) throw new Error('Пользователь с таким логином уже существует');
    const id = `u-${require('crypto').randomUUID()}`;
    const clientId = `c-${require('crypto').randomUUID()}`;
    const now = new Date().toISOString();
    const role = queries.findRoleByCode.get('CLIENT');
    db.prepare('INSERT INTO users(id,login,password_hash,status,role_id,created_at) VALUES(?,?,?,?,?,?)')
      .run(id, login.trim(), `hash:${password}`, 'ACTIVE', role.id, now);
    return { id, login: login.trim(), password_hash: `hash:${password}`, status: 'ACTIVE', role: 'CLIENT', created_at: now, clientId, client: { id: clientId, full_name: fullName || login, phone: phone || '', email: email || '', user_id: id, created_at: now } };
  },
  login({ login, password }) {
    const user = queries.findUserByLogin.get(login);
    if (!user || user.password_hash !== `hash:${password}` || user.status !== 'ACTIVE') throw new Error('Неверный логин или пароль');
    return { user, token: `demo-${user.id}` };
  },
  assignRole({ userId, roleCode }) {
    const role = queries.findRoleByCode.get(roleCode);
    const user = queries.findUserById.get(userId);
    if (!role || !user) throw new Error('Пользователь или роль не найдены');
    db.prepare('UPDATE users SET role_id=? WHERE id=?').run(role.id, userId);
    return queries.findUserById.get(userId);
  },
};

const identityRepo = {
  findRoleByCode: (code) => queries.findRoleByCode.get(code),
  findUserById: (id) => queries.findUserById.get(id),
  findUserByLogin: (login) => queries.findUserByLogin.get(login),
  findEmployeeByUserId: (userId) => queries.findEmployeeByUserId.get(userId),
  findEmployeeById: (id) => queries.findEmployeeById.get(id),
};

module.exports = { db, identityRepo, identityOperations };
