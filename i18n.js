/* Unknown AI - localization (fa / en).
   One dictionary, one t() function. Static markup uses data-i18n* attributes; scripts call I18N.t(key).
   Language is persisted in localStorage (and synced to profiles.language after login by account.js).
   User-generated chat text and AI answers are never translated. */
(function () {
  'use strict';

  var DICT = {
    fa: {
      'meta.title': 'Unknown AI',
      'lang.switchTo': 'English',
      'lang.switchAria': 'تغییر زبان به انگلیسی',
      'logo.alt': 'لوگوی سایت',

      'auth.sub.email': 'ایمیل و شماره تلفن خود را وارد کنید تا کد ورود برایتان ارسال شود.',
      'auth.sub.otp': 'کد ۶ رقمی ارسال‌شده به ایمیل را وارد کنید.',
      'auth.email.placeholder': 'you@example.com',
      'auth.phone.label': 'شماره تلفن',
      'auth.phone.placeholder': '9123456789',
      'auth.phone.country': 'کد کشور',
      'auth.phone.optional': 'اختیاری (قبلاً ذخیره شده)',
      'auth.phone.note': 'ایمیل فقط برای ارسال کد ورود استفاده می‌شود. شماره تلفن فعلاً تأیید نمی‌شود و فقط ذخیره می‌گردد.',
      'auth.sendOtp': 'دریافت کد',
      'auth.verify': 'تأیید و ورود',
      'auth.changeEmail': 'تغییر ایمیل',
      'auth.err.emailEmpty': 'ایمیل را وارد کنید.',
      'auth.err.emailInvalid': 'ایمیل واردشده معتبر نیست.',
      'auth.err.phoneEmpty': 'شماره تلفن را وارد کنید.',
      'auth.err.phoneInvalid': 'شماره تلفن معتبر نیست. شماره را بدون صفر ابتدایی و با کد کشور درست وارد کنید.',
      'auth.err.code6': 'کد باید ۶ رقمی باشد.',
      'auth.err.codeInvalid': 'کد واردشده نادرست است یا منقضی شده است.',
      'auth.err.rate': 'تعداد تلاش‌ها زیاد است؛ کمی صبر کنید و دوباره تلاش کنید.',
      'auth.err.network': 'ارتباط با سرور برقرار نشد. اینترنت خود را بررسی کنید.',
      'auth.err.generic': 'مشکلی پیش آمد. دوباره تلاش کنید.',
      'auth.sending': 'در حال ارسال کد…',
      'auth.sent': 'کد ارسال شد. پوشه Spam را هم بررسی کنید.',
      'auth.wait': 'برای دریافت دوباره‌ی کد {n} ثانیه صبر کنید.',
      'auth.uni.title': 'ورود مخصوص دانشگاه آزاد شهرستان بیجار',
      'auth.uni.sub': 'ورود به نسخه اختصاصی دانشگاه',
      'auth.uni.heading': 'نسخه مخصوص دانشگاه آزاد شهرستان بیجار',
      'auth.uni.desc': 'این چت‌بات مخصوص دانشجویان کامپیوتر است',
      'common.close': 'بستن',

      'chat.welcome.title': 'چه چیزی در ذهنت است؟',
      'chat.welcome.sub': 'گفتگو را شروع کن.',
      'chat.new': '＋ گفتگوی جدید',
      'chat.defaultTitle': 'گفتگوی جدید',
      'chat.search.placeholder': 'جست‌وجو در گفتگوها',
      'chat.search.clear': 'پاک کردن عبارت جست‌وجو',
      'chat.search.loading': 'در حال جست‌وجو…',
      'chat.search.error': 'جست‌وجو در متن پیام‌ها انجام نشد؛ فقط عنوان‌ها بررسی شد.',
      'chat.search.count': '{n} نتیجه',
      'chat.search.none': 'نتیجه‌ای برای «{q}» پیدا نشد.',
      'chat.input.placeholder': 'چیزی بپرس...',
      'chat.input.aria': 'پیام شما',
      'chat.send': 'ارسال',
      'chat.thinking': 'در حال فکر کردن',
      'chat.you': 'شما',
      'chat.hint': 'ممکن است اشتباه کند. اطلاعات مهم را بررسی کنید.',
      'chat.err.ai': 'خطا در دریافت پاسخ. تنظیمات اتصال را بررسی کنید.',
      'chat.err.save': 'ذخیره‌ی پیام انجام نشد؛ ممکن است در تاریخچه دیده نشود.',
      'chat.err.timeout': 'پاسخ دیر رسید. دوباره تلاش کنید.',
      'chat.attach': 'ارسال عکس (بزودی)',
      'chat.history.open': 'باز کردن تاریخچه',
      'chat.history.close': 'بستن تاریخچه',
      'chat.history.collapse': 'جمع کردن تاریخچه',
      'chat.clearAll': 'پاک کردن همه تاریخچه',
      'chat.logout': 'خروج',

      'theme.toDark': 'تغییر به تم تاریک',
      'theme.toLight': 'تغییر به تم روشن',
      'theme.dark': 'تم تاریک',
      'theme.light': 'تم روشن',

      'usage.label': 'مصرف امروز',
      'usage.daily': 'سهمیه‌ی روزانه',
      'usage.tokens': 'توکن',
      'usage.messages': 'پیام',
      'usage.unit': 'توکن',
      'usage.exhausted': 'سهمیه‌ی امروز تمام شد',
      'usage.left': '{tok} توکن · {msg} پیام مانده',
      'usage.leftLong': 'باقی‌مانده: {tok} توکن · {msg} پیام',
      'usage.title': 'مصرف امروز: {used} از {max} توکن',
      'usage.banner': 'سهمیه‌ی امروز شما تمام شده است. برای شارژ حساب، مستقیم به پشتیبانی پیام بدهید.',
      'usage.toSupport': 'پیام به پشتیبانی',
      'usage.supportText': 'سلام، سهمیه‌ی امروزم تمام شده و می‌خواهم حسابم را شارژ کنم.',
      'usage.noData': 'اطلاعات مصرف هنوز دریافت نشده است.',
      'usage.ok': 'باشه',
      'usage.resets': 'سهمیه هر شب نیمه‌شب (به وقت تهران) دوباره شارژ می‌شود.',
      'usage.note': 'تعداد توکن تقریبی است و از روی طول متن حساب می‌شود.',

      'support.title': 'ارتباط با پشتیبانی',
      'support.sub': 'سؤال یا مشکلی دارید؟ برای ما پیام بگذارید.',
      'support.start': 'شروع گفت‌وگو',
      'support.icon': 'ارتباط با ما',
      'support.checking': 'در حال بررسی اتصال…',
      'support.ready': 'پیام شما به تیم پشتیبانی ارسال می‌شود',
      'support.notReady': 'اتصال پشتیبانی تنظیم نشده',
      'support.notice': 'آدرس Webhook پشتیبانی (SUPPORT_ENDPOINT در config.js) هنوز تنظیم نشده است؛ تا آن زمان ارسال پیام غیرفعال است.',
      'support.placeholder': 'پیام خود را بنویسید…',
      'support.disabled': 'ارسال پیام غیرفعال است',
      'support.inputAria': 'پیام برای پشتیبانی',
      'support.sendAria': 'ارسال پیام',
      'support.sending': 'در حال ارسال…',
      'support.sent': 'ارسال شد',
      'support.failed': 'ارسال نشد',
      'support.retry': 'تلاش مجدد',
      'support.fail.timeout': 'زمان انتظار تمام شد',
      'support.fail.http': 'خطای سرور {n}',
      'support.fail.net': 'خطای شبکه یا CORS',
      'support.failStatus': 'پیام ارسال نشد. می‌توانید دوباره تلاش کنید.',
      'support.tooMany': 'تعداد پیام‌ها زیاد است؛ لطفاً یک دقیقه صبر کنید.',
      'support.hello': 'سلام! پیام خود را بنویسید تا برای تیم پشتیبانی ارسال شود.',
      'support.replyPrefix': '👤 پشتیبانی: ',

      'soon.title': 'ارسال عکس',
      'soon.badge': 'بزودی فعال می‌شود',
      'soon.desc': 'هنوز امکان ارسال عکس فعال نیست؛ این قابلیت در حال آماده‌سازی است و بزودی در دسترس خواهد بود.',
      'soon.ideaPre': 'ایده‌ای برای بهتر شدن این بخش دارید؟ با سازنده، ',
      'soon.ideaPost': '، همکاری کنید و ایده‌تان را در تلگرام بفرستید:',
      'soon.ok': 'باشه',

      'avatar.change': 'تغییر پروفایل',
      'avatar.title': 'پروفایلت را انتخاب کن',
      'avatar.sub': 'یکی از این تصویرها نمایهٔ تو خواهد بود.<br>هر وقت خواستی از پایین سایدبار می‌توانی عوضش کنی.',
      'avatar.continue': 'ادامه',
      'avatar.save': 'ذخیره',
      'avatar.a1': 'جنگجوی آبی',
      'avatar.a2': 'عینک نارنجی',
      'avatar.a3': 'همستر هکر',
      'avatar.a4': 'کابوی',
      'avatar.a5': 'فضایی',
      'avatar.a6': 'نقاب‌دار',

      'profile.title': 'تکمیل اطلاعات حساب',
      'profile.desc': 'برای ادامه، شماره تلفن خود را وارد کنید. این شماره فقط ذخیره می‌شود و هنوز تأیید نمی‌شود.',
      'profile.save': 'ذخیره',
      'profile.later': 'بعداً',
      'profile.saving': 'در حال ذخیره…',
      'profile.saved': 'شماره تلفن ذخیره شد.',
      'profile.err': 'ذخیره‌ی شماره انجام نشد. دوباره تلاش کنید.'
    },

    en: {
      'meta.title': 'Unknown AI',
      'lang.switchTo': 'فارسی',
      'lang.switchAria': 'Switch language to Persian',
      'logo.alt': 'Site logo',

      'auth.sub.email': 'Enter your email and phone number and we will send you a sign-in code.',
      'auth.sub.otp': 'Enter the 6-digit code sent to your email.',
      'auth.email.placeholder': 'you@example.com',
      'auth.phone.label': 'Phone number',
      'auth.phone.placeholder': '9123456789',
      'auth.phone.country': 'Country code',
      'auth.phone.optional': 'Optional (already saved)',
      'auth.phone.note': 'Your email is used only to send sign-in codes. Your phone number is stored but not verified yet.',
      'auth.sendOtp': 'Get code',
      'auth.verify': 'Verify and sign in',
      'auth.changeEmail': 'Change email',
      'auth.err.emailEmpty': 'Enter your email.',
      'auth.err.emailInvalid': 'That email address is not valid.',
      'auth.err.phoneEmpty': 'Enter your phone number.',
      'auth.err.phoneInvalid': 'That phone number is not valid. Enter it without a leading zero and pick the right country code.',
      'auth.err.code6': 'The code must be 6 digits.',
      'auth.err.codeInvalid': 'The code is wrong or has expired.',
      'auth.err.rate': 'Too many attempts. Please wait a moment and try again.',
      'auth.err.network': 'Could not reach the server. Check your internet connection.',
      'auth.err.generic': 'Something went wrong. Please try again.',
      'auth.sending': 'Sending code…',
      'auth.sent': 'Code sent. Check your spam folder too.',
      'auth.wait': 'Wait {n} seconds before requesting another code.',
      'auth.uni.title': 'Sign in for Islamic Azad University, Bijar',
      'auth.uni.sub': 'Enter the university edition',
      'auth.uni.heading': 'Islamic Azad University, Bijar edition',
      'auth.uni.desc': 'This chatbot is for computer science students',
      'common.close': 'Close',

      'chat.welcome.title': "What's on your mind?",
      'chat.welcome.sub': 'Start a conversation.',
      'chat.new': '＋ New chat',
      'chat.defaultTitle': 'New chat',
      'chat.search.placeholder': 'Search chats',
      'chat.search.clear': 'Clear search',
      'chat.search.loading': 'Searching…',
      'chat.search.error': 'Message search failed; only titles were checked.',
      'chat.search.count': '{n} results',
      'chat.search.none': 'No results for "{q}".',
      'chat.input.placeholder': 'Ask something...',
      'chat.input.aria': 'Your message',
      'chat.send': 'Send',
      'chat.thinking': 'Thinking',
      'chat.you': 'You',
      'chat.hint': 'It can make mistakes. Check important information.',
      'chat.err.ai': 'Could not get a reply. Check the connection settings.',
      'chat.err.save': 'The message could not be saved and may not appear in your history.',
      'chat.err.timeout': 'The reply took too long. Please try again.',
      'chat.attach': 'Send a photo (coming soon)',
      'chat.history.open': 'Open history',
      'chat.history.close': 'Close history',
      'chat.history.collapse': 'Collapse history',
      'chat.clearAll': 'Clear all history',
      'chat.logout': 'Sign out',

      'theme.toDark': 'Switch to dark theme',
      'theme.toLight': 'Switch to light theme',
      'theme.dark': 'Dark theme',
      'theme.light': 'Light theme',

      'usage.label': "Today's usage",
      'usage.daily': 'Daily allowance',
      'usage.tokens': 'Tokens',
      'usage.messages': 'Messages',
      'usage.unit': 'tokens',
      'usage.exhausted': "Today's allowance is used up",
      'usage.left': '{tok} tokens · {msg} messages left',
      'usage.leftLong': 'Remaining: {tok} tokens · {msg} messages',
      'usage.title': "Today's usage: {used} of {max} tokens",
      'usage.banner': "Your allowance for today is used up. To top up your account, message support directly.",
      'usage.toSupport': 'Message support',
      'usage.supportText': "Hi, my allowance for today is used up and I'd like to top up my account.",
      'usage.noData': 'Usage data has not loaded yet.',
      'usage.ok': 'OK',
      'usage.resets': 'The allowance resets every night at midnight (Tehran time).',
      'usage.note': 'Token counts are approximate and estimated from text length.',

      'support.title': 'Contact support',
      'support.sub': 'Have a question or problem? Leave us a message.',
      'support.start': 'Start chat',
      'support.icon': 'Contact us',
      'support.checking': 'Checking connection…',
      'support.ready': 'Your message will be sent to the support team',
      'support.notReady': 'Support connection is not configured',
      'support.notice': 'The support webhook address (SUPPORT_ENDPOINT in config.js) is not configured yet; sending is disabled until then.',
      'support.placeholder': 'Write your message…',
      'support.disabled': 'Sending is disabled',
      'support.inputAria': 'Message to support',
      'support.sendAria': 'Send message',
      'support.sending': 'Sending…',
      'support.sent': 'Sent',
      'support.failed': 'Not sent',
      'support.retry': 'Retry',
      'support.fail.timeout': 'timed out',
      'support.fail.http': 'server error {n}',
      'support.fail.net': 'network or CORS error',
      'support.failStatus': 'The message was not sent. You can try again.',
      'support.tooMany': 'Too many messages; please wait a minute.',
      'support.hello': 'Hi! Write your message and it will be sent to the support team.',
      'support.replyPrefix': '👤 Support: ',

      'soon.title': 'Send a photo',
      'soon.badge': 'Coming soon',
      'soon.desc': 'Sending photos is not available yet. This feature is being prepared and will be available soon.',
      'soon.ideaPre': 'Have an idea to improve this? Collaborate with the creator, ',
      'soon.ideaPost': ', and send your idea on Telegram:',
      'soon.ok': 'OK',

      'avatar.change': 'Change profile picture',
      'avatar.title': 'Choose your profile picture',
      'avatar.sub': 'One of these images will be your avatar.<br>You can change it any time from the bottom of the sidebar.',
      'avatar.continue': 'Continue',
      'avatar.save': 'Save',
      'avatar.a1': 'Blue warrior',
      'avatar.a2': 'Orange glasses',
      'avatar.a3': 'Hacker hamster',
      'avatar.a4': 'Cowboy',
      'avatar.a5': 'Astronaut',
      'avatar.a6': 'Masked',

      'profile.title': 'Complete your account',
      'profile.desc': 'To continue, enter your phone number. It is only stored and is not verified yet.',
      'profile.save': 'Save',
      'profile.later': 'Later',
      'profile.saving': 'Saving…',
      'profile.saved': 'Phone number saved.',
      'profile.err': 'Could not save the phone number. Please try again.'
    }
  };

  var LANGS = { fa: { dir: 'rtl', locale: 'fa-IR' }, en: { dir: 'ltr', locale: 'en-US' } };
  var KEY = 'lang';
  var mem = null;

  function readStored() {
    try { var v = localStorage.getItem(KEY); if (v === 'fa' || v === 'en') return v; } catch (e) {}
    return mem;
  }
  function writeStored(l) {
    mem = l;
    try { localStorage.setItem(KEY, l); } catch (e) {}
  }

  var lang = readStored() || 'fa';

  function t(key, params) {
    var s = (DICT[lang] && DICT[lang][key]);
    if (s === undefined) s = DICT.fa[key];          /* missing translation -> Persian source */
    if (s === undefined) s = key;                   /* unknown key -> key itself, never throws */
    if (params) s = s.replace(/\{(\w+)\}/g, function (m, k) { return params[k] !== undefined ? params[k] : m; });
    return s;
  }

  /* number formatting in the active language (Persian digits for fa) */
  function num(n) {
    try { return Number(n || 0).toLocaleString(LANGS[lang].locale); } catch (e) { return String(n || 0); }
  }

  function apply(root) {
    root = root || document;
    var q = function (attr, fn) {
      var list = root.querySelectorAll('[' + attr + ']');
      for (var i = 0; i < list.length; i++) fn(list[i], list[i].getAttribute(attr));
      if (root.nodeType === 1 && root.hasAttribute && root.hasAttribute(attr)) fn(root, root.getAttribute(attr));
    };
    q('data-i18n', function (el, k) { el.textContent = t(k); });
    q('data-i18n-html', function (el, k) { el.innerHTML = t(k); });   /* trusted dictionary strings only */
    q('data-i18n-placeholder', function (el, k) { el.setAttribute('placeholder', t(k)); });
    q('data-i18n-aria', function (el, k) { el.setAttribute('aria-label', t(k)); });
    q('data-i18n-title', function (el, k) { el.setAttribute('title', t(k)); });
    q('data-i18n-alt', function (el, k) { el.setAttribute('alt', t(k)); });
  }

  function paintShell() {
    var de = document.documentElement;
    de.setAttribute('lang', lang);
    de.setAttribute('dir', LANGS[lang].dir);
    document.title = t('meta.title');
    var b = document.getElementById('langToggle');
    if (b) {
      var lb = b.querySelector('.langlabel');
      if (lb) lb.textContent = t('lang.switchTo');
      b.setAttribute('aria-label', t('lang.switchAria'));
      b.setAttribute('title', t('lang.switchAria'));
    }
  }

  function setLang(l, opts) {
    if (!LANGS[l]) return;
    var changed = l !== lang;
    lang = l;
    if (!(opts && opts.noPersist)) writeStored(l);
    paintShell();
    apply(document);
    if (changed || (opts && opts.force)) {
      try { document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: l } })); } catch (e) {}
    }
  }

  window.I18N = {
    t: t, num: num, apply: apply, setLang: setLang,
    get lang() { return lang; },
    get dir() { return LANGS[lang].dir; },
    get locale() { return LANGS[lang].locale; },
    hasStored: function () { return !!readStored(); },
    dict: DICT
  };

  /* initial paint (document.documentElement exists already; body may not) */
  paintShell();
  function boot() {
    apply(document);
    paintShell();
    var b = document.getElementById('langToggle');
    if (b) b.addEventListener('click', function () { setLang(lang === 'fa' ? 'en' : 'fa'); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
