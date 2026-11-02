'use strict';

/**
 * Catalog Service — модели данных и чтение (
 *
 */
const { openServiceDb } = require('../../common/db');

const db = openServiceDb('catalog');

db.exec(`
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  is_active INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS spare_parts (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  stock_qty INTEGER NOT NULL,
  is_active INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
`);

const toBool = (row) => row && ({ ...row, is_active: !!row.is_active });

const queries = {
  listServices: db.prepare('SELECT * FROM services ORDER BY name'),
  findServiceById: db.prepare('SELECT * FROM services WHERE id = ?'),
  listParts: db.prepare('SELECT * FROM spare_parts ORDER BY name'),
  findPartById: db.prepare('SELECT * FROM spare_parts WHERE id = ?'),
};

const catalogOperations = {
  upsertService({ id, name, price, isActive = true }) {
    if (!name || !Number.isFinite(Number(price)) || Number(price) < 0) throw new Error('Укажите название и неотрицательную цену услуги');
    const key = id || `svc-${require('crypto').randomUUID()}`, now = new Date().toISOString();
    db.prepare(`INSERT INTO services(id,name,price,is_active,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,price=excluded.price,is_active=excluded.is_active,updated_at=excluded.updated_at`)
      .run(key, name.trim(), Number(price), isActive ? 1 : 0, now);
    return queries.findServiceById.get(key);
  },
  upsertPart({ id, sku, name, price, stockQty = 0, isActive = true }) {
    if (!sku || !name || !Number.isFinite(Number(price)) || Number(price) < 0 || !Number.isInteger(Number(stockQty)) || Number(stockQty) < 0) throw new Error('Проверьте артикул, название, цену и остаток');
    const key = id || `part-${require('crypto').randomUUID()}`, now = new Date().toISOString();
    db.prepare(`INSERT INTO spare_parts(id,sku,name,price,stock_qty,is_active,updated_at) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET sku=excluded.sku,name=excluded.name,price=excluded.price,stock_qty=excluded.stock_qty,is_active=excluded.is_active,updated_at=excluded.updated_at`)
      .run(key, sku, name.trim(), Number(price), Number(stockQty), isActive ? 1 : 0, now);
    return queries.findPartById.get(key);
  },
  reservePart(partId, quantity) {
    const part = queries.findPartById.get(partId);
    if (!part || !part.is_active) throw new Error('Запчасть не найдена или неактивна');
    if (!Number.isInteger(Number(quantity)) || Number(quantity) < 1 || part.stock_qty < Number(quantity)) throw new Error('Недостаточный остаток запчасти');
    db.prepare('UPDATE spare_parts SET stock_qty=stock_qty-?,updated_at=? WHERE id=?').run(Number(quantity), new Date().toISOString(), partId);
    return queries.findPartById.get(partId);
  },
};

const catalogRepo = {
  listServices: () => queries.listServices.all().map(toBool),
  findServiceById: (id) => toBool(queries.findServiceById.get(id)),
  listParts: () => queries.listParts.all().map(toBool),
  findPartById: (id) => toBool(queries.findPartById.get(id)),
};

module.exports = { db, catalogRepo, catalogOperations };
