'use strict';
const {candidates,contracts,readOnly,send}=require('../lib/demo');
module.exports=(req,res)=>send(req,res,{error:'Export disabled in web preview.'},405);
