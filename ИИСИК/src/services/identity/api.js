'use strict';
const { identityRepo:r, identityOperations:o } = require('./index');
module.exports = {
 findUserById: id => r.findUserById(id), findEmployeeByUserId: id => r.findEmployeeByUserId(id),
 registerUser: input => o.registerUser(input), login: input => o.login(input), assignRole: input => o.assignRole(input),
};
