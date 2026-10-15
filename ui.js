/* =====================================================================
   انتخاب پروفایل — اسکریپت مستقل (فقط رابط کاربری)
   - به منطق چت/احراز هویت/دیتابیس دست نمی‌زند و هیچ درخواست شبکه‌ای نمی‌فرستد.
   - انتخاب هر کاربر روی همین دستگاه (localStorage) و بر اساس ایمیلش ذخیره می‌شود.
   - به‌دلیل CSP سایت، این کد در فایل جدا آمده تا hash اسکریپت‌های inline تغییر نکند.
   ===================================================================== */
(function(){
  'use strict';
  var g=function(i){return document.getElementById(i)};
  var root=document.documentElement;
  var appEl=g('app'),dot=g('userdot');
  if(!appEl||!dot)return;

  var AVATARS=[
    {id:'a1',src:'avatars/a1.jpg',label:'جنگجوی آبی'},
    {id:'a2',src:'avatars/a2.jpg',label:'عینک نارنجی'},
    {id:'a3',src:'avatars/a3.jpg',label:'همستر هکر'},
    {id:'a4',src:'avatars/a4.jpg',label:'کابوی'},
    {id:'a5',src:'avatars/a5.jpg',label:'فضایی'},
    {id:'a6',src:'avatars/a6.jpg',label:'نقاب‌دار'}
  ];
  var CHECK='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  var PERSON='<svg class="ph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20c.7-3.7 3.5-5.8 7.2-5.8s6.5 2.1 7.2 5.8"/></svg>';
  var CLOSE='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  var memory={};            /* اگر localStorage در دسترس نبود، فقط تا بستن صفحه */
  var picker=null,grid=null,doneBtn=null,preview=null,items=[],imgs=[];
  var selected=null,required=false,lastFocus=null,shown=false;

  function find(id){for(var i=0;i<AVATARS.length;i++)if(AVATARS[i].id===id)return AVATARS[i];return null}
  function key(){var e=(g('useremail')&&g('useremail').textContent||'').trim().toLowerCase();return 'avatar:'+(e||'guest')}
  function load(){var k=key();try{var v=localStorage.getItem(k);if(v)return v}catch(e){}return memory[k]||null}
  function save(id){var k=key();memory[k]=id;try{localStorage.setItem(k,id)}catch(e){}}
  function abs(a){try{return new URL(a.src,document.baseURI).href}catch(e){return a.src}}

  /* ---------- نمایش پروفایل انتخاب‌شده در سایت ---------- */
  function apply(id){
    var a=find(id);
    if(!a){root.classList.remove('has-avatar');root.style.removeProperty('--me-avatar');return}
    root.style.setProperty('--me-avatar','url("'+abs(a)+'")');
    root.classList.add('has-avatar');
  }
  function popDot(){dot.classList.remove('av-pop');void dot.offsetWidth;dot.classList.add('av-pop')}

  /* ---------- ساخت پنجره‌ی انتخاب ---------- */
  function build(){
    picker=document.createElement('div');
    picker.id='avatarModal';picker.className='av-modal';picker.setAttribute('aria-hidden','true');
    var cells='',prev='';
    AVATARS.forEach(function(a){
      cells+='<button type="button" class="av-item" role="radio" aria-checked="false" data-id="'+a.id+'" aria-label="'+a.label+'"><img src="'+a.src+'" alt="" draggable="false"><span class="chk">'+CHECK+'</span></button>';
      prev+='<img src="'+a.src+'" alt="" data-id="'+a.id+'" draggable="false">';
    });
    picker.innerHTML=
      '<div class="av-sheet" role="dialog" aria-modal="true" aria-labelledby="avTitle">'+
        '<button type="button" class="iconbtn av-close" aria-label="بستن">'+CLOSE+'</button>'+
        '<div class="av-preview" aria-hidden="true">'+PERSON+prev+'</div>'+
        '<h2 id="avTitle">پروفایلت را انتخاب کن</h2>'+
        '<p class="av-sub">یکی از این تصویرها نمایهٔ تو خواهد بود.<br>هر وقت خواستی از پایین سایدبار می‌توانی عوضش کنی.</p>'+
        '<div class="av-grid" role="radiogroup" aria-labelledby="avTitle">'+cells+'</div>'+
        '<button type="button" class="authbutton av-done" disabled>ادامه</button>'+
      '</div>';
    document.body.appendChild(picker);
    grid=picker.querySelector('.av-grid');doneBtn=picker.querySelector('.av-done');preview=picker.querySelector('.av-preview');
    items=[].slice.call(picker.querySelectorAll('.av-item'));imgs=[].slice.call(preview.querySelectorAll('img'));

    grid.addEventListener('click',function(e){var b=e.target.closest('.av-item');if(b)select(b.getAttribute('data-id'),false)});
    grid.addEventListener('keydown',function(e){
      var k=e.key,i=items.indexOf(document.activeElement);if(i<0)return;
      var rtl=getComputedStyle(root).direction==='rtl',n=items.length,to=-1;
      if(k==='ArrowRight')to=rtl?i-1:i+1;else if(k==='ArrowLeft')to=rtl?i+1:i-1;
      else if(k==='ArrowDown')to=i+3;else if(k==='ArrowUp')to=i-3;else return;
      e.preventDefault();
      if(to<0||to>=n)return;
      items[to].focus();select(items[to].getAttribute('data-id'),false);
    });
    doneBtn.addEventListener('click',confirm);
    picker.querySelector('.av-close').addEventListener('click',function(){closePicker()});
    picker.addEventListener('mousedown',function(e){if(e.target===picker&&!required)closePicker()});
    picker.addEventListener('keydown',function(e){
      if(e.key==='Escape'){e.stopPropagation();if(!required)closePicker();return}
      if(e.key==='Tab'){
        var f=[].filter.call(picker.querySelectorAll('button:not([disabled])'),function(n){return n.offsetParent!==null});
        if(!f.length)return;var a=f[0],z=f[f.length-1];
        if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}
        else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}
      }
    });
  }

  function select(id,silent){
    if(!find(id))return;
    var changed=selected!==id;selected=id;
    items.forEach(function(b){var on=b.getAttribute('data-id')===id;b.classList.toggle('sel',on);b.setAttribute('aria-checked',on?'true':'false')});
    grid.classList.add('has-sel');
    imgs.forEach(function(im){im.classList.toggle('on',im.getAttribute('data-id')===id)});
    preview.classList.add('has');
    if(changed&&!silent){preview.classList.remove('pop');void preview.offsetWidth;preview.classList.add('pop')}
    doneBtn.disabled=false;
  }

  function openPicker(isRequired){
    if(!picker)build();
    if(picker.classList.contains('open'))return;
    required=!!isRequired;
    picker.classList.toggle('req',required);
    doneBtn.textContent=required?'ادامه':'ذخیره';
    var cur=load();
    selected=null;grid.classList.remove('has-sel');preview.classList.remove('has','pop');doneBtn.disabled=true;
    items.forEach(function(b){b.classList.remove('sel');b.setAttribute('aria-checked','false')});
    imgs.forEach(function(im){im.classList.remove('on')});
    if(cur&&find(cur))select(cur,true);
    lastFocus=document.activeElement;
    void picker.offsetWidth;                       /* تا انیمیشن ورود از حالت بسته شروع شود */
    picker.classList.add('open');picker.setAttribute('aria-hidden','false');
    setTimeout(function(){
      var t=picker.querySelector('.av-item.sel')||items[0];
      try{t.focus({preventScroll:true})}catch(e){}
    },120);
  }
  function closePicker(){
    if(!picker||!picker.classList.contains('open'))return;
    picker.classList.remove('open');picker.setAttribute('aria-hidden','true');
    if(lastFocus&&lastFocus.focus&&document.contains(lastFocus))try{lastFocus.focus({preventScroll:true})}catch(e){}
  }
  function confirm(){
    if(!selected)return;
    save(selected);apply(selected);closePicker();
    setTimeout(popDot,260);
  }

  /* ---------- کلیک روی پروفایل سایدبار = تغییر پروفایل ---------- */
  dot.setAttribute('role','button');dot.setAttribute('tabindex','0');
  dot.setAttribute('aria-label','تغییر پروفایل');dot.setAttribute('title','تغییر پروفایل');
  dot.addEventListener('click',function(){openPicker(false)});
  dot.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();openPicker(false)}});

  /* ---------- پیگیری ورود/خروج (فقط با خواندن وضعیت نمایش صفحه) ---------- */
  function sync(){
    var visible=!appEl.classList.contains('hidden');
    if(visible&&!shown){
      shown=true;
      var id=load();
      if(find(id)){apply(id)}
      else{apply(null);setTimeout(function(){if(shown&&!find(load()))openPicker(true)},650)}
    }else if(!visible&&shown){
      shown=false;closePicker();apply(null);
    }
  }
  new MutationObserver(sync).observe(appEl,{attributes:true,attributeFilter:['class']});
  sync();

  /* پیش‌بارگذاری تا تعویض تصویرها در پیش‌نمایش بدون پرش باشد */
  AVATARS.forEach(function(a){var im=new Image();im.src=a.src});
})();
