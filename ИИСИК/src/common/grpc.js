'use strict';
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Указываем абсолютный путь к корню проекта, а от него к папке proto
const ROOT_DIR = path.join(__dirname, '../../'); 
const PROTO_DIR = path.join(ROOT_DIR, 'proto');

function loadProto(protoFile) {
  const fullPath = path.join(PROTO_DIR, protoFile);
  const packageDefinition = protoLoader.loadSync(fullPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });
  return grpc.loadPackageDefinition(packageDefinition);
}

module.exports = { grpc, loadProto };
