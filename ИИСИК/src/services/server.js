'use strict';
const http = require('http');
const serviceName = process.argv[2];
const ports = { identity:4101, customer:4102, catalog:4103, repair:4104, payment:4105, notification:4106, analytics:4107 };
if (!ports[serviceName]) throw new Error('Укажите имя сервиса: identity, customer, catalog, repair, payment, notification, analytics');
// Отдельный процесс и отдельная БД выбранного сервиса. Бизнес-вызовы в ЛР4
// маршрутизируются mock-клиентами к API-фасаду, без реального gRPC/HTTP RPC.
const api = require(`./${serviceName}/api`);
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env[`${serviceName.toUpperCase()}_PORT`] || ports[serviceName]);
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    res.writeHead(200); res.end(JSON.stringify({ status: 'ok', service: serviceName, mode: 'mock-adapter' })); return;
  }
  if (req.method === 'GET' && req.url === '/contract') {
    res.writeHead(200); res.end(JSON.stringify({ service: serviceName, operations: Object.keys(api) })); return;
  }
  res.writeHead(404); res.end(JSON.stringify({ error: 'В ЛР4 бизнес-вызовы выполняются через mock-контракты, не через HTTP RPC' }));
});
server.listen(port, host, () => console.log(`${serviceName} service: http://${host}:${port}/health`));
