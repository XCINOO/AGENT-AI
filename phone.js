/* Unknown AI - phone number helpers (format validation + E.164 normalization).
   This only checks FORMAT. It does not prove the number exists or belongs to the user:
   ownership needs an SMS provider (see README). Loadable in browsers (window.PHONE) and Node (module.exports). */
(function (root) {
  'use strict';

  /* d = dial code, len = allowed national-number length range (when the country format is fixed), re = extra pattern */
  var COUNTRIES = [
    { c: 'IR', d: '98', fa: 'ایران', en: 'Iran', len: [10, 10], re: /^9\d{9}$/ },
    { c: 'FR', d: '33', fa: 'فرانسه', en: 'France', len: [9, 9] },
    { c: 'US', d: '1', fa: 'ایالات متحده', en: 'United States', len: [10, 10] },
    { c: 'CA', d: '1', fa: 'کانادا', en: 'Canada', len: [10, 10] },
    { c: 'GB', d: '44', fa: 'بریتانیا', en: 'United Kingdom', len: [9, 10] },
    { c: 'DE', d: '49', fa: 'آلمان', en: 'Germany' },
    { c: 'TR', d: '90', fa: 'ترکیه', en: 'Turkey', len: [10, 10] },
    { c: 'AE', d: '971', fa: 'امارات', en: 'United Arab Emirates' },
    { c: 'IQ', d: '964', fa: 'عراق', en: 'Iraq' },
    { c: 'AF', d: '93', fa: 'افغانستان', en: 'Afghanistan', len: [9, 9] },
    { c: 'AZ', d: '994', fa: 'آذربایجان', en: 'Azerbaijan' },
    { c: 'AM', d: '374', fa: 'ارمنستان', en: 'Armenia' },
    { c: 'PK', d: '92', fa: 'پاکستان', en: 'Pakistan' },
    { c: 'IN', d: '91', fa: 'هند', en: 'India', len: [10, 10] },
    { c: 'CN', d: '86', fa: 'چین', en: 'China' },
    { c: 'RU', d: '7', fa: 'روسیه', en: 'Russia', len: [10, 10] },
    { c: 'SA', d: '966', fa: 'عربستان', en: 'Saudi Arabia' },
    { c: 'QA', d: '974', fa: 'قطر', en: 'Qatar' },
    { c: 'KW', d: '965', fa: 'کویت', en: 'Kuwait' },
    { c: 'OM', d: '968', fa: 'عمان', en: 'Oman' },
    { c: 'IT', d: '39', fa: 'ایتالیا', en: 'Italy' },
    { c: 'ES', d: '34', fa: 'اسپانیا', en: 'Spain', len: [9, 9] },
    { c: 'NL', d: '31', fa: 'هلند', en: 'Netherlands', len: [9, 9] },
    { c: 'SE', d: '46', fa: 'سوئد', en: 'Sweden' },
    { c: 'CH', d: '41', fa: 'سوئیس', en: 'Switzerland', len: [9, 9] },
    { c: 'AU', d: '61', fa: 'استرالیا', en: 'Australia', len: [9, 9] },
    { c: 'JP', d: '81', fa: 'ژاپن', en: 'Japan' },
    { c: 'EG', d: '20', fa: 'مصر', en: 'Egypt' }
  ];

  var AR = '٠١٢٣٤٥٦٧٨٩', FA = '۰۱۲۳۴۵۶۷۸۹';
  function asciiDigits(s) {
    return String(s == null ? '' : s).replace(/[٠-٩۰-۹]/g, function (ch) {
      var i = AR.indexOf(ch); if (i < 0) i = FA.indexOf(ch); return String(i);
    });
  }

  function find(code) {
    for (var i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i].c === code) return COUNTRIES[i];
    return null;
  }

  /* normalize(countryCode, rawInput) -> { ok:true, e164 } | { ok:false, reason }
     - input starting with + or 00 is treated as a complete international number (country selector ignored)
     - otherwise one leading trunk "0" is dropped and the selected dial code is prepended */
  function normalize(countryCode, raw) {
    var s = asciiDigits(raw).replace(/[\s\-().‌‏‎]/g, '');
    if (!s) return { ok: false, reason: 'empty' };
    if (/[^\d+]/.test(s) || s.indexOf('+', 1) > -1) return { ok: false, reason: 'format' };

    var e164;
    if (s.charAt(0) === '+' || s.slice(0, 2) === '00') {
      e164 = '+' + s.replace(/^\+|^00/, '');
    } else {
      var cn = find(countryCode);
      if (!cn) return { ok: false, reason: 'country' };
      var national = s.replace(/^0/, '');
      if (cn.len && (national.length < cn.len[0] || national.length > cn.len[1])) return { ok: false, reason: 'length' };
      if (cn.re && !cn.re.test(national)) return { ok: false, reason: 'format' };
      e164 = '+' + cn.d + national;
    }
    if (!/^\+[1-9]\d{6,14}$/.test(e164)) return { ok: false, reason: 'length' };
    return { ok: true, e164: e164 };
  }

  function isEmail(v) {
    v = String(v || '').trim();
    return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  }

  var api = { COUNTRIES: COUNTRIES, normalize: normalize, isEmail: isEmail, asciiDigits: asciiDigits };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PHONE = api;
})(typeof window !== 'undefined' ? window : this);
