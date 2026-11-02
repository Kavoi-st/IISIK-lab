'use strict';

/**
 * Notification Service — модели данных и чтение 
 */
const { openServiceDb } = require('../../common/db');

const db = openServiceDb('notification');

db.exec(`
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  request_id TEXT,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  delivery_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_client ON notifications(client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_request ON notifications(request_id);
CREATE TABLE IF NOT EXISTS client_contacts_cache (
  client_id TEXT PRIMARY KEY,
  email TEXT,
  phone TEXT,
  updated_at TEXT NOT NULL
);
`);

const queries = {
  listNotificationsByClient: db.prepare(
    'SELECT * FROM notifications WHERE client_id = ? ORDER BY created_at DESC'),
  listNotificationsByRequest: db.prepare(
    'SELECT * FROM notifications WHERE request_id = ? ORDER BY created_at DESC'),
  findContactsCache: db.prepare('SELECT * FROM client_contacts_cache WHERE client_id = ?'),
};

const notificationOperations = {
  create(input) { const id = `n-${require('crypto').randomUUID()}`, now = new Date().toISOString(); db.prepare('INSERT INTO notifications(id,client_id,request_id,event_type,title,body,delivery_status,created_at,sent_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,input.clientId,input.requestId || null,input.eventType,input.title,input.body,'SENT',now,now); return db.prepare('SELECT * FROM notifications WHERE id=?').get(id); },
};

const notificationRepo = {
  listNotificationsByClient: (clientId) => queries.listNotificationsByClient.all(clientId),
  listNotificationsByRequest: (requestId) => queries.listNotificationsByRequest.all(requestId),
  findContactsCache: (clientId) => queries.findContactsCache.get(clientId),
};

module.exports = { db, notificationRepo, notificationOperations };
