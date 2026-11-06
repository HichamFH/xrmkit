// Pont entre l'extension (popup / workbench) et le script injecté dans la page (monde MAIN).
// Le script injecté a seul accès à `Xrm` ; ici on relaie les messages via window.postMessage.
(() => {
  'use strict';
  const pending = new Map();

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.source !== 'XRMKIT_RES') return;
    const resolve = pending.get(d.id);
    if (!resolve) return;
    pending.delete(d.id);
    resolve(d);
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.xrmkit) return;
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      sendResponse({ ok: false, error: 'Délai dépassé : la page Dynamics ne répond pas (Xrm non chargé ?).' });
    }, 120000);
    pending.set(id, (res) => {
      clearTimeout(timer);
      sendResponse({ ok: res.ok, data: res.data, error: res.error });
    });
    window.postMessage(
      { source: 'XRMKIT_REQ', id, action: msg.action, payload: msg.payload },
      window.location.origin
    );
    return true; // réponse asynchrone
  });
})();
