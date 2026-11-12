'use strict';
const {send}=require('../demo');
module.exports=(req,res)=>send(req,res,{error:'No login for synthetic preview; production identity is not configured.'},403);
