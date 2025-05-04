// background.js

// In-memory state per tab
const tabData = {};

// Known tracker domains (will be populated from Disconnect JSON)
let knownTrackers = new Set();

// 1) Load and parse Disconnect’s trackers.json
async function loadTrackerList() {
  try {
    const url  = chrome.runtime.getURL('trackers.json');
    const resp = await fetch(url);
    const data = await resp.json();

    const domains = new Set();

    for (const serviceList of Object.values(data.categories || {})) {
      for (const vendorEntry of serviceList) {
        // vendorEntry is like { "10Web": { "https://10web.io/": ["10web.io"] } }
        for (const siteMap of Object.values(vendorEntry)) {
          // siteMap is like { "https://10web.io/": ["10web.io"] }
          for (const domainList of Object.values(siteMap)) {
            // Guard: ensure we iterate over an array
            const list = Array.isArray(domainList) ? domainList : [domainList];

            // (Optional) debug any unexpected shapes:
            if (!Array.isArray(domainList)) {
              console.warn(
                '[tracker-loader] wrapped non-array domainList:',
                domainList
              );
            }

            list.forEach(d => domains.add(d));
          }
        }
      }
    }

    knownTrackers = domains;
    console.log(`Loaded ${knownTrackers.size} tracker domains`);
  } catch (e) {
    console.error('Error loading trackers.json:', e);
  }
}
loadTrackerList();

// 2) On every top-level navigation, reset & record the page’s eTLD+1
chrome.webNavigation.onCommitted.addListener(({ tabId, frameId, url }) => {
  if (frameId !== 0) return;
  tabData[tabId] = {
    pageDomain: new URL(url).hostname,
    seenHosts:  new Set(),
    cookies:    []
  };
});

// 3) Clean up when tabs close
chrome.tabs.onRemoved.addListener(tabId => {
  delete tabData[tabId];
});

// 4) Watch all requests to spot third-party hosts
chrome.webRequest.onBeforeRequest.addListener(details => {
  const info = tabData[details.tabId];
  if (!info) return;

  let reqHost;
  try {
    reqHost = new URL(details.url).hostname;
  } catch {
    return;
  }

  // not same as pageDomain or its subdomain?
  if (
    reqHost !== info.pageDomain &&
    !reqHost.endsWith('.' + info.pageDomain)
  ) {
    if (!info.seenHosts.has(reqHost)) {
      info.seenHosts.add(reqHost);
      fetchCookiesForDomain(details.tabId, reqHost);
    }
  }
}, { urls: ['<all_urls>'] });

// 5) For each new third-party host, pull its existing cookies
function fetchCookiesForDomain(tabId, domain) {
  chrome.cookies.getAll({ domain }, cookies => {
    const info = tabData[tabId];
    if (!info) return;

    cookies.forEach(c => {
      const cleanHost = c.domain.replace(/^\./, '');
      info.cookies.push({
        name:   c.name,
        domain: cleanHost,
        path:   c.path,
        secure: c.secure,
        type:   classifyCookie(cleanHost, info.pageDomain)
      });
    });
  });
}

// 6) Classify a cookie as Tracker / Third-party / First-party
function classifyCookie(host, pageDomain) {
  // Known tracker?
  if (
    knownTrackers.has(host) ||
    Array.from(knownTrackers).some(t => host.endsWith('.' + t))
  ) {
    return 'Tracker';
  }
  // Same-site?
  if (host === pageDomain || host.endsWith('.' + pageDomain)) {
    return 'First-party';
  }
  // Otherwise real third-party
  return 'Third-party';
}

// 7) Respond to popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const info = tabData[msg.tabId];
  if (msg.type === 'getCookiesForTab') {
    sendResponse({ cookies: info ? info.cookies : [] });
    return true;
  }

  if (msg.type === 'blockThirdPartyCookies') {
    if (info) {
      info.cookies.forEach(c => {
        if (c.type !== 'First-party') {
          const scheme = c.secure ? 'https://' : 'http://';
          chrome.cookies.remove({
            url:  scheme + c.domain + c.path,
            name: c.name
          });
        }
      });
      info.cookies = info.cookies.filter(c => c.type === 'First-party');
    }
    sendResponse({ ok: true });
    return true;
  }
});
