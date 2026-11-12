'use strict';
const {readOnly}=require('../demo');
module.exports=(req,res)=>readOnly(req,res,{authenticated:false,preview:true,mode:'synthetic-read-only-demo'});
