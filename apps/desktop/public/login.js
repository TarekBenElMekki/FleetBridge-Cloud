'use strict';
const form=document.getElementById('loginForm'),input=document.getElementById('pin'),feedback=document.getElementById('feedback'),submit=document.getElementById('submit');
document.getElementById('show').addEventListener('click',event=>{const reveal=input.type==='password';input.type=reveal?'text':'password';event.currentTarget.textContent=reveal?'Hide':'Show';input.focus();});
form.addEventListener('submit',async event=>{event.preventDefault();feedback.textContent='';if(!/^\d{4}$/.test(input.value)){feedback.textContent='Please enter a four-digit PIN.';return;}submit.disabled=true;
 try{const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({pin:input.value})});const result=await response.json();if(!response.ok)throw Error(result.error||'Access denied');input.value='';window.location.replace('/#/candidates');}
 catch(error){feedback.textContent=error.message;input.value='';input.focus();}finally{submit.disabled=false;}});
