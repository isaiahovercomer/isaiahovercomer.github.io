(function () {
  const status = document.getElementById('status');
  let timer = 0;

  function say(text) {
    status.textContent = text;
    clearTimeout(timer);
    timer = setTimeout(() => { status.textContent = ''; }, 4000);
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  document.querySelectorAll('.btn-copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const url = btn.dataset.url;
      let ok = false;
      if (navigator.clipboard && window.isSecureContext) {
        try { await navigator.clipboard.writeText(url); ok = true; } catch (e) { ok = false; }
      }
      if (!ok) ok = fallbackCopy(url);
      if (ok) {
        say('已複製網址，可以貼到 LINE 群組。');
        btn.textContent = '已複製';
        setTimeout(() => { btn.textContent = '複製網址'; }, 2500);
      } else {
        window.prompt('請長按複製這個網址：', url);
      }
    });
  });

  // Android Chrome：出現可安裝時才顯示「安裝」按鈕
  const installBtn = document.getElementById('install');
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => null);
    deferred = null;
    installBtn.hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    installBtn.hidden = true;
    say('已加到主畫面。');
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
    });
  }
})();
