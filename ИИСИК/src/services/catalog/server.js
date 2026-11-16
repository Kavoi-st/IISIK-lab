'use strict';
const grpc = require('@grpc/grpc-js');
const { loadProto } = require('../../common/grpc');
const api = require('./api');
let kafkaProducer = null;

if ('catalog' === 'repair') {
  try {
    const { producer } = require('../../common/kafka');
    kafkaProducer = producer;
    kafkaProducer.connect().catch(() => {});
  } catch (e) {}
}

if ('catalog' === 'notification') {
  try {
    const { consumer } = require('../../common/kafka');
    const kafkaConsumer = consumer('notification-group');
    kafkaConsumer.connect().then(async () => {
      await kafkaConsumer.subscribe({ topic: 'repair-events', fromBeginning: false });
      await kafkaConsumer.run({
        eachMessage: async ({ message }) => {
          try {
            const data = JSON.parse(message.value.toString());
            if (data.clientId) {
              api.create({
                clientId: data.clientId,
                requestId: data.requestId || null,
                eventType: data.eventType || 'REPAIR_EVENT',
                title: data.title || '������ ������ ��������',
                body: data.body || ('������ ' + (data.requestId || '') + ' �������� ������')
              });
            }
          } catch (err) {}
        }
      });
    }).catch(() => {});
  } catch (e) {}
}

const protoDefinition = loadProto('catalog.proto');
const serviceDef = protoDefinition['catalog']['CatalogService'].service;

async function handleInvoke(call, callback) {
  try {
    const { method, payloadJson } = call.request || {};
    const args = payloadJson ? JSON.parse(payloadJson) : [];
    const fn = api[method];
    if (typeof fn !== 'function') {
      return callback(null, { resultJson: null, errorJson: JSON.stringify({ message: '����� ' + method + ' �� ������' }) });
    }
    const argArray = Array.isArray(args) ? args : [args];
    const res = await Promise.resolve(fn(...argArray));
    
    if ('catalog' === 'repair' && ['createRequest', 'transitionRequest', 'transitionRequestForClient'].includes(method) && res && kafkaProducer) {
      kafkaProducer.send({
        topic: 'repair-events',
        messages: [{ value: JSON.stringify({ eventType: res.status || 'UPDATED', clientId: res.client_id, requestId: res.id, title: '������ ' + res.id, body: '����� ������: ' + res.status }) }]
      }).catch(() => {});
    }
    
    return callback(null, { resultJson: JSON.stringify(res || null), errorJson: null });
  } catch (err) {
    return callback(null, { resultJson: null, errorJson: JSON.stringify({ message: err.message, code: err.code || 'INTERNAL_ERROR' }) });
  }
}

const handlers = {
  Invoke: handleInvoke
};

// Map known specific proto RPCs if present
const specificHandlers = {
  Login: async (call, callback) => {
    try {
      const res = await Promise.resolve(api.login(call.request));
      return callback(null, { token: res.token, user: { id: res.user.id, login: res.user.login, role: res.user.role, status: res.user.status, createdAt: res.user.created_at || '' } });
    } catch(err) { return callback(err); }
  },
  RegisterUser: async (call, callback) => {
    try {
      const res = await Promise.resolve(api.registerUser(call.request));
      return callback(null, { token: res.token || '', user: { id: res.user.id, login: res.user.login, role: res.user.role, status: res.user.status, createdAt: res.user.created_at || '' } });
    } catch(err) { return callback(err); }
  },
  ValidateToken: async (call, callback) => {
    try {
      const user = await Promise.resolve(api.findUserById(call.request.token));
      return callback(null, { id: user.id, login: user.login, role: user.role, status: user.status, createdAt: user.created_at || '' });
    } catch(err) { return callback(err); }
  }
};

for (const key of Object.keys(serviceDef)) {
  if (specificHandlers[key]) {
    handlers[key] = specificHandlers[key];
  } else if (key !== 'Invoke') {
    handlers[key] = (call, callback) => callback(null, {});
  }
}

const server = new grpc.Server();
server.addService(serviceDef, handlers);

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env['CATALOG_PORT'] || 4103);

server.bindAsync(`${host}:${port}`, grpc.ServerCredentials.createInsecure(), (err, boundPort) => {
  if (err) {
    console.error('������ ������� gRPC ������� catalog:', err);
    process.exit(1);
  }
  console.log(`catalog gRPC service running on ${host}:${boundPort}`);
});
