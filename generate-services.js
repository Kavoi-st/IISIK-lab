const fs = require('fs');
const services = ['customer', 'catalog', 'repair', 'payment', 'notification', 'analytics'];
services.forEach(s => {
  const dir = \src/services/\\;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const serverContent = \const grpc = require('@grpc/grpc-js');
const { loadProto } = require('../../common/grpc');
const proto = loadProto('\.proto');
const server = new grpc.Server();
// TODO: Подключите здесь ваш репозиторий (например, const { repo } = require('./index');)
server.addService(proto.\.\Service.service, {
  // Реализуйте методы согласно .proto
});
server.bindAsync('0.0.0.0:5005' + (services.indexOf(s)+2), grpc.ServerCredentials.createInsecure(), () => server.start());
console.log('\ service running');\;
  fs.writeFileSync(\\/server.js\, serverContent);
});
