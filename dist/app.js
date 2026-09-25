'use strict';
const menuToggle = document.querySelector('.menu-toggle');
const mobileNav = document.querySelector('#mobile-nav');
function closeMenu() {
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Open navigation');
  mobileNav.hidden = true;
}
menuToggle.addEventListener('click', () => {
  const expanded = menuToggle.getAttribute('aria-expanded') !== 'true';
  menuToggle.setAttribute('aria-expanded', String(expanded));
  menuToggle.setAttribute('aria-label', expanded ? 'Close navigation' : 'Open navigation');
  mobileNav.hidden = !expanded;
});
mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !mobileNav.hidden) {
    closeMenu();
    menuToggle.focus();
  }
});
window.matchMedia('(min-width: 981px)').addEventListener('change', event => {
  if (event.matches) closeMenu();
});
/* One front door: when the planning app's fact finder is configured, the hero
   button takes families straight to it instead of the consultation dialog. */
(() => {
  const candidate = window.NMP_CONFIG?.interviewUrl;
  if (!candidate) return;
  let url;
  try { url = new URL(candidate); } catch { return; }
  if (url.protocol !== 'https:' || url.username || url.password) return;
  document.querySelectorAll('[data-interview-cta]').forEach(button => {
    const link = document.createElement('a');
    link.className = button.className;
    link.href = url.href;
    link.innerHTML = 'Get My Free Planning Report <img class="icon" src="/assets/icons/arrow-right.svg" alt="" aria-hidden="true" width="32" height="32">';
    button.replaceWith(link);
  });
})();
let dialogTrigger = null;
document.querySelectorAll('[data-dialog]').forEach(button => {
  button.addEventListener('click', () => {
    if (button.dataset.dialog === 'consultation') {
      const candidate = window.NMP_CONFIG?.bookingUrl;
      if (candidate) {
        try {
          const url = new URL(candidate);
          if (url.protocol === 'https:' && !url.username && !url.password) {
            window.location.assign(url.href);
            return;
          }
        } catch { /* A missing or invalid link keeps call/email available. */ }
      }
    }
    const next = document.getElementById(button.dataset.dialog);
    const current = document.querySelector('dialog[open]');
    if (!current) dialogTrigger = button;
    if (current) current.close();
    closeMenu();
    next.showModal();
    document.body.classList.add('dialog-open');
  });
});
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (document.querySelector('dialog[open]')) return;
    document.body.classList.remove('dialog-open');
    if (dialogTrigger?.isConnected) {
      if (mobileNav.contains(dialogTrigger) && mobileNav.hidden) menuToggle.focus();
      else dialogTrigger.focus();
    }
  });
});
document.querySelector('#year').textContent = String(new Date().getFullYear());
