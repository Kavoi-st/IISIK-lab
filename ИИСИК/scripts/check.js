'use strict';
const fs = require('fs');
const path = require('path');
const { buildSchema } = require('graphql');
const root = path.join(__dirname, '..');
const schemaPath = path.join(root, 'contracts', 'schema.graphql');
if (!fs.existsSync(schemaPath)) throw new Error(`Не найдена GraphQL-схема: ${schemaPath}`);
const schema = buildSchema(fs.readFileSync(schemaPath, 'utf8'));
const { resolvers } = require('../src/gateway/resolvers');
for (const [type, fields] of Object.entries(resolvers)) {
  const graphType = schema.getType(type);
  if (!graphType || typeof graphType.getFields !== 'function') continue;
  for (const field of Object.keys(fields)) if (!graphType.getFields()[field]) throw new Error(`Resolver ${type}.${field} отсутствует в GraphQL schema`);
}
const requiredMutations = [
  'registerUser','login','assignRole','registerDevice','updateDevice','createRepairRequest',
  'acceptRepairRequest','startDiagnosis','addWorkOrderService','addWorkOrderPart',
  'calculateWorkOrderTotal','approveRepairEstimate','rejectRepairEstimate','completeWorkOrder',
  'markDeviceReady','closeRepairRequest','cancelRepairRequest','registerPayment','upsertService','upsertPart',
];
for (const name of requiredMutations) {
  if (!schema.getType('Mutation').getFields()[name] || !resolvers.Mutation[name]) throw new Error(`Не реализована Mutation ${name}`);
}
const services = ['identity','customer','catalog','repair','payment','notification','analytics'];
for (const name of services) {
  for (const file of ['index.js','api.js','server.js']) {
    if (!fs.existsSync(path.join(root, 'src', 'services', name, file))) throw new Error(`Не найден модуль сервиса: ${name}/${file}`);
  }
}
const gatewayFiles = ['src/gateway/server.js','src/gateway/resolvers.js','src/gateway/context.js','src/clients/index.js'];
for (const file of gatewayFiles) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  if (/better-sqlite3|\.prepare\s*\(/.test(source)) throw new Error(`Gateway/клиенты не должны обращаться к БД напрямую: ${file}`);
}
const clients = fs.readFileSync(path.join(root, 'src/clients/index.js'), 'utf8');
if (/Repo\s*[,}]/.test(clients)) throw new Error('Mock-клиенты не должны импортировать репозитории напрямую');
console.log('Статическая проверка пройдена: GraphQL SDL, resolvers, Mutation, семь сервисных модулей и отсутствие прямого доступа Gateway к БД.');
