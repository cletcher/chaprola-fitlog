// FitLog API Helper
//
// Auth model:
//   - Data calls (/query, /insert-record, /run) go through chaprolaAuth.fetch(),
//     which attaches the user's Bearer chp_user_... token. R4 handler-side
//     scoping auto-injects WHERE user_id=<sub> on queries and auto-stamps
//     user_id on inserts — server-side enforcement.
//   - The client still passes user_id explicitly in where/record as belt-and-
//     suspenders (R4 accepts matching filter as a no-op; mismatch would 403).
//   - Published reports (/report) are not on the user-token allowlist today,
//     so they're unauthenticated and rely on PARAM.user_id filtering inside
//     the published program (HISTORY_STATS does this).
//   - "Continue as guest" logs in the shared guest account (credentials below).
//
// GUEST_USER_ID is the canonical sub of the shared guest account that owns the
// sample workouts + fitted models. Anyone who clicks "Continue as guest" logs
// into this account.

const GUEST_USER_ID = 'usr_1775958bb67a70c56ed189fcae6fe65d';
const GUEST_EMAIL = 'guest-fitlog@chaprola.org';
const GUEST_PASSWORD = '2PZ3a8wXv6HuJ9nQ5kMr4LgTy7BcDe';

// Stripe Payment Link for the $5 "Support fitlog" tip-jar. Set by Charles in
// the Stripe dashboard (Payment Links → create link for the "unlock" product).
// Empty = button is hidden. Full browser-initiated /payments/checkout requires
// either a site-key-accepting endpoint or a public /payments/donate — neither
// exists today (routed to Tawni). Payment Link is the v1 workaround.
const TIP_URL = '';

const FITLOG_API = {
    BASE: 'https://api.chaprola.org',
    USERID: 'chaprola-fitlog',
    PROJECT: 'fitlog',

    currentUserId() {
        const u = window.chaprolaAuth && window.chaprolaAuth.getUser();
        return u && u.sub;
    },

    _scopedWhere(extra) {
        const sub = this.currentUserId();
        const base = [{ field: 'user_id', op: 'eq', value: sub }];
        return extra ? base.concat(extra) : base;
    },

    async _post(path, body) {
        const response = await window.chaprolaAuth.fetch(`${this.BASE}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return response.json();
    },

    async query(file, options = {}) {
        const where = this._scopedWhere(options.where);
        return this._post('/query', {
            userid: this.USERID,
            project: this.PROJECT,
            file,
            ...options,
            where
        });
    },

    async report(name, params = {}) {
        const queryParams = new URLSearchParams({
            userid: this.USERID,
            project: this.PROJECT,
            name,
            user_id: this.currentUserId() || '',
            ...params
        });
        const response = await fetch(`${this.BASE}/report?${queryParams}`);
        return response.text();
    },

    async getModels() {
        return this.query('models');
    },

    // Get workouts for the current user, optionally filtered by exercise.
    // Ordered by date (ISO YYYY-MM-DD sorts correctly as a string, unlike day_number).
    async getWorkouts(exercise = null, limit = 100) {
        const options = {
            order_by: [{ field: 'date', dir: 'desc' }],
            limit
        };
        if (exercise) {
            options.where = [{ field: 'exercise', op: 'contains', value: exercise }];
        }
        return this.query('workouts', options);
    },

    async getModel(exercise) {
        const result = await this.query('models', {
            where: [{ field: 'exercise', op: 'contains', value: exercise }],
            limit: 1
        });
        return result.records && result.records[0];
    },

    async insertRecord(file, record) {
        const scoped = { ...record, user_id: this.currentUserId() };
        return this._post('/insert-record', {
            userid: this.USERID,
            project: this.PROJECT,
            file,
            record: scoped
        });
    },

    async runProgram(name, params = {}) {
        return this._post('/run', {
            userid: this.USERID,
            project: this.PROJECT,
            name,
            params: { user_id: this.currentUserId() || '', ...params }
        });
    },

    predict1RM(slope, base, day) {
        return slope * day + base;
    },

    parseReportTable(output) {
        const lines = output.split('\n');
        const rows = [];
        let inData = false;

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('---')) {
                inData = true;
                continue;
            }
            if (inData && trimmed) {
                const parts = trimmed.split(/\s+/).filter(Boolean);
                if (parts.length >= 2) {
                    rows.push(parts);
                }
            }
        }
        return rows;
    }
};

// Exercise metadata
const EXERCISES = {
    bench_press: { name: 'Bench Press', icon: '🏋️' },
    squat: { name: 'Squat', icon: '🦵' },
    deadlift: { name: 'Deadlift', icon: '💪' },
    overhead_press: { name: 'Overhead Press', icon: '🙌' }
};

function formatNumber(num) {
    return new Intl.NumberFormat().format(num);
}

function epley1RM(weight, reps) {
    if (reps === 1) return weight;
    return Math.round(weight * (1 + reps / 30));
}

function getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

// Auth helpers ---------------------------------------------------------------
//
// requireAuth() is called on every fitlog page at load time. If the user is
// not authenticated, it injects the login card into the <main> container and
// halts further page JS via the returned promise (never resolves until login).
// Returns a promise that resolves with the logged-in user once auth is set.

function _renderLoginCard() {
    const main = document.querySelector('main') || document.body;
    main.innerHTML = `
        <section class="auth-card">
            <h1>Welcome to FitLog</h1>
            <p class="auth-sub">Sign in to track your workouts. Or continue as guest to explore sample data.</p>

            <form id="auth-login-form" class="auth-form">
                <label for="auth-email">Email</label>
                <input id="auth-email" type="email" autocomplete="username" required>
                <label for="auth-password">Password</label>
                <input id="auth-password" type="password" autocomplete="current-password" required>
                <button type="submit" class="btn btn-primary">Sign in</button>
                <div id="auth-msg" class="auth-msg"></div>
            </form>

            <div class="auth-divider"><span>or</span></div>

            <button id="auth-guest-btn" class="btn btn-secondary">Continue as guest</button>
            <button id="auth-signup-btn" class="btn btn-link">Create an account</button>
        </section>
    `;

    const msg = document.getElementById('auth-msg');
    const showMsg = (t, ok) => {
        msg.textContent = t;
        msg.className = 'auth-msg ' + (ok ? 'ok' : 'err');
    };

    document.getElementById('auth-login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        showMsg('Signing in...', true);
        try {
            await window.chaprolaAuth.login({ email, password });
            window.location.reload();
        } catch (err) {
            showMsg(err.message || 'Login failed', false);
        }
    });

    document.getElementById('auth-guest-btn').addEventListener('click', async () => {
        showMsg('Logging in as guest...', true);
        try {
            await window.chaprolaAuth.login({ email: GUEST_EMAIL, password: GUEST_PASSWORD });
            window.location.reload();
        } catch (err) {
            showMsg(err.message || 'Guest login failed', false);
        }
    });

    document.getElementById('auth-signup-btn').addEventListener('click', () => {
        window.location.href = 'https://chaprola.org/signup/?return_to=' + encodeURIComponent(window.location.href);
    });
}

function _renderUserChip() {
    const nav = document.querySelector('.navbar .nav-links');
    if (!nav) return;
    const existing = document.getElementById('user-chip');
    if (existing) existing.remove();

    const u = window.chaprolaAuth.getUser();
    const label = u.sub === GUEST_USER_ID
        ? 'Guest'
        : (u.display_name || u.email);

    const chip = document.createElement('div');
    chip.id = 'user-chip';
    chip.innerHTML = `
        <span class="user-chip-label">${label}</span>
        <button id="user-chip-logout" class="btn btn-link">Log out</button>
    `;
    nav.appendChild(chip);
    document.getElementById('user-chip-logout').addEventListener('click', async () => {
        await window.chaprolaAuth.logout();
        window.location.reload();
    });
}

// Gate the page on authentication. Call this at the top of each page's script.
// Returns a promise that resolves when the user is authenticated; never resolves
// if the user stays on the login card (caller's page JS should wait on this).
function requireAuth() {
    return new Promise((resolve) => {
        if (!window.chaprolaAuth) {
            console.error('chaprolaAuth not loaded');
            return;
        }
        if (window.chaprolaAuth.isAuthenticated()) {
            _renderUserChip();
            resolve(window.chaprolaAuth.getUser());
            return;
        }
        _renderLoginCard();
        // never resolves — the user will either sign in (page reloads) or leave
    });
}
