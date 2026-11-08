/* =====================================================================
   CHAT PLUS v1 — اسکریپت مستقل (فقط لایه‌ی رابط کاربری)
   - کارت کد به سبک VS Code با دکمه‌ی کپی (روی خروجی markdown موجود)
   - ویرایش آخرین پیام کاربر while the reply is being prepared
   - دکمه‌ی «حالت ساخت تصویر» داخل کادر چت (window.__uaImageMode)
   به‌دلیل CSP سایت در فایل جدا آمده تا hash اسکریپت‌های inline تغییر نکند.
   از توابع/متغیرهای موجود فقط می‌خواند یا صدا می‌زند: sb, user, currentChat.
   ===================================================================== */
(function(){
  'use strict';
  var msgsEl=document.getElementById('messages');
  if(!msgsEl)return;
  function T(k){try{return I18N.t(k)}catch(e){return k}}
  function curUser(){try{return user}catch(e){return null}}
  function curChat(){try{return currentChat}catch(e){return null}}

  var COPY_SVG='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15H4.5A2.5 2.5 0 0 1 2 12.5v-8A2.5 2.5 0 0 1 4.5 2h8A2.5 2.5 0 0 1 15 4.5V5"/></svg>';
  var CHECK_SVG='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12.5 9.5 18 20 6.5"/></svg>';
  var PENCIL_SVG='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14.5 4.5 19.5 9.5 8 21H3v-5L14.5 4.5z"/><path d="m12.5 6.5 5 5"/></svg>';
  var IMG_SVG='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m4.5 18 5-5 3.5 3.5 3-3 3.5 3.5"/></svg>';

  /* =================================================================
     ۱) کارت کد با دکمه‌ی کپی
     ================================================================= */
  function wrapCode(pre){
    if(pre.closest('.ua-codecard'))return;
    var card=document.createElement('div');card.className='ua-codecard';
    var head=document.createElement('div');head.className='ua-codecard-head';
    var lang=document.createElement('span');lang.className='ua-lang';lang.textContent='code';
    var btn=document.createElement('button');btn.type='button';btn.className='ua-copybtn';
    btn.innerHTML=COPY_SVG+'<span>'+T('chat.copy')+'</span>';
    btn.addEventListener('click',function(){
      var code=pre.textContent||'';
      function done(){
        btn.classList.add('ok');btn.innerHTML=CHECK_SVG+'<span>'+T('chat.copied')+'</span>';
        setTimeout(function(){btn.classList.remove('ok');btn.innerHTML=COPY_SVG+'<span>'+T('chat.copy')+'</span>'},1600);
      }
      if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(code).then(done,done);
      else{var ta=document.createElement('textarea');ta.value=code;document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch(e){}ta.remove();done()}
    });
    head.appendChild(lang);head.appendChild(btn);
    pre.parentNode.insertBefore(card,pre);
    card.appendChild(head);card.appendChild(pre);
  }

  /* پیام‌های تاریخچه متن ساده‌اند؛ اگر ``` دارند با همان markdown امن سایت رندر می‌شوند */
  function renderFence(bubble){
    if(bubble.dataset.uaMdDone||bubble.classList.contains('ua-streaming'))return;
    if(bubble.querySelector('pre.ua-code'))return;
    var txt=bubble.textContent||'';
    if(txt.indexOf('```')===-1){bubble.dataset.uaMdDone='1';return}
    if(!window.STREAM||!STREAM.md)return;
    var keep=[].slice.call(bubble.children).filter(function(n){
      return n.classList&&(n.classList.contains('msg-actions')||n.classList.contains('fb-comment'));
    });
    keep.forEach(function(n){n.remove()});
    bubble.innerHTML=STREAM.md(txt);
    keep.forEach(function(n){bubble.appendChild(n)});
    bubble.dataset.uaMdDone='1';
  }

  function scanCodes(){
    msgsEl.querySelectorAll('.msg.ai .bubble').forEach(function(b){
      if(b.classList.contains('ua-streaming'))return;
      renderFence(b);
      b.querySelectorAll('pre.ua-code').forEach(wrapCode);
    });
  }

  /* =================================================================
     ۲) ویرایش آخرین پیام کاربر while thinking
     ================================================================= */
  var editBtn=null,editTarget=null;
  function removeEdit(){
    if(editBtn){editBtn.remove();editBtn=null}
    if(editTarget){editTarget.classList.remove('ua-editable');editTarget=null}
  }
  function syncEdit(){
    var typing=document.getElementById('typing');
    if(!typing){removeEdit();return}
    var users=msgsEl.querySelectorAll('.msg.user');
    var last=users[users.length-1];
    if(!last){removeEdit();return}
    if(editTarget===last&&editBtn)return;
    removeEdit();
    editTarget=last;last.classList.add('ua-editable');
    editBtn=document.createElement('button');
    editBtn.type='button';editBtn.className='ua-editbtn';editBtn.title=T('chat.edit');editBtn.setAttribute('aria-label',T('chat.edit'));
    editBtn.innerHTML=PENCIL_SVG;
    editBtn.addEventListener('click',function(){
      var bubble=last.querySelector('.bubble');
      var text=bubble?bubble.textContent:'';

      var chatId=curChat(),u=curUser();
      window.__userStopped=true;
      if(window.__chatCtl){try{window.__chatCtl.abort()}catch(e){}}
      var t=document.getElementById('typing');if(t)t.remove();
      last.remove();removeEdit();
      var inp=document.getElementById('input');
      if(inp){inp.value=text;inp.dispatchEvent(new Event('input'));inp.focus()}
      /* حذف بهترین‌تلاش از دیتابیس: آخرین پیام کاربر با همین متن در همین گفتگو */
      if(u&&chatId&&text){
        try{
          /* فقط اگر آخرین پیام ذخیره‌شده‌ی گفتگو دقیقاً همین پیام کاربر باشد پاک می‌شود
             (اگر پاسخ AI قبلاً ذخیره شده، چیزی پاک نمی‌شود تا پاسخ یتیم نماند و پیام دیگری حذف نشود) */
          sb.from('messages').select('id,role,content').eq('chat_id',chatId)
            .order('created_at',{ascending:false}).limit(1)
            .then(function(r){
              var row=r&&r.data&&r.data[0];
              if(row&&row.role==='user'&&row.content===text)return sb.from('messages').delete().eq('id',row.id).eq('chat_id',chatId);
            }).catch(function(){});
        }catch(e){}
      }
    });
    var bub=last.querySelector('.bubble');
    (bub||last).appendChild(editBtn);
  }

  /* =================================================================
     ۳) دکمه‌ی حالت ساخت تصویر داخل کادر چت
     ================================================================= */
  function injectImageMode(){
    var composer=document.querySelector('.composer');
    if(!composer||composer.querySelector('.ua-imgmode'))return;
    var anchor=composer.querySelector('.model-picker')||composer.querySelector('.send');
    if(!anchor)return;
    var b=document.createElement('button');
    b.type='button';b.className='ua-imgmode';b.innerHTML=IMG_SVG;
    function label(){b.title=T('chat.imagemode');b.setAttribute('aria-label',T('chat.imagemode'))}
    label();
    document.addEventListener('langchange',label);
    b.setAttribute('aria-pressed','false');
    b.addEventListener('click',function(){
      window.__uaImageMode=!window.__uaImageMode;
      b.classList.toggle('on',!!window.__uaImageMode);
      b.setAttribute('aria-pressed',window.__uaImageMode?'true':'false');
      var inp=document.getElementById('input');if(inp)inp.focus();
    });
    anchor.parentNode.insertBefore(b,anchor);
  }

  /* ================================================================= */
  var scheduled=false;
  function sync(){
    if(scheduled)return;scheduled=true;
    requestAnimationFrame(function(){scheduled=false;scanCodes();syncEdit();injectImageMode()});
  }
  new MutationObserver(sync).observe(msgsEl,{childList:true,subtree:true,characterData:true});
  document.addEventListener('langchange',sync);
  sync();
})();
