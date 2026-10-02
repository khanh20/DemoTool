const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PROFILES_DIR = path.join(__dirname, '..', '..', 'data', 'profiles');
if (!fs.existsSync(PROFILES_DIR)) {
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
}

// Track active browser contexts: accountId -> context
const activeContexts = new Map();

/**
 * Launch or reuse a persistent browser context for an account
 * Using persistent context retains cookies, localStorage, session, and cache exactly like Chrome user profile
 */
async function launchAccountBrowser(account, options = {}) {
  const accountId = account.id;
  const profilePath = path.join(PROFILES_DIR, `profile_${accountId}`);

  if (!fs.existsSync(profilePath)) {
    fs.mkdirSync(profilePath, { recursive: true });
  }

  // If already active and not closed, reuse context
  if (activeContexts.has(accountId)) {
    const existing = activeContexts.get(accountId);
    try {
      const pages = existing.pages();
      if (pages.length > 0 && !pages[0].isClosed()) {
        return { context: existing, page: pages[0] };
      }
    } catch (e) {
      activeContexts.delete(accountId);
    }
  }

  const launchArgs = [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-infobars',
    '--window-position=50,50',
    '--window-size=1280,800',
  ];

  const launchOptions = {
    headless: options.headless !== undefined ? options.headless : false, // Default: SHOW Chrome
    args: launchArgs,
    viewport: null, // Natural window size
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
  };

  // Add proxy if specified for this account
  if (account.proxy && account.proxy.trim()) {
    const [server, username, password] = account.proxy.trim().split('@');
    if (username && password) {
      launchOptions.proxy = {
        server: `http://${server}`,
        username,
        password,
      };
    } else {
      launchOptions.proxy = { server: `http://${account.proxy.trim()}` };
    }
  }

  const context = await chromium.launchPersistentContext(profilePath, launchOptions);

  // If we have saved cookies in DB, import them if cookies in context are empty
  if (account.cookie_json) {
    try {
      const cookies = JSON.parse(account.cookie_json);
      if (Array.isArray(cookies) && cookies.length > 0) {
        await context.addCookies(cookies);
      }
    } catch (err) {
      console.error(`Error loading cookies for account ${accountId}:`, err.message);
    }
  }

  let page = context.pages()[0];
  if (!page) {
    page = await context.newPage();
  }

  // Add stealth evasion script
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  activeContexts.set(accountId, context);

  context.on('close', () => {
    activeContexts.delete(accountId);
  });

  return { context, page };
}

/**
 * Save cookies from current browser context into account record
 */
async function saveAccountCookies(context, db, accountId) {
  try {
    const cookies = await context.cookies();
    const cookieStr = JSON.stringify(cookies);
    db.prepare('UPDATE accounts SET cookie_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(cookieStr, accountId);
    return cookies;
  } catch (err) {
    console.error(`Failed to save cookies for account ${accountId}:`, err.message);
    return null;
  }
}

/**
 * Close active browser for an account
 */
async function closeAccountBrowser(accountId) {
  if (activeContexts.has(accountId)) {
    const context = activeContexts.get(accountId);
    try {
      await context.close();
    } catch (e) {}
    activeContexts.delete(accountId);
  }
}

module.exports = {
  launchAccountBrowser,
  saveAccountCookies,
  closeAccountBrowser,
  activeContexts,
};
