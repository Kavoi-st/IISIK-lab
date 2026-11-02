'use strict';
const { catalogRepo:r, catalogOperations:o } = require('./index');
const sortRows=(rows,filter={},sort='NAME_ASC',kind='service')=>{
 let out=rows.filter(x=>filter.active===undefined||x.is_active===!!filter.active);
 if(filter.search){const q=String(filter.search).toLocaleLowerCase();out=out.filter(x=>(kind==='part'?x.name+' '+x.sku:x.name).toLocaleLowerCase().includes(q));}
 const cmp=(a,b)=>sort==='PRICE_DESC'?b.price-a.price:sort==='PRICE_ASC'?a.price-b.price:sort==='STOCK_ASC'?(a.stock_qty||0)-(b.stock_qty||0):String(a.name).localeCompare(String(b.name),'ru');
 return out.sort(cmp);
};
module.exports={findServiceById:id=>r.findServiceById(id),findPartById:id=>r.findPartById(id),
 listServices:(f,s)=>sortRows(r.listServices(),f,s,'service'),listParts:(f,s)=>sortRows(r.listParts(),f,s,'part'),
 reservePart:(id,q)=>o.reservePart(id,q),upsertService:i=>o.upsertService(i),upsertPart:i=>o.upsertPart(i)};
