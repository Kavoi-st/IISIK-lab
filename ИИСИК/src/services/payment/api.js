'use strict';
const { paymentRepo:r, paymentOperations:o } = require('./index');
module.exports={listPaymentsByWorkOrder:id=>r.listPaymentsByWorkOrder(id),sumPaid:id=>r.sumCompletedByWorkOrder(id),registerPayment:i=>o.registerPayment(i)};
