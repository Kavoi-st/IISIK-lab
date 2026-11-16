'use strict';

/** Resolver-слой не обращается к репозиториям: только проверяет доступ и вызывает mock-клиенты. */
const { GraphQLError } = require('graphql');
const { generateToken } = require('./auth');
const {
  MockIdentityClient, MockCustomerClient, MockCatalogClient, MockRepairClient,
  MockPaymentClient, MockNotificationClient, MockAnalyticsClient,
} = require('../clients');
const identity = new MockIdentityClient();
const customer = new MockCustomerClient();
const catalog = new MockCatalogClient();
const repair = new MockRepairClient();
const payment = new MockPaymentClient();
const notification = new MockNotificationClient();
const analytics = new MockAnalyticsClient();

const user = r => r && ({ id:r.id, login:r.login, status:r.status, role:r.role, createdAt:r.created_at });
const client = r => r && ({ id:r.id, userId:r.user_id, fullName:r.full_name, phone:r.phone, email:r.email, createdAt:r.created_at });
const device = r => r && ({ id:r.id, clientId:r.client_id, categoryId:r.category_id, model:r.model, serialNumber:r.serial_number, note:r.note, createdAt:r.created_at, updatedAt:r.updated_at });
const category = r => r && ({ id:r.id, name:r.name, isActive:!!r.is_active });
const request = r => r && ({ id:r.id, clientId:r.client_id, deviceId:r.device_id, categoryId:r.category_id, categoryName:r.category_name, deviceModel:r.device_model, description:r.description, priority:r.priority, status:r.status, createdAt:r.created_at, updatedAt:r.updated_at });
const workOrder = r => r && ({ id:r.id, requestId:r.request_id, employeeId:r.employee_id, status:r.status, totalAmount:r.total_amount, paymentReceived:!!r.payment_received, createdAt:r.created_at, updatedAt:r.updated_at });
const serviceItem = r => r && ({ id:r.id, workOrderId:r.work_order_id, serviceId:r.service_id, serviceName:r.service_name, quantity:r.quantity, unitPrice:r.unit_price, lineTotal:r.line_total });
const partItem = r => r && ({ id:r.id, workOrderId:r.work_order_id, partId:r.part_id, partSku:r.part_sku, partName:r.part_name, quantity:r.quantity, unitPrice:r.unit_price, lineTotal:r.line_total });
const service = r => r && ({ id:r.id, name:r.name, price:r.price, isActive:!!r.is_active, updatedAt:r.updated_at });
const part = r => r && ({ id:r.id, sku:r.sku, name:r.name, price:r.price, stockQty:r.stock_qty, isActive:!!r.is_active, updatedAt:r.updated_at });
const pay = r => r && ({ id:r.id, workOrderId:r.work_order_id, clientId:r.client_id, amount:r.amount, method:r.method, status:r.status, createdAt:r.created_at });
const notice = r => r && ({ id:r.id, clientId:r.client_id, requestId:r.request_id, eventType:r.event_type, title:r.title, body:r.body, deliveryStatus:r.delivery_status, createdAt:r.created_at, sentAt:r.sent_at });

function auth(ctx) { if (!ctx.principal) throw new GraphQLError('Требуется авторизация', { extensions:{code:'UNAUTHENTICATED'} }); return ctx.principal; }
function roles(ctx, allowed) { const p=auth(ctx); if(!allowed.includes(p.role)) throw new GraphQLError(`Операция доступна ролям: ${allowed.join(', ')}`,{extensions:{code:'FORBIDDEN'}}); return p; }
function clientError(e) { if (e instanceof GraphQLError) throw e; throw new GraphQLError(e.message || 'Ошибка сервиса', { extensions:{ code:e.code || 'INTERNAL_SERVICE_ERROR' } }); }
async function call(fn) { try { return await fn(); } catch(e) { return clientError(e); } }

const resolvers = {
 Query: {
  me: async (_,__,ctx) => user(await call(()=>identity.me(auth(ctx).userId))),
  myDevices: async (_,__,ctx) => (await call(()=>customer.listDevicesByClient(roles(ctx,['CLIENT']).clientId))).map(device),
  device: async (_, {id},ctx) => { const p=auth(ctx); const row=await call(()=>p.role==='CLIENT'?customer.getDeviceForClient(id,p.clientId):customer.getDevice(id,'')); return device(row); },
  myRepairRequests: async (_,__,ctx) => (await call(()=>repair.listRequestsByClient(roles(ctx,['CLIENT']).clientId))).map(request),
  repairRequest: async (_, {id},ctx) => { const p=auth(ctx), r=await call(()=>p.role==='CLIENT'?repair.findRequestForClient(id,p.clientId):repair.findRequest(id)); if(!r) throw new GraphQLError('Заявка не найдена',{extensions:{code:'NOT_FOUND'}}); return request(r); },
  repairQueue: async (_, {filter,sort},ctx) => { roles(ctx,['EMPLOYEE','ADMIN']); return (await call(()=>repair.queue(filter || {},sort || 'CREATED_AT'))).map(request); },
  workOrder: async (_, {id},ctx) => { const p=auth(ctx), o=await call(()=>p.role==='CLIENT'?repair.findWorkOrderForClient(id,p.clientId):repair.findWorkOrder(id)); if(!o) throw new GraphQLError('Заказ-наряд не найден',{extensions:{code:'NOT_FOUND'}}); return workOrder(o); },
  catalogServices: async (_, {filter,sort},ctx) => { roles(ctx,['EMPLOYEE','ADMIN']); return (await call(()=>catalog.listServices(filter||{},sort||'NAME_ASC'))).map(service); },
  catalogParts: async (_, {filter,sort},ctx) => { roles(ctx,['EMPLOYEE','ADMIN']); return (await call(()=>catalog.listParts(filter||{},sort||'NAME_ASC'))).map(part); },
  myNotifications: async (_,__,ctx) => (await call(()=>notification.listNotificationsByClient(roles(ctx,['CLIENT']).clientId))).map(notice),
  analyticsSummary: async (_, {from,to},ctx) => { roles(ctx,['ADMIN']); const s=await call(()=>analytics.summary(from,to)); return { periodFrom:from,periodTo:to,...s,topServices:s.topServices.map(x=>({serviceId:x.service_id,serviceName:x.service_name,itemsCount:x.items_count,amountSum:x.amount_sum})),topCategories:s.topCategories.map(x=>({categoryId:x.category_id,categoryName:x.category_name,requestsCount:x.requests_count})) }; },
 },
 Mutation: {
  registerUser: async (_,a) => { const x=await call(()=>identity.registerUser(a)); const token = await generateToken(x.user); return {token,user:user(x.user)}; },
  login: async (_,a) => { const x=await call(()=>identity.login(a)); const token = await generateToken(x.user); return {token,user:user(x.user)}; },
  assignRole: async (_,a,ctx) => { roles(ctx,['ADMIN']); return user(await call(()=>identity.assignRole({userId:a.userId,roleCode:a.role}))); },
  registerDevice: async (_, {input},ctx) => { const p=roles(ctx,['CLIENT']); return device(await call(()=>customer.registerDevice({...input,clientId:p.clientId}))); },
  updateDevice: async (_, {input},ctx) => { const p=auth(ctx); const updated=await call(()=>p.role==='CLIENT'?customer.updateDeviceForClient(input,p.clientId):customer.updateDevice(input)); return device(updated); },
  createRepairRequest: async (_, {input},ctx) => { const p=roles(ctx,['CLIENT']); const d=await call(()=>customer.getDeviceForClient(input.deviceId,p.clientId)); return request(await call(()=>repair.createRequest({clientId:p.clientId,device:d,description:input.description,priority:input.priority}))); },
  acceptRepairRequest: async (_, {id},ctx) => { const p=roles(ctx,['EMPLOYEE','ADMIN']); return request(await call(()=>repair.transitionRequest({id,status:'ACCEPTED',employeeId:p.employeeId}))); },
  markDeviceReceived: async (_, {id},ctx) => { roles(ctx,['EMPLOYEE','ADMIN']); return request(await call(()=>repair.transitionRequest({id,status:'ACCEPTED'}))); },
  startDiagnosis: async (_, {id},ctx) => { roles(ctx,['EMPLOYEE','ADMIN']); return request(await call(()=>repair.transitionRequest({id,status:'IN_REPAIR'}))); },
  addWorkOrderService: async (_,a,ctx) => { roles(ctx,['EMPLOYEE','ADMIN']); const s=await call(()=>catalog.getService(a.serviceId)); return serviceItem(await call(()=>repair.addService({workOrderId:a.workOrderId,service:s,quantity:a.quantity}))); },
  addWorkOrderPart: async (_,a,ctx) => { roles(ctx,['EMPLOYEE','ADMIN']); await call(()=>repair.validateWorkOrderForChanges(a.workOrderId)); await call(()=>catalog.getPart(a.partId)); const reserved=await call(()=>catalog.reservePart(a.partId,a.quantity)); return partItem(await call(()=>repair.addPart({workOrderId:a.workOrderId,part:reserved,quantity:a.quantity}))); },
  calculateWorkOrderTotal: async (_, {workOrderId},ctx) => { roles(ctx,['EMPLOYEE','ADMIN']); return workOrder(await call(()=>repair.calculateTotal(workOrderId))); },
  approveRepairEstimate: async (_, {id},ctx) => { const p=roles(ctx,['CLIENT']); return request(await call(()=>repair.transitionRequestForClient({id,status:'IN_REPAIR'},p.clientId))); },
  rejectRepairEstimate: async (_, {id},ctx) => { const p=roles(ctx,['CLIENT']); return request(await call(()=>repair.transitionRequestForClient({id,status:'CANCELLED'},p.clientId))); },
  completeWorkOrder: async (_, {workOrderId},ctx) => { roles(ctx,['EMPLOYEE','ADMIN']); return workOrder(await call(()=>repair.completeWorkOrder(workOrderId))); },
  markDeviceReady: async (_, {id},ctx) => { roles(ctx,['EMPLOYEE','ADMIN']); return request(await call(()=>repair.transitionRequest({id,status:'READY'}))); },
  closeRepairRequest: async (_, {id},ctx) => { roles(ctx,['EMPLOYEE','ADMIN']); return request(await call(()=>repair.transitionRequest({id,status:'CLOSED'}))); },
  cancelRepairRequest: async (_, {id},ctx) => { const p=auth(ctx); if(!['CLIENT','EMPLOYEE','ADMIN'].includes(p.role)) throw new GraphQLError('Недостаточно прав',{extensions:{code:'FORBIDDEN'}}); const result=p.role==='CLIENT'?repair.transitionRequestForClient({id,status:'CANCELLED'},p.clientId):repair.transitionRequest({id,status:'CANCELLED'}); return request(await call(()=>result)); },
  registerPayment: async (_,a,ctx) => { const p=auth(ctx); if(!['CLIENT','EMPLOYEE','ADMIN'].includes(p.role)) throw new GraphQLError('Недостаточно прав',{extensions:{code:'FORBIDDEN'}}); const due=await call(()=>repair.getAmountDue(a.workOrderId)); if(p.role==='CLIENT'&&due.clientId!==p.clientId) throw new GraphQLError('Заказ-наряд не найден',{extensions:{code:'NOT_FOUND'}}); return pay(await call(()=>payment.registerPayment({ ...a,clientId:due.clientId,totalAmount:due.totalAmount,workOrderStatus:due.workOrderStatus }))); },
  upsertService: async (_, {input},ctx) => { roles(ctx,['ADMIN']); return service(await call(()=>catalog.upsertService(input))); },
  upsertPart: async (_, {input},ctx) => { roles(ctx,['ADMIN']); return part(await call(()=>catalog.upsertPart(input))); },
 },
 RepairRequest: {
  workOrder: async r => workOrder(await call(()=>repair.findWorkOrderByRequest(r.id))),
  notifications: async (r,__,ctx) => { if(ctx.principal?.role==='CLIENT'){ const x=await call(()=>repair.findRequest(r.id)); if(x?.client_id!==ctx.principal.clientId)return []; } return (await call(()=>notification.listNotificationsByRequest(r.id))).map(notice); },
 },
 WorkOrder: {
  serviceItems: async o => (await call(()=>repair.serviceItems(o.id))).map(serviceItem),
  partItems: async o => (await call(()=>repair.partItems(o.id))).map(partItem),
  payments: async o => (await call(()=>payment.listPaymentsByWorkOrder(o.id))).map(pay),
 },
 Device: {
  category: async d => category(await call(()=>customer.findCategory(d.categoryId))),
  client: async d => client(await call(()=>customer.findClient(d.clientId))),
 },
};
module.exports = { resolvers };

