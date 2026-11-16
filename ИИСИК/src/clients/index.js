'use strict';

const grpc = require('@grpc/grpc-js');
const { loadProto } = require('../common/grpc');
const identityApi = require('../services/identity/api');
const customerApi = require('../services/customer/api');
const catalogApi = require('../services/catalog/api');
const repairApi = require('../services/repair/api');
const paymentApi = require('../services/payment/api');
const notificationApi = require('../services/notification/api');
const analyticsApi = require('../services/analytics/api');
const config = require('../../config/app.config');

class RpcError extends Error {
  constructor(code, message) { super(message); this.name = 'RpcError'; this.code = code; }
}

const invoke = async (fn) => {
  try { return await fn(); }
  catch (e) {
    if (e instanceof RpcError) throw e;
    const message = e?.message || '������ ����������� �������';
    const code = /�� ������|�� ����������/i.test(message) ? 'NOT_FOUND'
      : /������|��������|������|��������|�����������|��������|����������|������|�����������|������|�������� ������/i.test(message) ? 'FAILED_PRECONDITION'
      : 'INVALID_ARGUMENT';
    throw new RpcError(code, message);
  }
};

const serviceConfigs = {
  identity: { port: 4101, pkg: 'identity', serviceName: 'IdentityService', api: identityApi },
  customer: { port: 4102, pkg: 'customer', serviceName: 'CustomerService', api: customerApi },
  catalog: { port: 4103, pkg: 'catalog', serviceName: 'CatalogService', api: catalogApi },
  repair: { port: 4104, pkg: 'repair', serviceName: 'RepairService', api: repairApi },
  payment: { port: 4105, pkg: 'payment', serviceName: 'PaymentService', api: paymentApi },
  notification: { port: 4106, pkg: 'notification', serviceName: 'NotificationService', api: notificationApi },
  analytics: { port: 4107, pkg: 'analytics', serviceName: 'AnalyticsService', api: analyticsApi },
};

function createGrpcCaller(serviceName) {
  const cfg = serviceConfigs[serviceName];
  let client = null;
  try {
    const protoDef = loadProto(serviceName + '.proto');
    const ServiceClass = protoDef[cfg.pkg][cfg.serviceName];
    const host = process.env.HOST || '127.0.0.1';
    const port = Number(process.env[serviceName.toUpperCase() + '_PORT'] || cfg.port);
    client = new ServiceClass(host + ':' + port, grpc.credentials.createInsecure());
  } catch (e) {}

  return async function callService(method, ...args) {
    if (client && typeof client.Invoke === 'function') {
      try {
        const payloadJson = JSON.stringify(args);
        const response = await new Promise((resolve, reject) => {
          client.Invoke({ method, payloadJson }, { deadline: Date.now() + 1500 }, (err, res) => {
            if (err) return reject(err);
            resolve(res);
          });
        });
        if (response && response.errorJson) {
          const errObj = JSON.parse(response.errorJson);
          throw new RpcError(errObj.code || 'INTERNAL_ERROR', errObj.message);
        }
        if (response && response.resultJson !== undefined) {
          return JSON.parse(response.resultJson);
        }
      } catch (err) {
        if (err instanceof RpcError) throw err;
        // Fallback to localApi if gRPC is not responding
      }
    }
    return invoke(async () => {
      const fn = cfg.api[method];
      if (typeof fn !== 'function') throw new Error('����� ' + method + ' �� ������ � ' + serviceName + ' API');
      return fn(...args);
    });
  };
}

const callIdentity = createGrpcCaller('identity');
const callCustomer = createGrpcCaller('customer');
const callCatalog = createGrpcCaller('catalog');
const callRepair = createGrpcCaller('repair');
const callPayment = createGrpcCaller('payment');
const callNotification = createGrpcCaller('notification');
const callAnalytics = createGrpcCaller('analytics');

class MockIdentityClient {
  async validateToken(token) {
    const demo = config.auth.demoTokens[token];
    const userId = demo?.userId || (token.startsWith('demo-u-') ? token.slice(5) : null);
    if (userId) {
      const user = await callIdentity('findUserById', userId);
      if (!user || user.status !== 'ACTIVE') throw new RpcError('UNAUTHENTICATED', '������������ ���������');
      const client = await callCustomer('findClientByUserId', userId);
      const employee = await callIdentity('findEmployeeByUserId', userId);
      return { userId, role: user.role, clientId: demo?.clientId || client?.id || null, employeeId: demo?.employeeId || employee?.id || null, active: true };
    }
    const user = await callIdentity('findUserById', token);
    if (!user || user.status !== 'ACTIVE') throw new RpcError('UNAUTHENTICATED', '����� ��������������');
    const client = await callCustomer('findClientByUserId', user.id);
    const employee = await callIdentity('findEmployeeByUserId', user.id);
    return { userId: user.id, role: user.role, clientId: client?.id || null, employeeId: employee?.id || null, active: true };
  }
  async registerUser(input) {
    const created = await callIdentity('registerUser', input);
    await callCustomer('createClient', created.client);
    const user = await callIdentity('findUserById', created.id);
    return { user, token: created.id };
  }
  async login(input) { return callIdentity('login', input); }
  async assignRole(input) { return callIdentity('assignRole', input); }
  async me(userId) { return callIdentity('findUserById', userId); }
}

class MockCustomerClient {
  async getDeviceForClient(deviceId, clientId) {
    const owned = await callCustomer('getDeviceForClient', deviceId, clientId);
    if (!owned) throw new RpcError('NOT_FOUND', '���������� �� �������');
    const category = await callCustomer('findCategoryById', owned.category_id);
    return { ...owned, deviceId: owned.id, clientId: owned.client_id, categoryId: owned.category_id, categoryName: category?.name || null, deviceModel: owned.model, ownedByClient: true };
  }
  async getDevice(deviceId, clientId) {
    const row = await callCustomer('findDeviceById', deviceId);
    if (!row) throw new RpcError('NOT_FOUND', '���������� ' + deviceId + ' �� �������');
    const category = await callCustomer('findCategoryById', row.category_id);
    return { ...row, deviceId: row.id, clientId: row.client_id, categoryId: row.category_id, categoryName: category?.name || null, deviceModel: row.model, ownedByClient: !!clientId && row.client_id === clientId };
  }
  async listDevicesByClient(clientId) { return callCustomer('listDevicesByClient', clientId); }
  async findCategory(id) { return callCustomer('findCategoryById', id); }
  async findClient(id) { return callCustomer('findClientById', id); }
  async createClient(c) { return callCustomer('createClient', c); }
  async registerDevice(input) { return callCustomer('registerDevice', input); }
  async updateDevice(input) { return callCustomer('updateDevice', input); }
  async updateDeviceForClient(input, clientId) { return callCustomer('updateDeviceForClient', input, clientId); }
}

class MockCatalogClient {
  async getService(id) { const x = await callCatalog('findServiceById', id); if (!x) throw new RpcError('NOT_FOUND', '������ �� �������'); return x; }
  async getPart(id) { const x = await callCatalog('findPartById', id); if (!x) throw new RpcError('NOT_FOUND', '�������� �� �������'); return x; }
  async reservePart(id, quantity) { return callCatalog('reservePart', id, quantity); }
  async listServices(filter = {}, sort = 'NAME_ASC') { return callCatalog('listServices', filter, sort); }
  async listParts(filter = {}, sort = 'NAME_ASC') { return callCatalog('listParts', filter, sort); }
  async upsertService(input) { return callCatalog('upsertService', input); }
  async upsertPart(input) { return callCatalog('upsertPart', input); }
}

class MockRepairClient {
  async getAmountDue(id) {
    const o = await callRepair('findWorkOrder', id);
    if (!o) throw new RpcError('NOT_FOUND', '�����-����� �� ������');
    const r = await callRepair('findRequest', o.request_id);
    return { workOrderId: o.id, requestId: o.request_id, clientId: r?.client_id, totalAmount: o.total_amount, workOrderStatus: o.status };
  }
  async listRequestsByClient(id) { return callRepair('listRequestsByClient', id); }
  async findRequest(id) { return callRepair('findRequest', id); }
  async findRequestForClient(id, clientId) { return callRepair('findRequestForClient', id, clientId); }
  async findWorkOrderForClient(id, clientId) { return callRepair('findWorkOrderForClient', id, clientId); }
  async findWorkOrder(id) { return callRepair('findWorkOrder', id); }
  async findWorkOrderByRequest(id) { return callRepair('findWorkOrderByRequest', id); }
  async queue(filter, sort) { return callRepair('queue', filter, sort); }
  async serviceItems(id) { return callRepair('serviceItems', id); }
  async partItems(id) { return callRepair('partItems', id); }
  async createRequest(input) { return callRepair('createRequest', input); }
  async transitionRequest(input) { return callRepair('transitionRequest', input); }
  async transitionRequestForClient(input, clientId) { return callRepair('transitionRequestForClient', input, clientId); }
  async validateWorkOrderForChanges(id) { return callRepair('validateWorkOrderForChanges', id); }
  async addService(input) { return callRepair('addService', input); }
  async addPart(input) { return callRepair('addPart', input); }
  async calculateTotal(id) { return callRepair('calculateTotal', id); }
  async completeWorkOrder(id) { return callRepair('completeWorkOrder', id); }
  async markPaymentReceived(id) { return callRepair('markPaymentReceived', id); }
}

class MockPaymentClient {
  async listPaymentsByWorkOrder(id) { return callPayment('listPaymentsByWorkOrder', id); }
  async registerPayment(input) {
    const payment = await callPayment('registerPayment', input);
    const paid = await callPayment('sumPaid', input.workOrderId);
    if (paid >= Number(input.totalAmount)) await callRepair('markPaymentReceived', input.workOrderId);
    return payment;
  }
}

class MockNotificationClient {
  async listNotificationsByClient(id) { return callNotification('listNotificationsByClient', id); }
  async listNotificationsByRequest(id) { return callNotification('listNotificationsByRequest', id); }
  async create(input) { return callNotification('create', input); }
}

class MockAnalyticsClient {
  async summary(from, to) { return callAnalytics('summary', from, to); }
}

module.exports = {
  RpcError,
  MockIdentityClient,
  MockCustomerClient,
  MockCatalogClient,
  MockRepairClient,
  MockPaymentClient,
  MockNotificationClient,
  MockAnalyticsClient
};
