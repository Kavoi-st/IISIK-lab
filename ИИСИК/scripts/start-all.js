'use strict';
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const config = require('../config/app.config');
const services = [
  ['identity', 4101], ['customer', 4102], ['catalog', 4103], ['repair', 4104],
  ['payment', 4105], ['notification', 4106], ['analytics', 4107],
];
const endpoints = [...services.map(([name, port]) => ({ name, port: Number(process.env[`${name.toUpperCase()}_PORT`] || port) })), { name: 'graphql-gateway', port: config.gateway.port }];
const children = [];
let stopping = false;

function canBind(port, host) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(port, host, () => probe.close(() => resolve(true)));
  });
}
async function preflight() {
  const busy = [];
  for (const item of endpoints) {
    try { await canBind(item.port, item.name === 'graphql-gateway' ? config.gateway.host : '127.0.0.1'); }
    catch { busy.push(item); }
  }
  if (busy.length) {
    const lines = busy.map(x => `- ${x.name}: порт ${x.port}`).join('\n');
    throw new Error(`Нельзя запустить систему: заняты порты:\n${lines}\nЗакройте предыдущие процессы Node.js или освободите указанные порты и повторите запуск.`);
  }
}
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 300).unref();
}
async function main() {
  await preflight();
  for (const [name] of services) {
    const child = spawn(process.execPath, [path.join(__dirname, `../src/services/${name}/server.js`)], { stdio: 'inherit', env: process.env });
    children.push(child);
    child.once('error', err => { console.error(`Не удалось запустить ${name}: ${err.message}`); stop(1); });
    child.once('exit', code => { if (!stopping && code !== 0) { console.error(`Сервис ${name} завершился с кодом ${code}`); stop(1); } });
  }
  const gateway = spawn(process.execPath, [path.join(__dirname, '../src/gateway/server.js')], { stdio: 'inherit', env: process.env });
  children.push(gateway);
  gateway.once('error', err => { console.error(`Не удалось запустить GraphQL Gateway: ${err.message}`); stop(1); });
  gateway.once('exit', code => { if (!stopping && code !== 0) { console.error(`GraphQL Gateway завершился с кодом ${code}`); stop(1); } });
  console.log('Все компоненты запускаются. Для остановки нажмите Ctrl+C.');
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
main().catch(err => { console.error(err.message); process.exitCode = 1; });
