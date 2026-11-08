/* Unknown AI — Projects (sidebar section under "New chat").
   Data lives in the user's own rows: public.projects + chats.project_id (see backend/migrations).
   Row-level security keeps every user isolated; nothing here is stored only in the browser
   except the expanded/collapsed state of the list. */
(function () {
  'use strict';
  if (typeof sb === 'undefined' || typeof I18N === 'undefined') return;
  var t = function (k, p) { return I18N.t(k, p); };
  var state = { projects: [], chats: {}, open: {}, expanded: true, ready: false, unavailable: false, activeProject: null };
  try { state.expanded = localStorage.getItem('ua_proj_expanded') !== '0'; state.open = JSON.parse(localStorage.getItem('ua_proj_open') || '{}') || {}; } catch (e) {}

  var root, listEl, headBtn, addBtn, banner;
  var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>';
  var CHEV = '<svg class="pj-chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6"/></svg>';

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function isMissing(err) { var m = String((err && (err.code + ' ' + err.message)) || ''); return /42P01|PGRST205|PGRST204|42703|projects|project_id/.test(m) && !/permission|42501/.test(m); }
  function fail(err) {
    console.error('projects', err);
    if (isMissing(err)) { state.unavailable = true; render(); return; }
    toast(t('proj.error'));
  }
  function toast(msg) {
    var n = el('div', 'pj-toast', msg); n.setAttribute('role', 'status');
    document.body.appendChild(n);
    setTimeout(function () { n.remove(); }, 3200);
  }
  function saveUi() { try { localStorage.setItem('ua_proj_expanded', state.expanded ? '1' : '0'); localStorage.setItem('ua_proj_open', JSON.stringify(state.open)); } catch (e) {} }

  /* ---------- data ---------- */
  function load() {
    if (!user) return Promise.resolve();
    return Promise.all([
      sb.from('projects').select('id,name,created_at').order('created_at', { ascending: false }),
      sb.from('chats').select('id,title,project_id').not('project_id', 'is', null).order('created_at', { ascending: false })
    ]).then(function (r) {
      var err = r[0].error || r[1].error;
      if (err) return fail(err);
      state.unavailable = false; state.ready = true;
      state.projects = r[0].data || [];
      state.chats = {};
      (r[1].data || []).forEach(function (c) { (state.chats[c.project_id] = state.chats[c.project_id] || []).push(c); });
      render(); refreshMainList();
    }, fail);
  }
  function assignedIds() { var s = {}; Object.keys(state.chats).forEach(function (k) { state.chats[k].forEach(function (c) { s[c.id] = 1; }); }); return s; }

  function createProject() {
    var name = (prompt(t('proj.namePrompt')) || '').trim().slice(0, 80);
    if (!name) return;
    sb.from('projects').insert({ user_id: user.id, name: name }).select('id,name,created_at').single().then(function (r) {
      if (r.error) return fail(r.error);
      state.projects.unshift(r.data); state.open[r.data.id] = true; state.expanded = true; saveUi(); render();
    }, fail);
  }
  function renameProject(p) {
    var name = (prompt(t('proj.namePrompt'), p.name) || '').trim().slice(0, 80);
    if (!name || name === p.name) return;
    sb.from('projects').update({ name: name, updated_at: new Date().toISOString() }).eq('id', p.id).then(function (r) {
      if (r.error) return fail(r.error);
      p.name = name; render();
    }, fail);
  }
  function deleteProject(p) {
    if (!confirm(t('proj.deleteConfirm'))) return;
    sb.from('projects').delete().eq('id', p.id).then(function (r) {
      if (r.error) return fail(r.error);
      if (state.activeProject === p.id) setActive(null);
      load().then(function () { if (typeof loadChats === 'function') loadChats(); });
    }, fail);
  }
  function moveChat(chatId, projectId) {
    return sb.from('chats').update({ project_id: projectId }).eq('id', chatId).then(function (r) {
      if (r.error) { fail(r.error); return false; }
      return load().then(function () { return true; });
    }, function (e) { fail(e); return false; });
  }

  /* ---------- active project for the next new chat ---------- */
  function setActive(pid) {
    state.activeProject = pid;
    if (!banner) return;
    var p = state.projects.filter(function (x) { return x.id === pid; })[0];
    banner.hidden = !p;
    if (p) banner.querySelector('span').textContent = t('proj.active', { name: p.name });
  }
  function startChatIn(p) {
    var nc = document.getElementById('newChat');
    if (nc) nc.click();
    setActive(p.id);
    var inp = document.getElementById('input'); if (inp) setTimeout(function () { try { inp.focus({ preventScroll: true }); } catch (e) {} }, 60);
  }
  /* Wrap the existing createChat: after the original insert succeeds, attach the chat to the active project. */
  if (typeof window.createChat === 'function' && typeof window.renderChats === 'function') {
    var origCreate = window.createChat;
    window.createChat = async function (title) {
      var pid = state.activeProject;
      var id = await origCreate.apply(this, arguments);
      if (pid && id) {
        var r = await sb.from('chats').update({ project_id: pid }).eq('id', id);
        if (r.error) { setActive(null); fail(r.error); } else { setActive(null); state.open[pid] = true; saveUi(); load(); }
      }
      return id;
    };
  }
  /* Chats that belong to a project are listed under it, not in the main history list. */
  if (typeof window.renderChats === 'function') {
    var origRender = window.renderChats;
    window.renderChats = function () {
      var all = window.__chatsCache, ids = assignedIds();
      if (Array.isArray(all)) window.__chatsCache = all.filter(function (c) { return !ids[c.id]; });
      try { return origRender.apply(this, arguments); } finally { window.__chatsCache = all; }
    };
  }
  function refreshMainList() { if (typeof window.renderChats === 'function') window.renderChats(); }

  /* ---------- picker: move unassigned chats into a project ---------- */
  function openPicker(p) {
    var ids = assignedIds();
    var free = (window.__chatsCache || []).filter(function (c) { return !ids[c.id]; });
    var back = el('div', 'pj-modal'); back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true');
    var panel = el('div', 'pj-panel');
    var h = el('h2', null, t('proj.pickTitle')); panel.appendChild(h);
    var sub = el('p', 'pj-sub', p.name); panel.appendChild(sub);
    var list = el('div', 'pj-picklist');
    if (!free.length) list.appendChild(el('p', 'pj-empty', t('proj.noUnassigned')));
    free.forEach(function (c) {
      var b = el('button', 'pj-pick', c.title || '—'); b.type = 'button';
      b.addEventListener('click', function () { b.disabled = true; moveChat(c.id, p.id).then(function (ok) { if (ok) { state.open[p.id] = true; saveUi(); close(); } else b.disabled = false; }); });
      list.appendChild(b);
    });
    panel.appendChild(list);
    var x = el('button', 'pj-close', t('common.close')); x.type = 'button'; x.addEventListener('click', close);
    panel.appendChild(x);
    back.appendChild(panel);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    function onKey(e) { if (e.key === 'Escape') close(); }
    function close() { document.removeEventListener('keydown', onKey); back.remove(); }
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
    var first = panel.querySelector('button'); if (first) first.focus();
  }

  /* ---------- small menu ---------- */
  var openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }
  document.addEventListener('click', function (e) { if (openMenu && !openMenu.contains(e.target)) closeMenu(); }, true);
  function showMenu(anchor, items) {
    closeMenu();
    var m = el('div', 'pj-menu'); m.setAttribute('role', 'menu');
    items.forEach(function (it) {
      var b = el('button', 'pj-menuitem' + (it.danger ? ' danger' : ''), it.label); b.type = 'button'; b.setAttribute('role', 'menuitem');
      b.addEventListener('click', function (e) { e.stopPropagation(); closeMenu(); it.run(); });
      m.appendChild(b);
    });
    anchor.parentNode.appendChild(m); openMenu = m;
    var f = m.querySelector('button'); if (f) f.focus();
  }

  /* ---------- render ---------- */
  function render() {
    if (!root) return;
    headBtn.setAttribute('aria-expanded', String(state.expanded));
    root.classList.toggle('collapsed', !state.expanded);
    headBtn.querySelector('.pj-label').textContent = t('proj.title');
    addBtn.setAttribute('aria-label', t('proj.new')); addBtn.title = t('proj.new');
    addBtn.hidden = state.unavailable;
    var frag = document.createDocumentFragment();
    if (state.unavailable) frag.appendChild(el('p', 'pj-empty', t('proj.setup')));
    else if (state.ready && !state.projects.length) frag.appendChild(el('p', 'pj-empty', t('proj.none')));
    state.projects.forEach(function (p) {
      var item = el('div', 'pj-item' + (state.open[p.id] ? ' open' : ''));
      var row = el('div', 'pj-row');
      var toggle = el('button', 'pj-name'); toggle.type = 'button';
      toggle.setAttribute('aria-expanded', String(!!state.open[p.id]));
      toggle.innerHTML = CHEV; toggle.appendChild(el('span', null, p.name));
      toggle.addEventListener('click', function () { state.open[p.id] = !state.open[p.id]; saveUi(); render(); });
      var more = el('button', 'pj-more', '⋯'); more.type = 'button'; more.setAttribute('aria-haspopup', 'menu'); more.setAttribute('aria-label', p.name);
      more.addEventListener('click', function (e) {
        e.stopPropagation();
        showMenu(more, [
          { label: t('proj.newChat'), run: function () { startChatIn(p); } },
          { label: t('proj.addChats'), run: function () { openPicker(p); } },
          { label: t('proj.rename'), run: function () { renameProject(p); } },
          { label: t('proj.delete'), danger: true, run: function () { deleteProject(p); } }
        ]);
      });
      row.appendChild(toggle); row.appendChild(more); item.appendChild(row);
      if (state.open[p.id]) {
        var sub = el('div', 'pj-chats');
        var nc = el('button', 'pj-newchat', '＋ ' + t('proj.newChat')); nc.type = 'button';
        nc.addEventListener('click', function () { startChatIn(p); });
        sub.appendChild(nc);
        var chats = state.chats[p.id] || [];
        if (!chats.length) sub.appendChild(el('p', 'pj-empty', t('proj.empty')));
        chats.forEach(function (c) {
          var cr = el('div', 'pj-chatrow');
          var cb = el('button', 'pj-chat' + (typeof currentChat !== 'undefined' && currentChat === c.id ? ' active' : ''), c.title || '—'); cb.type = 'button';
          cb.addEventListener('click', function () { setActive(null); if (typeof openChat === 'function') openChat(c.id); });
          var rm = el('button', 'pj-more', '×'); rm.type = 'button'; rm.title = t('proj.remove'); rm.setAttribute('aria-label', t('proj.remove'));
          rm.addEventListener('click', function () { moveChat(c.id, null).then(function () { if (typeof loadChats === 'function') loadChats(); }); });
          cr.appendChild(cb); cr.appendChild(rm); sub.appendChild(cr);
        });
        item.appendChild(sub);
      }
      frag.appendChild(item);
    });
    listEl.replaceChildren(frag);
  }

  function mount() {
    var nc = document.getElementById('newChat');
    if (!nc || root) return;
    root = el('section', 'pj'); root.setAttribute('aria-label', t('proj.title'));
    var head = el('div', 'pj-head');
    headBtn = el('button', 'pj-toggle'); headBtn.type = 'button';
    headBtn.innerHTML = ICON + '<span class="pj-label"></span>' + CHEV;
    headBtn.addEventListener('click', function () { state.expanded = !state.expanded; saveUi(); render(); });
    addBtn = el('button', 'pj-add', '＋'); addBtn.type = 'button';
    addBtn.addEventListener('click', createProject);
    head.appendChild(headBtn); head.appendChild(addBtn);
    listEl = el('div', 'pj-list');
    root.appendChild(head); root.appendChild(listEl);
    nc.insertAdjacentElement('afterend', root);
    banner = el('div', 'pj-banner'); banner.hidden = true;
    banner.appendChild(el('span'));
    var cancel = el('button', 'pj-more', '×'); cancel.type = 'button'; cancel.setAttribute('aria-label', t('common.close'));
    cancel.addEventListener('click', function () { setActive(null); });
    banner.appendChild(cancel);
    var cw = document.querySelector('.composerwrap'); if (cw) cw.insertBefore(banner, cw.firstChild);
    render();
  }

  mount();
  document.addEventListener('langchange', render);
  /* New chat from the main button clears a pending project target. */
  var ncBtn = document.getElementById('newChat');
  if (ncBtn) ncBtn.addEventListener('click', function () { setActive(null); }, true);
  sb.auth.onAuthStateChange(function (ev) {
    if (ev === 'SIGNED_OUT') { state.projects = []; state.chats = {}; state.ready = false; render(); return; }
    whenUser(12);
  });
  function whenUser(n) { if (user) load(); else if (n > 0) setTimeout(function () { whenUser(n - 1); }, 500); }
  whenUser(12);
})();
