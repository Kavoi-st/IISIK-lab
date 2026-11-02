'use strict';
const { repairRepo:r, repairOperations:o } = require('./index');
module.exports={
 findRequest:id=>r.findRequestById(id),
 findRequestForClient:(id,clientId)=>{const x=r.findRequestById(id);return x&&x.client_id===clientId?x:null;},
 findWorkOrder:id=>r.findWorkOrderById(id),
 findWorkOrderForClient:(id,clientId)=>{const o=r.findWorkOrderById(id);if(!o)return null;const q=r.findRequestById(o.request_id);return q&&q.client_id===clientId?o:null;},findWorkOrderByRequest:id=>r.findWorkOrderByRequestId(id),
 listRequestsByClient:id=>r.listRequestsByClient(id),queue:(f,s)=>r.queue(f,s),serviceItems:id=>r.listServiceItems(id),partItems:id=>r.listPartItems(id),
 createRequest:i=>o.createRequest(i),transitionRequest:i=>o.transitionRequest(i),
 transitionRequestForClient:(input,clientId)=>{const q=r.findRequestById(input.id);if(!q||q.client_id!==clientId)throw new Error('Заявка не найдена');return o.transitionRequest(input);},validateWorkOrderForChanges:id=>o.validateWorkOrderForChanges(id),
 addService:i=>o.addService(i),addPart:i=>o.addPart(i),calculateTotal:id=>o.calculateTotal(id),completeWorkOrder:id=>o.completeWorkOrder(id),
 markPaymentReceived:id=>o.markPaymentReceived(id),
};
