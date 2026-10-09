/* =====================================================================
   CHAT EXTRAS v4 — اسکریپت مستقل (فقط لایه‌ی رابط کاربری)
   - حذف گفتگو (منوی سه‌نقطه + پنجره‌ی تأیید) و «پاک کردن همه تاریخچه»
   - متن چرخشی زیر لوگوی صفحه‌ی اصلی
   - هیچ دیتابیس/API/سیستم ذخیره‌سازی جدیدی نمی‌سازد: حذف با همان کلاینت Supabase
     و همان جدول‌های chats و messages انجام می‌شود که خود سایت استفاده می‌کند.
   - به‌دلیل CSP سایت، این کد در فایل جدا آمده تا hash اسکریپت‌های inline تغییر نکند.
   - از توابع/متغیرهای موجود فقط می‌خواند یا صدا می‌زند: sb, user, currentChat,
     loadChats, welcome (بدون بازنویسی آن‌ها).
   ===================================================================== */
(function(){
  'use strict';
  var g=function(i){return document.getElementById(i)};
  var root=document.documentElement;
  var chatsEl=g('chats'),msgsEl=g('messages'),clearBtn=g('clearAllChats');
  if(!chatsEl||!msgsEl||!clearBtn)return;

  var ZW='‌';
  var TXT={
    single:'می'+ZW+'خوای پاکم کنی، خاطراتی که با هم داشتیمو؟ :)',
    keep:'نه، بمون ❤️',
    del:'آره، پاکش کن',
    allTitle:'همهٔ تاریخچه پاک بشه؟',
    allSub:'همهٔ گفت'+ZW+'وگوها برای همیشه پاک می'+ZW+'شن و قابل بازگشت نیستن.',
    allDel:'آره، همه رو پاک کن',
    busy:'در حال پاک شدن…',
    fail:'پاک کردن انجام نشد. دوباره تلاش کن.',
    menuDel:'حذف گفت'+ZW+'وگو',
    more:'گزینه'+ZW+'های گفت'+ZW+'وگو'
  };
  var ROTATE_TEXT='جیبامو نگرد، اون چیزی که دنبالشی تو مخمه :)';
  var ROTATE_MS=4000;

  var DOTS='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/></svg>';
  var TRASH='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4.5 7h15M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M6.5 7l.8 11.2A1.8 1.8 0 0 0 9.1 20h5.8a1.8 1.8 0 0 0 1.8-1.8L17.5 7M10 11v5M14 11v5"/></svg>';

  /* دسترسی امن به متغیرهای سراسری اسکریپت اصلی */
  function curUser(){try{return user}catch(e){return null}}
  function curChat(){try{return currentChat}catch(e){return null}}

  /* =================================================================
     ۱) متن چرخشی زیر لوگو
     همه‌ی متن‌ها در یک سلول grid روی هم قرار می‌گیرند؛ پس ارتفاع بلوک برابر
     بلندترین متن است و با عوض‌شدن متن هیچ چیزی جابه‌جا نمی‌شود.
     ================================================================= */
  var rotTimer=null;
  function stopRotate(){if(rotTimer){clearInterval(rotTimer);rotTimer=null}}
  function startRotate(h1){
    stopRotate();
    var list=h1.querySelectorAll('.rt-item');
    if(list.length<2)return;
    var cur=0;
    rotTimer=setInterval(function(){
      if(!h1.isConnected){stopRotate();return}
      if(document.hidden)return;
      list[cur].classList.remove('on');list[cur].setAttribute('aria-hidden','true');
      cur=(cur+1)%list.length;
      list[cur].classList.add('on');list[cur].removeAttribute('aria-hidden');
    },ROTATE_MS);
  }
  function syncWelcome(){
    var h1=msgsEl.querySelector('.welcome h1');
    if(!h1){stopRotate();return}
    if(h1.getAttribute('data-rt'))return;
    var orig=(h1.textContent||'').trim();
    var texts=[ROTATE_TEXT];
    if(orig&&orig!==ROTATE_TEXT)texts.push(orig);   /* متن قبلی حفظ می‌شود و در چرخه می‌ماند */
    h1.textContent='';
    h1.classList.add('rt');h1.setAttribute('data-rt','1');
    texts.forEach(function(t,i){
      var s=document.createElement('span');
      s.className='rt-item'+(i===0?' on':'');
      if(i)s.setAttribute('aria-hidden','true');
      s.textContent=t;h1.appendChild(s);
    });
    startRotate(h1);
  }
  new MutationObserver(syncWelcome).observe(msgsEl,{childList:true});
  syncWelcome();

  /* =================================================================
     ۲) منوی سه‌نقطه کنار هر گفتگو
     ================================================================= */
  var menu=null,menuItem=null,menuFor=null,menuTarget=null;

  function buildMenu(){
    menu=document.createElement('div');
    menu.className='cm-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-hidden','true');
    menu.innerHTML='<button type="button" class="cm-item" role="menuitem">'+TRASH+'<span></span></button>';
    menuItem=menu.firstChild;
    menuItem.lastChild.textContent=TXT.menuDel;
    document.body.appendChild(menu);
    menuItem.addEventListener('click',function(){
      var t=menuTarget;closeMenu(false);
      if(t)askDeleteOne(t);
    });
    menu.addEventListener('keydown',function(e){
      if(e.key==='Escape'){e.stopPropagation();e.preventDefault();closeMenu(true)}
      else if(e.key==='Tab'){closeMenu(false)}
    });
  }
  function closeMenu(returnFocus){
    if(!menu||!menu.classList.contains('open'))return;
    menu.classList.remove('open');menu.setAttribute('aria-hidden','true');
    var b=menuFor;menuFor=null;menuTarget=null;
    if(b){b.classList.remove('open');b.setAttribute('aria-expanded','false');
      if(returnFocus&&b.isConnected)try{b.focus({preventScroll:true})}catch(e){}}
  }
  function openMenu(btn,chat){
    if(!menu)buildMenu();
    if(menuFor===btn){closeMenu(true);return}
    closeMenu(false);
    menuFor=btn;menuTarget={id:chat.id,title:chat.title,btn:btn};
    btn.classList.add('open');btn.setAttribute('aria-expanded','true');
    var rtl=getComputedStyle(root).direction==='rtl';
    var r=btn.getBoundingClientRect(),mw=menu.offsetWidth||172,mh=menu.offsetHeight||48,m=8;
    var left=rtl?r.left:r.right-mw;
    left=Math.max(m,Math.min(left,window.innerWidth-mw-m));
    var top=r.bottom+6,flip=false;
    if(top+mh>window.innerHeight-m){top=r.top-mh-6;flip=true}
    if(top<m)top=m;
    menu.style.left=left+'px';menu.style.top=top+'px';
    menu.style.transformOrigin=(flip?'bottom ':'top ')+(rtl?'left':'right');
    void menu.offsetWidth;
    menu.classList.add('open');menu.setAttribute('aria-hidden','false');
    setTimeout(function(){if(menuFor===btn)try{menuItem.focus({preventScroll:true})}catch(e){}},40);
  }
  document.addEventListener('mousedown',function(e){
    if(menu&&menu.classList.contains('open')&&!menu.contains(e.target)&&e.target!==menuFor&&!(menuFor&&menuFor.contains(e.target)))closeMenu(false);
  },true);
  window.addEventListener('scroll',function(e){if(menu&&menu.classList.contains('open')&&!menu.contains(e.target))closeMenu(false)},true);
  window.addEventListener('resize',function(){closeMenu(false)});

  /* ---------- افزودن دکمه‌ی سه‌نقطه به آیتم‌های تاریخچه ---------- */
  function decorate(){
    var cache=window.__chatsCache||[];
    clearBtn.classList.toggle('hidden',!cache.length);
    if(menuFor&&!menuFor.isConnected)closeMenu(false);
    var els=[].slice.call(chatsEl.children).filter(function(n){return n.classList&&n.classList.contains('chatitem')});
    if(els.length!==cache.length)return;
    els.forEach(function(el,i){
      var c=cache[i];
      if(el.getAttribute('data-cid'))return;
      if((el.textContent||'')!==(c.title||'گفتگوی جدید'))return;   /* اطمینان از تطابق آیتم و داده */
      el.setAttribute('data-cid',c.id);el.classList.add('hasmore');
      var b=document.createElement('button');
      b.type='button';b.className='chatmore';b.innerHTML=DOTS;
      b.setAttribute('aria-label',TXT.more);b.setAttribute('aria-haspopup','menu');b.setAttribute('aria-expanded','false');
      b.addEventListener('click',function(e){e.stopPropagation();openMenu(b,c)});    /* باز نشدن گفتگو */
      b.addEventListener('keydown',function(e){e.stopPropagation()});               /* Enter/Space روی دکمه، گفتگو را باز نکند */
      el.appendChild(b);
    });
  }
  new MutationObserver(decorate).observe(chatsEl,{childList:true});
  decorate();

  /* =================================================================
     ۳) پنجره‌ی تأیید (مشترک برای حذف تکی و حذف همه)
     ================================================================= */
  var dlg=null,dTitle,dSub,dKeep,dDel,dErr,dLast=null,dBusy=false,dRun=null,dDelLabel='';

  function buildDialog(){
    dlg=document.createElement('div');
    dlg.className='cd-modal';dlg.setAttribute('aria-hidden','true');
    dlg.innerHTML=
      '<div class="cd-panel" role="alertdialog" aria-modal="true" aria-labelledby="cdTitle" aria-describedby="cdSub">'+
        '<div class="cd-icon" aria-hidden="true">'+TRASH+'</div>'+
        '<h2 class="cd-title" id="cdTitle"></h2>'+
        '<p class="cd-sub" id="cdSub"></p>'+
        '<div class="cd-actions"><button type="button" class="cd-btn cd-keep"></button><button type="button" class="cd-btn cd-del"></button></div>'+
        '<div class="cd-err" role="status" aria-live="polite"></div>'+
      '</div>';
    document.body.appendChild(dlg);
    dTitle=dlg.querySelector('.cd-title');dSub=dlg.querySelector('.cd-sub');
    dKeep=dlg.querySelector('.cd-keep');dDel=dlg.querySelector('.cd-del');dErr=dlg.querySelector('.cd-err');
    dKeep.addEventListener('click',closeDialog);              /* «نه، بمون»: فقط بسته شود */
    dDel.addEventListener('click',confirmDialog);
    dlg.addEventListener('mousedown',function(e){if(e.target===dlg)closeDialog()});
    dlg.addEventListener('keydown',function(e){
      if(e.key==='Escape'){e.stopPropagation();e.preventDefault();closeDialog();return}
      if(e.key==='Tab'){
        var f=[].filter.call(dlg.querySelectorAll('button:not([disabled])'),function(n){return n.offsetParent!==null});
        if(!f.length){e.preventDefault();return}
        var a=f[0],z=f[f.length-1];
        if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}
        else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}
      }
    });
  }
  function showDialog(o){
    if(!dlg)buildDialog();
    if(dlg.classList.contains('open'))return;
    closeMenu(false);
    dTitle.textContent=o.title;dSub.textContent=o.sub||'';
    dKeep.textContent=o.keep;dDel.textContent=o.del;dDelLabel=o.del;dErr.textContent='';
    dRun=o.run;dBusy=false;dKeep.disabled=false;dDel.disabled=false;
    dLast=o.returnTo||document.activeElement;
    void dlg.offsetWidth;
    dlg.classList.add('open');dlg.setAttribute('aria-hidden','false');
    setTimeout(function(){try{dKeep.focus({preventScroll:true})}catch(e){}},80);   /* فوکوس روی گزینه‌ی امن */
  }
  function closeDialog(){
    if(dBusy||!dlg||!dlg.classList.contains('open'))return;
    dlg.classList.remove('open');dlg.setAttribute('aria-hidden','true');
    var t=(dLast&&dLast.isConnected&&dLast.offsetParent!==null)?dLast:g('newChat');
    dRun=null;
    if(t)try{t.focus({preventScroll:true})}catch(e){}
  }
  async function confirmDialog(){
    if(dBusy||!dRun)return;
    dBusy=true;dKeep.disabled=true;dDel.disabled=true;dDel.textContent=TXT.busy;dErr.textContent='';
    var ok=false;
    try{await dRun();ok=true}
    catch(err){console.error('delete failed',err);dErr.textContent=TXT.fail}
    dBusy=false;
    if(ok){closeDialog()}
    else{dKeep.disabled=false;dDel.disabled=false;dDel.textContent=dDelLabel}
  }

  /* =================================================================
     ۴) حذف واقعی — با همان کلاینت Supabase و همان جدول‌های موجود
     ================================================================= */
  async function refreshAfterDelete(all,id){
    if(all||curChat()===id){
      try{currentChat=null}catch(e){}
      try{welcome()}catch(e){}
    }
    try{await loadChats()}catch(e){console.error(e)}
    var si=g('chatSearch');
    if(si&&si.value.trim())si.dispatchEvent(new Event('input'));   /* نتایج جست‌وجوی باز هم تازه شود */
  }
  async function deleteOne(id){
    var u=curUser();if(!u)throw new Error('no user');
    var r1=await sb.from('messages').delete().eq('chat_id',id).eq('user_id',u.id);
    if(r1.error)console.warn('messages delete',r1.error);
    var r2=await sb.from('chats').delete().eq('id',id).eq('user_id',u.id).select('id');
    if(r2.error)throw r2.error;
    if(!r2.data||!r2.data.length){
      var chk=await sb.from('chats').select('id').eq('id',id);       /* شاید قبلاً از جای دیگری پاک شده */
      if(chk.error)throw chk.error;
      if(chk.data&&chk.data.length)throw new Error('chat not deleted');
    }
    await refreshAfterDelete(false,id);
  }
  async function deleteAll(){
    var u=curUser();if(!u)throw new Error('no user');
    var r1=await sb.from('messages').delete().eq('user_id',u.id);
    if(r1.error)console.warn('messages delete',r1.error);
    var r2=await sb.from('chats').delete().eq('user_id',u.id).select('id');
    if(r2.error)throw r2.error;
    var chk=await sb.from('chats').select('id').eq('user_id',u.id).limit(1);
    if(chk.error)throw chk.error;
    if(chk.data&&chk.data.length)throw new Error('chats not deleted');
    await refreshAfterDelete(true,null);
  }
  function askDeleteOne(t){
    var title=String(t.title||'گفتگوی جدید');
    if(title.length>60)title=title.slice(0,60)+'…';
    showDialog({title:TXT.single,sub:title,keep:TXT.keep,del:TXT.del,returnTo:t.btn,run:function(){return deleteOne(t.id)}});
  }
  clearBtn.addEventListener('click',function(){
    showDialog({title:TXT.allTitle,sub:TXT.allSub,keep:TXT.keep,del:TXT.allDel,returnTo:clearBtn,run:deleteAll});
  });
})();
