'use strict';

const { verifyToken } = require('./auth');

async function buildContext({ authorization }) {
  const token = (authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return { principal: null };
  const principal = await verifyToken(token);
  return { principal, token };
}

module.exports = { buildContext };
