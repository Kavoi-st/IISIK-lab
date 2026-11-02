'use strict';
const { notificationRepo:r, notificationOperations:o } = require('./index');
module.exports={listNotificationsByClient:id=>r.listNotificationsByClient(id),listNotificationsByRequest:id=>r.listNotificationsByRequest(id),create:i=>o.create(i)};
