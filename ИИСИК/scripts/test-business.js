'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function main() {
  const tempDb = fs.mkdtempSync(path.join(os.tmpdir(), 'appliance-repair-lr4-'));
  process.env.DB_DIR = tempDb;
  try {
    const { seed } = require('../src/seed/seed');
    seed();
    const { graphql } = require('graphql');
    const { schema } = require('../src/gateway/server');
    const clientContext = { principal: { userId: 'u-client-1', role: 'CLIENT', clientId: 'c-1', employeeId: null } };
    const employeeContext = { principal: { userId: 'u-emp-1', role: 'EMPLOYEE', clientId: null, employeeId: 'e-1' } };
    const adminContext = { principal: { userId: 'u-admin-1', role: 'ADMIN', clientId: null, employeeId: null } };
    const run = (source, contextValue, variableValues) => graphql({ schema, source, contextValue, variableValues });

    let result = await run('{ me { id login role } }', clientContext);
    assert.ifError(result.errors?.[0]); assert.equal(result.data.me.id, 'u-client-1');

    result = await run('{ repairQueue(filter:{status:IN_REPAIR,priority:HIGH},sort:PRIORITY){ id status priority } }', employeeContext);
    assert.ifError(result.errors?.[0]); assert(result.data.repairQueue.some(x => x.id === 'rq-1'));

    result = await run('query { catalogServices(filter:{search:"диагностика",active:true},sort:PRICE_ASC){ id name price } }', employeeContext);
    assert.ifError(result.errors?.[0]); assert.equal(result.data.catalogServices[0].id, 's-diag');

    result = await run('mutation { createRepairRequest(input:{deviceId:"d-2",description:"Тестовая заявка",priority:HIGH}){ id status priority } }', clientContext);
    assert.ifError(result.errors?.[0]); assert.equal(result.data.createRepairRequest.status, 'CREATED');
    const createdId = result.data.createRepairRequest.id;

    result = await run('mutation($id:ID!){ acceptRepairRequest(id:$id){ id status } }', employeeContext, { id: createdId });
    assert.ifError(result.errors?.[0]); assert.equal(result.data.acceptRepairRequest.status, 'ACCEPTED');

    result = await run('mutation { registerPayment(workOrderId:"wo-1",amount:100,method:CARD){ id amount status } }', clientContext);
    assert.ifError(result.errors?.[0]); assert.equal(result.data.registerPayment.amount, 100);

    result = await run('query { analyticsSummary(from:"2026-09-01",to:"2026-10-31"){ requestsCreated revenue topServices{serviceName} } }', adminContext);
    assert.ifError(result.errors?.[0]); assert(result.data.analyticsSummary.requestsCreated > 0);

    result = await run('mutation { closeRepairRequest(id:"rq-4"){ id status } }', employeeContext);
    assert(result.errors?.length, 'Недопустимый переход статуса должен завершаться ошибкой');

    result = await run('mutation { upsertService(input:{name:"Проверка",price:-1}){ id } }', adminContext);
    assert(result.errors?.length, 'Отрицательная цена услуги должна отклоняться');

    console.log('Бизнес-тесты пройдены: Query, фильтрация/сортировка, Mutation, смена статуса, оплата, агрегация и проверки ошибок.');
  } finally {
    fs.rmSync(tempDb, { recursive: true, force: true });
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
