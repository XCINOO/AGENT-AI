/* Unknown AI — Memory settings + AI message feedback
   Uses real Worker APIs via apiUrl(). Requires valid Bearer session.
   Memory is manual only (backend increments counter; no auto-extractor UI claims).
*/
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var text = function (fa, en) {
    return (window.I18N && I18N.lang === 'en') ? en : fa;
  };

  /* currentChat در اسکریپت اصلی با let تعریف شده، پس روی window نیست؛ مستقیم خوانده می‌شود */
  function curChatId() { try { return currentChat || ''; } catch (e) { return ''; } }

  function getToken() {
    /* sb در اسکریپت اصلی با const ساخته شده و روی window نیست؛ از قلمرو سراسری خوانده می‌شود */
    var client = null;
    try { client = sb; } catch (e) { return Promise.resolve(null); }
    return (client && client.auth && client.auth.getSession)
      ? client.auth.getSession().then(function (r) {
          return r && r.data && r.data.session && r.data.session.access_token;
        })
      : Promise.resolve(null);
  }

  function api(path, opts) {
    opts = opts || {};
    var url = (typeof apiUrl === 'function' && apiUrl(path)) || '';
    if (!url) return Promise.reject(new Error('API_BASE_URL not configured'));
    return getToken().then(function (token) {
      if (!token) return Promise.reject(new Error('no session'));
      var headers = Object.assign({
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      }, opts.headers || {});
      return fetch(url, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      });
    });
  }

  /* ---------- Memory panel ---------- */
  var memLoaded = false;
  var MEM_LIMIT = 600;

  function setMemStatus(msg, isErr) {
    var el = $('memoryStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = isErr ? 'var(--err)' : 'var(--text-2)';
  }

  function updateCount() {
    var ta = $('memoryText');
    var c = $('memoryCount');
    if (!ta || !c) return;
    var n = (ta.value || '').length;
    c.textContent = n + ' / ' + MEM_LIMIT;
    if (n > MEM_LIMIT) c.style.color = 'var(--err)';
    else c.style.color = '';
  }

  function paintMemory(data) {
    var ta = $('memoryText');
    var en = $('memoryEnabled');
    var up = $('memoryUpdated');
    if (ta) ta.value = (data && data.memory) || '';
    if (en) en.checked = !(data && data.enabled === false);
    if (up) {
      if (data && data.updated_at) {
        try {
          up.textContent = text('آخرین به‌روزرسانی: ', 'Updated: ') +
            new Date(data.updated_at).toLocaleString(I18N && I18N.lang === 'en' ? 'en' : 'fa-IR');
        } catch (e) { up.textContent = ''; }
      } else up.textContent = '';
    }
    updateCount();
  }

  function loadMemory() {
    setMemStatus(text('در حال بارگذاری…', 'Loading…'));
    return api('/api/memory').then(function (r) {
      if (!r.ok) {
        setMemStatus(text('دریافت حافظه ناموفق بود.', 'Could not load memory.'), true);
        return;
      }
      paintMemory(r.data);
      setMemStatus('');
      memLoaded = true;
    }).catch(function () {
      setMemStatus(text('اتصال برقرار نشد. API را بررسی کنید.', 'Connection failed. Check API config.'), true);
    });
  }

  function saveMemory() {
    var ta = $('memoryText');
    if (!ta) return;
    var val = ta.value || '';
    if (val.length > MEM_LIMIT) {
      setMemStatus(text('حداکثر ۶۰۰ کاراکتر مجاز است.', 'Maximum 600 characters.'), true);
      return;
    }
    var btn = $('memorySave');
    if (btn) btn.disabled = true;
    setMemStatus(text('در حال ذخیره…', 'Saving…'));
    api('/api/memory', { method: 'PUT', body: { memory: val } }).then(function (r) {
      if (btn) btn.disabled = false;
      if (!r.ok) {
        setMemStatus(text('ذخیره انجام نشد.', 'Save failed.'), true);
        return;
      }
      paintMemory(r.data);
      setMemStatus(text('ذخیره شد.', 'Saved.'));
    }).catch(function () {
      if (btn) btn.disabled = false;
      setMemStatus(text('خطای شبکه.', 'Network error.'), true);
    });
  }

  function clearMemory() {
    if (!confirm(text('حافظه پاک شود؟ این عمل قابل بازگشت نیست.', 'Clear memory? This cannot be undone.'))) return;
    var btn = $('memoryClear');
    if (btn) btn.disabled = true;
    setMemStatus(text('در حال پاک کردن…', 'Clearing…'));
    api('/api/memory', { method: 'DELETE' }).then(function (r) {
      if (btn) btn.disabled = false;
      if (!r.ok) {
        setMemStatus(text('پاک کردن ناموفق بود.', 'Clear failed.'), true);
        return;
      }
      paintMemory(r.data || { memory: '', enabled: true });
      setMemStatus(text('حافظه پاک شد.', 'Memory cleared.'));
    }).catch(function () {
      if (btn) btn.disabled = false;
      setMemStatus(text('خطای شبکه.', 'Network error.'), true);
    });
  }

  function setEnabled(on) {
    setMemStatus(text('در حال به‌روزرسانی…', 'Updating…'));
    api('/api/memory/enabled', { method: 'POST', body: { enabled: !!on } }).then(function (r) {
      if (!r.ok) {
        setMemStatus(text('تغییر وضعیت ناموفق بود.', 'Could not update status.'), true);
        var en = $('memoryEnabled');
        if (en) en.checked = !on;
        return;
      }
      if (r.data) paintMemory(Object.assign({}, r.data, { enabled: on }));
      setMemStatus(on ? text('حافظه فعال شد.', 'Memory enabled.') : text('حافظه غیرفعال شد.', 'Memory disabled.'));
    }).catch(function () {
      setMemStatus(text('خطای شبکه.', 'Network error.'), true);
      var en = $('memoryEnabled');
      if (en) en.checked = !on;
    });
  }

  function wireMemory() {
    var ta = $('memoryText');
    if (ta) ta.addEventListener('input', updateCount);
    var save = $('memorySave');
    if (save) save.addEventListener('click', saveMemory);
    var clr = $('memoryClear');
    if (clr) clr.addEventListener('click', clearMemory);
    var en = $('memoryEnabled');
    if (en) en.addEventListener('change', function () { setEnabled(en.checked); });

    // Load when Memory tab is opened
    document.querySelectorAll('.settings-tab[data-tab="memory"]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        if (!memLoaded) loadMemory();
      });
    });
  }

  /* ---------- Feedback on AI messages ---------- */
  var SVG_UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11v9a1 1 0 0 0 1 1h8a2 2 0 0 0 2-1.8l1-8A2 2 0 0 0 17 9h-4.3l.8-3.4A2 2 0 0 0 11.6 3L7 11zM4 11v10"/></svg>';
  var SVG_DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 13V4a1 1 0 0 0-1-1H8a2 2 0 0 0-2 1.8l-1 8A2 2 0 0 0 7 15h4.3l-.8 3.4A2 2 0 0 0 12.4 21L17 13zM20 13V3"/></svg>';
  var SVG_COPY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';

  function submitFeedback(chatId, messageId, rating, comment, statusEl, upBtn, downBtn) {
    if (!chatId || !messageId) {
      if (statusEl) statusEl.textContent = text('شناسه پیام در دسترس نیست.', 'Message id unavailable.');
      return;
    }
    if (statusEl) statusEl.textContent = text('در حال ارسال…', 'Submitting…');
    api('/api/feedback', {
      method: 'POST',
      body: { chat_id: chatId, message_id: messageId, rating: rating, comment: comment || null }
    }).then(function (r) {
      if (!r.ok) {
        if (statusEl) statusEl.textContent = text('ثبت بازخورد ناموفق بود.', 'Feedback failed.');
        return;
      }
      if (upBtn) {
        upBtn.classList.toggle('active-up', rating === 'up');
        upBtn.disabled = true;
      }
      if (downBtn) {
        downBtn.classList.toggle('active-down', rating === 'down');
        downBtn.disabled = true;
      }
      if (statusEl) statusEl.textContent = text('متشکریم از بازخورد شما.', 'Thanks for your feedback.');
    }).catch(function () {
      if (statusEl) statusEl.textContent = text('خطای شبکه.', 'Network error.');
    });
  }

  function attachActions(msgEl, messageId, chatId) {
    if (!msgEl || msgEl.querySelector('.msg-actions')) return;
    var bubble = msgEl.querySelector('.bubble');
    if (!bubble) return;

    var actions = document.createElement('div');
    actions.className = 'msg-actions';
    actions.setAttribute('role', 'group');
    actions.setAttribute('aria-label', text('اقدامات پاسخ', 'Response actions'));

    var copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'msg-act';
    copyBtn.title = text('کپی', 'Copy');
    copyBtn.setAttribute('aria-label', text('کپی پاسخ', 'Copy response'));
    copyBtn.innerHTML = SVG_COPY;
    copyBtn.onclick = function () {
      var t = bubble.innerText || bubble.textContent || '';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(function () {
          copyBtn.classList.add('active-up');
          setTimeout(function () { copyBtn.classList.remove('active-up'); }, 1200);
        }).catch(function () {});
      }
    };

    var upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'msg-act';
    upBtn.title = text('مفید', 'Helpful');
    upBtn.setAttribute('aria-label', text('بازخورد مثبت', 'Positive feedback'));
    upBtn.innerHTML = SVG_UP;

    var downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'msg-act';
    downBtn.title = text('نامفید', 'Not helpful');
    downBtn.setAttribute('aria-label', text('بازخورد منفی', 'Negative feedback'));
    downBtn.innerHTML = SVG_DOWN;

    var commentWrap = document.createElement('div');
    commentWrap.className = 'fb-comment';
    commentWrap.innerHTML =
      '<textarea maxlength="500" placeholder="' + text('توضیح اختیاری…', 'Optional comment…') + '" dir="auto"></textarea>' +
      '<div class="fb-row">' +
      '<button type="button" class="fb-cancel">' + text('انصراف', 'Cancel') + '</button>' +
      '<button type="button" class="fb-submit">' + text('ارسال', 'Submit') + '</button></div>' +
      '<div class="fb-status" role="status"></div>';

    var pendingRating = null;
    var statusEl = commentWrap.querySelector('.fb-status');
    var ta = commentWrap.querySelector('textarea');

    function openComment(rating) {
      pendingRating = rating;
      commentWrap.classList.add('open');
      actions.classList.add('is-visible');
      if (ta) ta.focus();
    }

    upBtn.onclick = function () {
      if (!messageId) {
        // Soft feedback without server when id missing
        upBtn.classList.add('active-up');
        downBtn.disabled = true;
        upBtn.disabled = true;
        return;
      }
      openComment('up');
    };
    downBtn.onclick = function () {
      if (!messageId) {
        downBtn.classList.add('active-down');
        upBtn.disabled = true;
        downBtn.disabled = true;
        return;
      }
      openComment('down');
    };

    commentWrap.querySelector('.fb-cancel').onclick = function () {
      commentWrap.classList.remove('open');
      pendingRating = null;
      if (ta) ta.value = '';
      statusEl.textContent = '';
    };
    commentWrap.querySelector('.fb-submit').onclick = function () {
      if (!pendingRating) return;
      submitFeedback(chatId, messageId, pendingRating, (ta && ta.value) || '', statusEl, upBtn, downBtn);
      commentWrap.classList.remove('open');
    };

    actions.appendChild(copyBtn);
    if (messageId) {
      actions.appendChild(upBtn);
      actions.appendChild(downBtn);
    }
    bubble.appendChild(actions);
    bubble.appendChild(commentWrap);
  }

  /* Patch message rendering */
  function patchAdd() {
    if (typeof window.add !== 'function') return;
    var original = window.add;
    // add is function-scoped in index.html, not on window — intercept via MutationObserver instead
  }

  // Observe new AI messages
  function observeMessages() {
    var box = $('messages');
    if (!box || box.__fbObserved) return;
    box.__fbObserved = true;
    var obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          if (node.classList && node.classList.contains('msg') && node.classList.contains('ai')) {
            var mid = node.getAttribute('data-message-id') || '';
            var cid = node.getAttribute('data-chat-id') || curChatId();
            // skip pure typing indicator
            if (node.id === 'typing' || node.querySelector('.typing-bubble')) return;
            attachActions(node, mid, cid);
          }
        });
      });
    });
    obs.observe(box, { childList: true });
  }

  /* Expose helpers so index.html send/openChat can set message ids */
  window.__UA = window.__UA || {};
  window.__UA.attachActions = attachActions;
  window.__UA.setMessageMeta = function (el, messageId, chatId) {
    if (!el) return;
    if (messageId) el.setAttribute('data-message-id', messageId);
    if (chatId) el.setAttribute('data-chat-id', chatId);
    attachActions(el, messageId || '', chatId || '');
  };

  function boot() {
    wireMemory();
    observeMessages();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
