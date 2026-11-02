'use strict';
const { customerRepo:r, customerOperations:o } = require('./index');
module.exports = {
 findClientById: id => r.findClientById(id), findClientByUserId: id => r.findClientByUserId(id),
 listDevicesByClient: id => r.listDevicesByClient(id), findDeviceById: id => r.findDeviceById(id),
 getDeviceForClient: (id, clientId) => { const d=r.findDeviceById(id); if(!d || d.client_id!==clientId) return null; return d; },
 findCategoryById: id => r.findCategoryById(id), listCategories: () => r.listCategories(),
 createClient: c => o.createClient(c), registerDevice: input => o.registerDevice(input), updateDevice: input => o.updateDevice(input),
 updateDeviceForClient: (input, clientId) => o.updateDevice({...input, clientId}),
};
