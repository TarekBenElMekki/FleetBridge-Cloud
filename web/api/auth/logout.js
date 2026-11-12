'use strict';
const {send}=require('../../lib/demo');
module.exports=(req,res)=>send(req,res,{error:'No user session exists in read-only preview.'},405);
