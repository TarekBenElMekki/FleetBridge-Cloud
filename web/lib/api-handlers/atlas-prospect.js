'use strict';
const {send}=require('../demo');
module.exports=(req,res)=>send(req,res,{error:'This preview is read-only. No private or local API is available.'},405);
