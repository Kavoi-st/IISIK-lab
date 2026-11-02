'use strict';

/**
 * Payment Service — модели данных и чтение 
 */
const { openServiceDb } = require('../../common/db');

const db = openServiceDb('payment');

db.exec(`
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  amount REAL NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_wo ON payments(work_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_client ON payments(client_id);
`);

const queries = {
  listPaymentsByWorkOrder: db.prepare('SELECT * FROM payments WHERE work_order_id = ? ORDER BY created_at'),
  listPaymentsByClient: db.prepare('SELECT * FROM payments WHERE client_id = ? ORDER BY created_at DESC'),
  sumCompletedByWorkOrder: db.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE work_order_id = ? AND status = 'COMPLETED'"),
};

const paymentOperations = {
  registerPayment({ workOrderId, clientId, amount, method, totalAmount, workOrderStatus }) {
    if (!workOrderId || !clientId || !Number.isFinite(Number(totalAmount)) || Number(totalAmount) < 0) throw new Error('Недостаточно данных заказ-наряда для оплаты');
    if (!['IN_PROGRESS','COMPLETED'].includes(workOrderStatus)) throw new Error('Оплата доступна только для заказ-наряда в работе или завершённого');
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) throw new Error('Сумма платежа должна быть положительной');
    if (!['CASH','CARD','TRANSFER'].includes(method)) throw new Error('Недопустимый способ оплаты');
    const paid = queries.sumCompletedByWorkOrder.get(workOrderId).paid;
    if (paid + Number(amount) > Number(totalAmount)) throw new Error('Сумма платежа превышает остаток к оплате');
    const id = `pay-${require('crypto').randomUUID()}`, now = new Date().toISOString();
    db.prepare('INSERT INTO payments(id,work_order_id,client_id,amount,method,status,created_at) VALUES(?,?,?,?,?,?,?)').run(id,workOrderId,clientId,Number(amount),method,'COMPLETED',now);
    return db.prepare('SELECT * FROM payments WHERE id=?').get(id);
  },
};

const paymentRepo = {
  listPaymentsByWorkOrder: (workOrderId) => queries.listPaymentsByWorkOrder.all(workOrderId),
  listPaymentsByClient: (clientId) => queries.listPaymentsByClient.all(clientId),
  sumCompletedByWorkOrder: (workOrderId) => queries.sumCompletedByWorkOrder.get(workOrderId).paid,
};

module.exports = { db, paymentRepo, paymentOperations };
