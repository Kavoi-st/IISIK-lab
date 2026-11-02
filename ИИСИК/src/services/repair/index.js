'use strict';

/**
 * Repair Service — модели данных и чтени
 */
const { openServiceDb } = require('../../common/db');

const db = openServiceDb('repair');

db.exec(`
CREATE TABLE IF NOT EXISTS repair_requests (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  category_name TEXT NOT NULL,
  device_model TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS work_orders (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE REFERENCES repair_requests(id),
  employee_id TEXT,
  status TEXT NOT NULL,
  total_amount REAL NOT NULL DEFAULT 0,
  payment_received INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS work_order_service_items (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id),
  service_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  line_total REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS work_order_part_items (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id),
  part_id TEXT NOT NULL,
  part_sku TEXT NOT NULL,
  part_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  line_total REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_requests_client ON repair_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON repair_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_created ON repair_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_wo_request ON work_orders(request_id);
`);

const toBool = (row) => row && ({ ...row, payment_received: !!row.payment_received });

const queries = {
  listRequestsByClient: db.prepare('SELECT * FROM repair_requests WHERE client_id = ? ORDER BY created_at DESC'),
  findRequestById: db.prepare('SELECT * FROM repair_requests WHERE id = ?'),
  findWorkOrderById: db.prepare('SELECT * FROM work_orders WHERE id = ?'),
  findWorkOrderByRequestId: db.prepare('SELECT * FROM work_orders WHERE request_id = ?'),
  listServiceItems: db.prepare('SELECT * FROM work_order_service_items WHERE work_order_id = ?'),
  listPartItems: db.prepare('SELECT * FROM work_order_part_items WHERE work_order_id = ?'),
};

/** Очередь заявок с фильтром и сортировкой (ЛР2, п. 7.10). */
function queue(filter = {}, sort = 'CREATED_AT') {
  if (filter.status && !['CREATED','ACCEPTED','IN_REPAIR','READY','CLOSED','CANCELLED'].includes(filter.status)) throw new Error('Недопустимый статус для фильтрации');
  if (filter.priority && !['LOW','NORMAL','HIGH'].includes(filter.priority)) throw new Error('Недопустимый приоритет для фильтрации');
  for (const key of ['from','to']) if (filter[key] && Number.isNaN(Date.parse(filter[key]))) throw new Error(`Некорректная дата фильтра ${key}`);
  if (filter.from && filter.to && filter.from > filter.to) throw new Error('Начало периода позже окончания');
  const where = [];
  const params = {};
  if (filter.status) { where.push('r.status = @status'); params.status = filter.status; }
  if (filter.categoryId) { where.push('r.category_id = @categoryId'); params.categoryId = filter.categoryId; }
  if (filter.priority) { where.push('r.priority = @priority'); params.priority = filter.priority; }
  if (filter.from) { where.push('r.created_at >= @from'); params.from = filter.from; }
  if (filter.to) { where.push('r.created_at <= @to'); params.to = filter.to; }
  const orderBy = {
    CREATED_AT: 'r.created_at DESC',
    PRIORITY: "CASE r.priority WHEN 'HIGH' THEN 0 WHEN 'NORMAL' THEN 1 ELSE 2 END, r.created_at DESC",
    TOTAL_AMOUNT: 'COALESCE(w.total_amount, 0) DESC',
  }[sort] || 'r.created_at DESC';
  const sql = `
    SELECT r.*, COALESCE(w.total_amount, 0) AS queue_total
    FROM repair_requests r
    LEFT JOIN work_orders w ON w.request_id = r.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${orderBy}`;
  return db.prepare(sql).all(params);
}

const repairOperations = {
  validateWorkOrderForChanges(workOrderId) { const order=queries.findWorkOrderById.get(workOrderId); if(!order || ['COMPLETED','CANCELLED'].includes(order.status)) throw new Error('Заказ-наряд недоступен для изменения'); return true; },
  createRequest({ clientId, device, description, priority = 'NORMAL' }) {
    if (!clientId || !device || !description || !String(description).trim()) throw new Error('Устройство и описание неисправности обязательны');
    if (!['LOW','NORMAL','HIGH'].includes(priority)) throw new Error('Недопустимый приоритет');
    const id = `rq-${require('crypto').randomUUID()}`, now = new Date().toISOString();
    db.prepare(`INSERT INTO repair_requests(id,client_id,device_id,category_id,category_name,device_model,description,priority,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id, clientId, device.id || device.deviceId, device.category_id || device.categoryId, device.category_name || device.categoryName || '', device.model || device.deviceModel, description.trim(), priority, 'CREATED', now, now);
    return queries.findRequestById.get(id);
  },
  transitionRequest({ id, status, employeeId }) {
    const request = queries.findRequestById.get(id);
    if (!request) throw new Error('Заявка не найдена');
    const allowed = { CREATED:['ACCEPTED','CANCELLED'], ACCEPTED:['IN_REPAIR','CANCELLED'], IN_REPAIR:['READY','CANCELLED'], READY:['CLOSED'], CLOSED:[], CANCELLED:[] };
    if (!(allowed[request.status] || []).includes(status)) throw new Error(`Нельзя изменить статус ${request.status} на ${status}`);
    const now = new Date().toISOString();
    db.prepare('UPDATE repair_requests SET status=?,updated_at=? WHERE id=?').run(status, now, id);
    let order = queries.findWorkOrderByRequestId.get(id);
    if (status === 'ACCEPTED' && !order) {
      const woId = `wo-${require('crypto').randomUUID()}`;
      db.prepare('INSERT INTO work_orders(id,request_id,employee_id,status,total_amount,payment_received,created_at,updated_at) VALUES(?,?,?,?,0,0,?,?)')
        .run(woId, id, employeeId || null, 'CREATED', now, now);
      order = queries.findWorkOrderById.get(woId);
    }
    if (status === 'IN_REPAIR' && order) db.prepare('UPDATE work_orders SET status=?,updated_at=? WHERE id=?').run('IN_PROGRESS', now, order.id);
    if (status === 'READY' && order) db.prepare('UPDATE work_orders SET status=?,updated_at=? WHERE id=?').run('COMPLETED', now, order.id);
    return queries.findRequestById.get(id);
  },
  calculateTotal(workOrderId) {
    const order = queries.findWorkOrderById.get(workOrderId);
    if (!order) throw new Error('Заказ-наряд не найден');
    const services = db.prepare('SELECT COALESCE(SUM(line_total),0) AS total FROM work_order_service_items WHERE work_order_id=?').get(workOrderId).total;
    const parts = db.prepare('SELECT COALESCE(SUM(line_total),0) AS total FROM work_order_part_items WHERE work_order_id=?').get(workOrderId).total;
    db.prepare('UPDATE work_orders SET total_amount=?,updated_at=? WHERE id=?').run(services+parts,new Date().toISOString(),workOrderId);
    return toBool(queries.findWorkOrderById.get(workOrderId));
  },
  markPaymentReceived(workOrderId) {
    const order = queries.findWorkOrderById.get(workOrderId);
    if (!order) throw new Error('Заказ-наряд не найден');
    db.prepare('UPDATE work_orders SET payment_received=1,updated_at=? WHERE id=?').run(new Date().toISOString(), workOrderId);
    return queries.findWorkOrderById.get(workOrderId);
  },
  completeWorkOrder(workOrderId) {
    const order = queries.findWorkOrderById.get(workOrderId);
    if (!order) throw new Error('Заказ-наряд не найден');
    if (order.status === 'COMPLETED') return toBool(order);
    if (order.status === 'CANCELLED') throw new Error('Отменённый заказ-наряд нельзя завершить');
    if (order.status !== 'IN_PROGRESS') throw new Error('Завершить можно только заказ-наряд в работе');
    const now = new Date().toISOString();
    db.prepare('UPDATE work_orders SET status=?,updated_at=? WHERE id=?').run('COMPLETED', now, workOrderId);
    return toBool(queries.findWorkOrderById.get(workOrderId));
  },
  addService({ workOrderId, service, quantity = 1 }) {
    if (!Number.isInteger(Number(quantity)) || Number(quantity) < 1 || !service || !service.is_active) throw new Error('Некорректная услуга или количество');
    const order = queries.findWorkOrderById.get(workOrderId); if (!order || ['COMPLETED','CANCELLED'].includes(order.status)) throw new Error('Заказ-наряд недоступен для изменения');
    const id = `wos-${require('crypto').randomUUID()}`, q = Number(quantity), total = service.price*q;
    db.prepare('INSERT INTO work_order_service_items(id,work_order_id,service_id,service_name,quantity,unit_price,line_total) VALUES(?,?,?,?,?,?,?)').run(id,workOrderId,service.id,service.name,q,service.price,total);
    db.prepare('UPDATE work_orders SET total_amount=total_amount+?,updated_at=? WHERE id=?').run(total,new Date().toISOString(),workOrderId);
    return db.prepare('SELECT * FROM work_order_service_items WHERE id=?').get(id);
  },
  addPart({ workOrderId, part, quantity = 1 }) {
    if (!Number.isInteger(Number(quantity)) || Number(quantity) < 1 || !part) throw new Error('Некорректная запчасть или количество');
    const order = queries.findWorkOrderById.get(workOrderId); if (!order || ['COMPLETED','CANCELLED'].includes(order.status)) throw new Error('Заказ-наряд недоступен для изменения');
    const id = `wop-${require('crypto').randomUUID()}`, q = Number(quantity), total = part.price*q;
    db.prepare('INSERT INTO work_order_part_items(id,work_order_id,part_id,part_sku,part_name,quantity,unit_price,line_total) VALUES(?,?,?,?,?,?,?,?)').run(id,workOrderId,part.id,part.sku,part.name,q,part.price,total);
    db.prepare('UPDATE work_orders SET total_amount=total_amount+?,updated_at=? WHERE id=?').run(total,new Date().toISOString(),workOrderId);
    return db.prepare('SELECT * FROM work_order_part_items WHERE id=?').get(id);
  },
  findRequest: (id) => queries.findRequestById.get(id),
  findWorkOrder: (id) => toBool(queries.findWorkOrderById.get(id)),
};

const repairRepo = {
  listRequestsByClient: (clientId) => queries.listRequestsByClient.all(clientId),
  findRequestById: (id) => queries.findRequestById.get(id),
  findWorkOrderById: (id) => toBool(queries.findWorkOrderById.get(id)),
  findWorkOrderByRequestId: (requestId) => toBool(queries.findWorkOrderByRequestId.get(requestId)),
  listServiceItems: (workOrderId) => queries.listServiceItems.all(workOrderId),
  listPartItems: (workOrderId) => queries.listPartItems.all(workOrderId),
  queue,
};

module.exports = { db, repairRepo, repairOperations };
