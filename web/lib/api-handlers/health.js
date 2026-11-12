'use strict';
const {candidates,contracts,readOnly,send}=require('../demo');
module.exports=(req,res)=>readOnly(req,res,{ok:true,app:'FleetBridge synthetic web preview',version:'0.1.0',readOnly:true});
