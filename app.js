(() => {
  const icons = {
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10.2 9.4v5.2L15.2 12z" fill="currentColor"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="16.7" cy="7.3" r="0.9" fill="currentColor"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.4" y="3.4" width="17.2" height="17.2" rx="4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M13.6 8.1h-1.4c-.7 0-1.1.4-1.1 1.1v1.5H13l-.25 1.85h-1.75V18h-1.9v-5.45H8.2V11h1.15V9.05C9.35 7.35 10.35 6.3 12.2 6.3h1.4z" fill="currentColor"/></svg>',
    soundcloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15.5v-2.2m3 4.2v-6.2m3 6.2V8.8m3 6.7v-5.2m3.2 5.2a3.4 3.4 0 1 0-2.2-6 4.2 4.2 0 0 1 8 1.7c0 2.4-1.8 4.3-4.2 4.3H13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    blog: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5.5h9.5A2.5 2.5 0 0 1 18 8v11.5H8A2 2 0 0 1 6 17.5v-12z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M6 5.5A2 2 0 0 0 4 7.5v10A3 3 0 0 0 7 20.5h11" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M9.5 9.5h6M9.5 13h6M9.5 16.5h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
  };

  const main = document.getElementById('main');
  const socialEl = document.getElementById('social');
  const emptyEl = document.getElementById('empty');
  const searchEl = document.getElementById('q');
  const footerLinks = document.getElementById('footer-links');
  const emailEl = document.getElementById('email');
  const footerNote = document.getElementById('footer-note');

  const escapeHtml = (s) => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const render = (data) => {
    document.title = data.site.title || document.title;
    socialEl.innerHTML = data.social.map((s) => {
      const icon = icons[s.id] || '';
      return `<a href="${escapeHtml(s.url)}" rel="noopener noreferrer">${icon}<span>${escapeHtml(s.title)}</span></a>`;
    }).join('');

    main.innerHTML = data.categories.map((cat) => {
      const cards = cat.items.map((item) => {
        const icon = item.icon
          ? `<img class="card-icon" src="${escapeHtml(item.icon)}" alt="" width="52" height="52" loading="lazy">`
          : '';
        const text = `${item.title} ${item.description} ${cat.title}`.toLowerCase();
        return `
        <a class="card" data-text="${escapeHtml(text)}" href="${escapeHtml(item.url)}" rel="noopener noreferrer">
          ${icon}
          <div class="card-body">
            <div class="card-title"><span>${escapeHtml(item.title)}</span></div>
            <p>${escapeHtml(item.description)}</p>
          </div>
          <span class="go" aria-hidden="true">›</span>
        </a>`;
      }).join('');
      return `
        <details class="category" open data-id="${escapeHtml(cat.id)}" data-title="${escapeHtml(cat.title.toLowerCase())}">
          <summary><span>${escapeHtml(cat.title)}</span>
            <svg class="chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4.2 L6 8.2 L10 4.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </summary>
          <div class="cards">${cards}</div>
        </details>`;
    }).join('');

    const fl = data.footer || {};
    const bits = [];
    if (fl.legacyHome) bits.push(`<a href="${escapeHtml(fl.legacyHome.url)}">${escapeHtml(fl.legacyHome.title)}</a>`);
    if (fl.privacy) bits.push(`<a href="${escapeHtml(fl.privacy.url)}" rel="noopener noreferrer">${escapeHtml(fl.privacy.title)}</a>`);
    if (fl.terms) bits.push(`<a href="${escapeHtml(fl.terms.url)}" rel="noopener noreferrer">${escapeHtml(fl.terms.title)}</a>`);
    footerLinks.innerHTML = bits.join('');
    if (data.site.email) {
      emailEl.innerHTML = `聯絡：<a href="mailto:${escapeHtml(data.site.email)}">${escapeHtml(data.site.email)}</a>`;
    }
    if (data.site.footerNote) footerNote.textContent = data.site.footerNote;
  };

  const applyFilter = () => {
    const q = (searchEl.value || '').trim().toLowerCase();
    let visible = 0;
    document.querySelectorAll('.category').forEach((cat) => {
      let n = 0;
      cat.querySelectorAll('.card').forEach((card) => {
        const ok = !q || (card.getAttribute('data-text') || '').includes(q);
        card.hidden = !ok;
        if (ok) n += 1;
      });
      cat.hidden = n === 0;
      if (n > 0) {
        visible += n;
        if (q) cat.open = true;
      }
    });
    emptyEl.hidden = visible > 0;
  };

  fetch('links.json', { cache: 'no-cache' })
    .then((r) => {
      if (!r.ok) throw new Error('links.json ' + r.status);
      return r.json();
    })
    .then((data) => {
      render(data);
      searchEl.addEventListener('input', applyFilter);
    })
    .catch((err) => {
      emptyEl.hidden = false;
      emptyEl.textContent = '無法載入連結清單，請稍後再試。';
      console.error(err);
    });
})();
