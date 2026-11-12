'use strict';
const {candidates,contracts,readOnly,send}=require('../demo');
module.exports=(req,res)=>readOnly(req,res,{statuses:{},notes:{}});
