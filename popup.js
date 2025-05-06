// popup.js
document.addEventListener('DOMContentLoaded', () => {
  // UI elements
  const currentUrlEl       = document.getElementById('currentUrl');
  const totalCountEl       = document.getElementById('totalCount');
  const thirdPartyCountEl  = document.getElementById('thirdPartyCount');
  const firstPartyCountEl  = document.getElementById('firstPartyCount');
  const thirdPortionEl     = document.getElementById('thirdPartyPortion');
  const firstPortionEl     = document.getElementById('firstPartyPortion');
  const cookieListEl       = document.getElementById('cookieList');
  const noCookiesEl        = document.getElementById('noCookies');
  const refreshBtn         = document.getElementById('refreshBtn');
  const exportBtn          = document.getElementById('exportBtn');
  const blockAllBtn        = document.getElementById('blockAllBtn');
  const filterItems        = document.querySelectorAll('.dropdown-item');
  const trackerCountEl     = document.getElementById('trackerCount');
  const trackerPortionEl   = document.getElementById('trackerPortion');

  let thirdPartyCookies = [];
  let firstPartyCookies = [];

  // Wire up Refresh button
  refreshBtn.addEventListener('click', loadAllCookies);

  // Wire up filter dropdown
  filterItems.forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      filterItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      applyFilter(item.dataset.filter);
    });
  });

  // Export to CSV (requires "downloads" permission in your manifest)
  exportBtn.addEventListener('click', () => {
    const rows = [
      ['Name','Domain','Type'],
      ...firstPartyCookies.map(c => [c.name, c.domain, c.type]),
      ...thirdPartyCookies.map(c => [c.name, c.domain, c.type])
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type: 'text/csv'});
    const url  = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: 'cookies.csv' });
  });

  // Block all third-party cookies (stub – needs background support)
  blockAllBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0].id;
      chrome.runtime.sendMessage(
        { type: 'blockThirdPartyCookies', tabId },
        () => loadAllCookies()
      );
    });
  });

  // Initial load
  loadAllCookies();

  // --- Core logic ---
  function loadAllCookies() {
    cookieListEl.innerHTML = '';
    noCookiesEl.classList.add('hidden');

    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs[0];
      const url = tab.url;
      const hostname = new URL(url).hostname;
      currentUrlEl.textContent = hostname;

      // 1) get first-party cookies
      chrome.cookies.getAll({ url }, fp => {
        firstPartyCookies = fp.map(c => ({
          name:   c.name,
          domain: c.domain.replace(/^\./, ''),
          type:   'First-party'
        }));

        // 2) ask background for third-party cookies
        chrome.runtime.sendMessage(
          { type: 'getCookiesForTab', tabId: tab.id },
          resp => {
            thirdPartyCookies = (resp.cookies||[]).map(c => ({
              name:   c.name,
              domain: c.domain,
              type:   c.type
            }));
            updateStats();
            renderList();
          }
        );
      });
    });
  }

  function updateStats() {
    const thirdCount = thirdPartyCookies.length;
    const firstCount = firstPartyCookies.length;
    const trackerCount = thirdPartyCookies.filter(c => c.type === 'Tracker').length;
    const total = thirdCount + firstCount + trackerCount;

    totalCountEl.textContent      = total;
    thirdPartyCountEl.textContent = thirdCount;
    firstPartyCountEl.textContent = firstCount;
    trackerCountEl.textContent = trackerCount;

    // adjust flex‐grow to reflect proportions
    thirdPortionEl.style.flexGrow = thirdCount;
    firstPortionEl.style.flexGrow = firstCount;
    trackerCountEl.style.flexGrow = trackerCount;
  }

  function renderList() {
    const all = [...firstPartyCookies, ...thirdPartyCookies];
    if (!all.length) {
      noCookiesEl.classList.remove('hidden');
      return;
    }

    all.forEach(c => {
      const item = document.createElement('div');
      item.className = 'cookie-item';
      item.dataset.type = c.type;

      item.innerHTML = `
        <div class="cookie-icon"><i class="bi bi-cookie"></i></div>
        <div class="cookie-info">
          <div class="cookie-domain">${c.domain}</div>
          <div class="cookie-meta">${c.name}</div>
          <div class="cookie-tags">
            <span class="tag ${c.type === 'First-party' ? 'tag-first-party' : 
              c.type === 'Tracker' ? 'tag-tracker' : 'tag-third-party'
            }">
              ${c.type}
            </span>
          </div>
        </div>
      `;
      cookieListEl.appendChild(item);
    });

    // apply currently-selected filter
    const activeFilter = document.querySelector('.dropdown-item.active').dataset.filter;
    applyFilter(activeFilter);
  }

  function applyFilter(filter) {
    cookieListEl.querySelectorAll('.cookie-item').forEach(item => {
      const t = item.dataset.type;
      if (filter === 'all') {
        item.classList.remove('hidden');
      } else if (filter === 'third-party') {
        item.classList.toggle('hidden', t === 'First-party');
      } else if (filter === 'first-party') {
        item.classList.toggle('hidden', t !== 'First-party');
      }
    });
  }
});


