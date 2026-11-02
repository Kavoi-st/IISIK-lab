'use strict';

/**
 * Mock-клиенты — временные адаптеры контрактов внутренних сервисов.
 * Они не обращаются к SQLite и не импортируют репозитории. В следующих ЛР
 * реализации этих клиентов можно заменить gRPC-клиентами без изменения Gateway.
 */
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
    const message = e?.message || 'Ошибка внутреннего сервиса';
    const code = /не найден|не существует/i.test(message) ? 'NOT_FOUND'
      : /нельзя|недостат|превыш|недоступ|принадлежит|недопуст|обязательн|должен|положительн|пустой|доступна только/i.test(message) ? 'FAILED_PRECONDITION'
      : 'INVALID_ARGUMENT';
    throw new RpcError(code, message);
  }
};

class MockIdentityClient {
  async validateToken(token) {
    return invoke(async () => {
      const demo = config.auth.demoTokens[token];
      const userId = demo?.userId || (token.startsWith('demo-u-') ? token.slice(5) : null);
      if (!userId) throw new RpcError('UNAUTHENTICATED', 'Токен недействителен');
      const user = identityApi.findUserById(userId);
      if (!user || user.status !== 'ACTIVE') throw new RpcError('UNAUTHENTICATED', 'Пользователь неактивен');
      const client = customerApi.findClientByUserId(userId);
      const employee = identityApi.findEmployeeByUserId(userId);
      return { userId, role: user.role, clientId: demo?.clientId || client?.id || null,
        employeeId: demo?.employeeId || employee?.id || null, active: true };
    });
  }
  async registerUser(input) {
    return invoke(async () => {
      const created = identityApi.registerUser(input);
      await new MockCustomerClient().createClient(created.client);
      return { user: identityApi.findUserById(created.id), token: `demo-${created.id}` };
    });
  }
  async login(input) { return invoke(() => identityApi.login(input)); }
  async assignRole(input) { return invoke(() => identityApi.assignRole(input)); }
  async me(userId) { return invoke(() => identityApi.findUserById(userId)); }
}

class MockCustomerClient {
  async getDeviceForClient(deviceId, clientId) {
    return invoke(() => {
      const owned = customerApi.getDeviceForClient(deviceId, clientId);
      if (!owned) throw new RpcError('NOT_FOUND', 'Устройство не найдено');
      const category = customerApi.findCategoryById(owned.category_id);
      return { ...owned, deviceId: owned.id, clientId: owned.client_id, categoryId: owned.category_id, categoryName: category?.name || null, deviceModel: owned.model, ownedByClient: true };
    });
  }
  async getDevice(deviceId, clientId) {
    return invoke(() => {
      const row = customerApi.findDeviceById(deviceId);
      if (!row) throw new RpcError('NOT_FOUND', `Устройство ${deviceId} не найдено`);
      const category = customerApi.findCategoryById(row.category_id);
      return { ...row, deviceId: row.id, clientId: row.client_id, categoryId: row.category_id,
        categoryName: category?.name || null, deviceModel: row.model, ownedByClient: row.client_id === clientId };
    });
  }
  async createClient(client) { return invoke(() => customerApi.createClient(client)); }
  async getClientContacts(clientId) { return invoke(() => customerApi.findClientById(clientId)); }
  async listDevicesByClient(id) { return invoke(() => customerApi.listDevicesByClient(id)); }
  async findDevice(id) { return invoke(() => customerApi.findDeviceById(id)); }
  async findCategory(id) { return invoke(() => customerApi.findCategoryById(id)); }
  async findClient(id) { return invoke(() => customerApi.findClientById(id)); }
  async registerDevice(input) { return invoke(() => customerApi.registerDevice(input)); }
  async updateDevice(input) { return invoke(() => customerApi.updateDevice(input)); }
  async updateDeviceForClient(input, clientId) { return invoke(() => customerApi.updateDeviceForClient(input, clientId)); }
}

class MockCatalogClient {
  async getService(id) { return invoke(() => { const x = catalogApi.findServiceById(id); if (!x) throw new RpcError('NOT_FOUND', 'Услуга не найдена'); return x; }); }
  async getPart(id) { return invoke(() => { const x = catalogApi.findPartById(id); if (!x) throw new RpcError('NOT_FOUND', 'Запчасть не найдена'); return x; }); }
  async reservePart(id, quantity) { return invoke(() => catalogApi.reservePart(id, quantity)); }
  async listServices(filter = {}, sort = 'NAME_ASC') { return invoke(() => catalogApi.listServices(filter, sort)); }
  async listParts(filter = {}, sort = 'NAME_ASC') { return invoke(() => catalogApi.listParts(filter, sort)); }
  async upsertService(input) { return invoke(() => catalogApi.upsertService(input)); }
  async upsertPart(input) { return invoke(() => catalogApi.upsertPart(input)); }
}

class MockRepairClient {
  async getAmountDue(id) { return invoke(() => { const o = repairApi.findWorkOrder(id); if (!o) throw new RpcError('NOT_FOUND', 'Заказ-наряд не найден'); const r = repairApi.findRequest(o.request_id); return { workOrderId: o.id, requestId: o.request_id, clientId: r?.client_id, totalAmount: o.total_amount, workOrderStatus: o.status }; }); }
  async listRequestsByClient(id) { return invoke(() => repairApi.listRequestsByClient(id)); }
  async findRequest(id) { return invoke(() => repairApi.findRequest(id)); }
  async findRequestForClient(id, clientId) { return invoke(() => repairApi.findRequestForClient(id, clientId)); }
  async findWorkOrderForClient(id, clientId) { return invoke(() => repairApi.findWorkOrderForClient(id, clientId)); }
  async findWorkOrder(id) { return invoke(() => repairApi.findWorkOrder(id)); }
  async findWorkOrderByRequest(id) { return invoke(() => repairApi.findWorkOrderByRequest(id)); }
  async queue(filter, sort) { return invoke(() => repairApi.queue(filter, sort)); }
  async serviceItems(id) { return invoke(() => repairApi.serviceItems(id)); }
  async partItems(id) { return invoke(() => repairApi.partItems(id)); }
  async createRequest(input) { return invoke(() => repairApi.createRequest(input)); }
  async transitionRequest(input) { return invoke(() => repairApi.transitionRequest(input)); }
  async transitionRequestForClient(input, clientId) { return invoke(() => repairApi.transitionRequestForClient(input, clientId)); }
  async validateWorkOrderForChanges(id) { return invoke(() => repairApi.validateWorkOrderForChanges(id)); }
  async addService(input) { return invoke(() => repairApi.addService(input)); }
  async addPart(input) { return invoke(() => repairApi.addPart(input)); }
  async calculateTotal(id) { return invoke(() => repairApi.calculateTotal(id)); }
  async completeWorkOrder(id) { return invoke(() => repairApi.completeWorkOrder(id)); }
  async markPaymentReceived(id) { return invoke(() => repairApi.markPaymentReceived(id)); }
}

class MockPaymentClient {
  async listPaymentsByWorkOrder(id) { return invoke(() => paymentApi.listPaymentsByWorkOrder(id)); }
  async registerPayment(input) {
    return invoke(async () => {
      const payment = paymentApi.registerPayment(input);
      const paid = paymentApi.sumPaid(input.workOrderId);
      if (paid >= Number(input.totalAmount)) await new MockRepairClient().markPaymentReceived(input.workOrderId);
      return payment;
    });
  }
}
class MockNotificationClient {
  async listNotificationsByClient(id) { return invoke(() => notificationApi.listNotificationsByClient(id)); }
  async listNotificationsByRequest(id) { return invoke(() => notificationApi.listNotificationsByRequest(id)); }
  async create(input) { return invoke(() => notificationApi.create(input)); }
}
class MockAnalyticsClient { async summary(from, to) { return invoke(() => analyticsApi.summary(from, to)); } }

module.exports = { RpcError, MockIdentityClient, MockCustomerClient, MockCatalogClient, MockRepairClient, MockPaymentClient, MockNotificationClient, MockAnalyticsClient };
