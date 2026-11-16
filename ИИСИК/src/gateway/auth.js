'use strict';

const jwt = require('jsonwebtoken');
const { createClient } = require('redis');

const SECRET_KEY = 'secret-key-for-lab5';
const redisClient = createClient({ url: 'redis://localhost:6379' });
redisClient.connect().catch(console.error);

async function generateToken(user) {
  const token = jwt.sign({ userId: user.id, role: user.role }, SECRET_KEY, { expiresIn: '1h' });
  // Используем обычные кавычки и конкатенацию для надежности
  await redisClient.set('session:' + user.id, token, { EX: 3600 });
  return token;
}

async function verifyToken(token) {
  try {
    const payload = jwt.verify(token, SECRET_KEY);
    const session = await redisClient.get('session:' + payload.userId);
    if (session !== token) throw new Error('Invalid session');
    return payload;
  } catch (e) {
    return null;
  }
}

module.exports = { generateToken, verifyToken };
