/* Unknown AI — Admin UI compatibility layer
 * This file intentionally contains presentation/accessibility enhancements only.
 * Authentication, API requests, permissions, routing and data operations remain in admin.js.
 */
(function () {
  'use strict';

  // Do not interfere with the admin application if its core script did not load.
  if (!document || !document.querySelector) return;

  var nav = document.getElementById('nav');
  var app = document.getElementById('app');
  var menuButton = document.getElementById('menuBtn');
  var navScrim = document.getElementById('scrim');

  if (!app) return;

  function syncActiveNavigation() {
    if (!nav) return;
    var buttons = nav.querySelectorAll('.navbtn[data-view]');
    Array.prototype.forEach.call(buttons, function (button) {
      var active = button.classList.contains('active');
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function syncMobileNavigation() {
    var isOpen = document.body.classList.contains('nav-open');
    if (menuButton) menuButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (navScrim) navScrim.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  }

  // admin.js owns view switching; observe its active class instead of duplicating routing.
  if (nav && window.MutationObserver) {
    var navObserver = new MutationObserver(syncActiveNavigation);
    navObserver.observe(nav, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  // Keep mobile navigation state accessible while admin.js handles the actual toggle.
  if (window.MutationObserver) {
    var bodyObserver = new MutationObserver(syncMobileNavigation);
    bodyObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  // Close the mobile drawer after a section is selected. The core router still handles the click.
  if (nav) {
    nav.addEventListener('click', function (event) {
      var button = event.target && event.target.closest
        ? event.target.closest('.navbtn[data-view]')
        : null;
      if (button && document.body.classList.contains('nav-open')) {
        document.body.classList.remove('nav-open');
      }
    });
  }

  syncActiveNavigation();
  syncMobileNavigation();
})();
