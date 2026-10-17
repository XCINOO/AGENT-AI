(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const modal=$('settingsModal');
 if(!modal)return;
 const text=(fa,en)=>((window.I18N&&I18N.lang==='en')?en:fa);
 function paintLang(){modal.querySelectorAll('[data-fa][data-en]').forEach(el=>{el.textContent=text(el.dataset.fa,el.dataset.en)});$('settingsTitle').textContent=text('تنظیمات','Settings');$('settingsCurrentEmail').textContent=(window.user&&user.email)||'—';$('settingsTheme').textContent=text(document.documentElement.dataset.theme==='light'?'تم روشن':'تم تاریک',document.documentElement.dataset.theme==='light'?'Light theme':'Dark theme');$('settingsLanguage').textContent=text('تغییر به انگلیسی','Switch to Persian');}
 function open(){modal.classList.remove('hidden');paintLang();document.body.style.overflow='hidden';$('settingsClose').focus()}
 function close(){modal.classList.add('hidden');document.body.style.overflow='';$('settingsOpen').focus()}
 document.querySelectorAll('[data-settings-open]').forEach(b=>b.addEventListener('click',open));
 $('settingsClose').addEventListener('click',close);
 modal.addEventListener('click',e=>{if(e.target===modal)close()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.classList.contains('hidden'))close()});
 modal.querySelectorAll('.settings-tab').forEach(b=>b.addEventListener('click',()=>{modal.querySelectorAll('.settings-tab').forEach(x=>x.classList.toggle('active',x===b));modal.querySelectorAll('[data-pane]').forEach(p=>p.classList.toggle('hidden',p.dataset.pane!==b.dataset.tab))}));
 $('settingsTheme').addEventListener('click',()=>{const b=$('themeToggle');if(b)b.click();paintLang()});
 $('settingsLanguage').addEventListener('click',()=>{const b=$('langToggle');if(b)b.click();paintLang()});
 document.addEventListener('langchange',paintLang);
 $('settingsChangeEmail').addEventListener('click',async()=>{
   const input=$('settingsNewEmail'),status=$('settingsEmailStatus'),btn=$('settingsChangeEmail'),email=input.value.trim().toLowerCase();
   status.textContent='';status.style.color='';
   if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){status.textContent=text('یک ایمیل معتبر وارد کنید.','Enter a valid email address.');status.style.color='#ff8f9b';return}
   if(email===((window.user&&user.email)||'').toLowerCase()){status.textContent=text('این همان ایمیل فعلی است.','This is already your current email.');return}
   if(!window.sb||!sb.auth||!sb.auth.updateUser){status.textContent=text('سرویس حساب در دسترس نیست.','Account service is unavailable.');status.style.color='#ff8f9b';return}
   btn.disabled=true;status.textContent=text('در حال ارسال درخواست…','Submitting request…');
   try{const {error}=await sb.auth.updateUser({email});if(error)throw error;status.textContent=text('درخواست ثبت شد. صندوق ورودی ایمیل جدید را برای لینک تأیید بررسی کنید.','Request submitted. Check the new email inbox for a confirmation link.');input.value='';}
   catch(e){console.error('email change failed',e);status.textContent=text('تغییر ایمیل انجام نشد: ','Email change failed: ')+(e&&e.message?e.message:text('خطای نامشخص','Unknown error'));status.style.color='#ff8f9b'}
   finally{btn.disabled=false}
 });
 $('settingsLogout').addEventListener('click',()=>{close();const b=$('logout');if(b)b.click()});
 $('settingsExport').addEventListener('click',()=>{
   const data={product:'Unknown AI',exportedAt:new Date().toISOString(),account:{email:window.user&&user.email||null,id:window.user&&user.id||null},preferences:{theme:document.documentElement.dataset.theme||'dark',language:window.I18N&&I18N.lang||'fa'}};
   const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='unknown-ai-account-info.json';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
 });
 paintLang();
})();