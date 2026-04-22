// FitLog API Helper
//
// Auth model (post-R4):
//   - Data calls go through chaprolaAuth.fetch() → Bearer chp_user_... token.
//     R4 auto-injects WHERE user_id=<sub> on queries and auto-stamps user_id
//     on inserts/upserts. The client still passes user_id explicitly in
//     where/record as belt-and-suspenders (R4 accepts matching filter).
//   - Published /report endpoints are unauthenticated today; we pass
//     PARAM.user_id in the URL so HISTORY_STATS filters server-side.
//   - "Continue as guest" logs into a shared guest account that owns the
//     sample workouts + fitted models.

const GUEST_USER_ID = 'usr_1775958bb67a70c56ed189fcae6fe65d';
const GUEST_EMAIL = 'guest-fitlog@chaprola.org';
const GUEST_PASSWORD = '2PZ3a8wXv6HuJ9nQ5kMr4LgTy7BcDe';

// Stripe Payment Link for the $5 "Support fitlog" tip-jar.
// Empty = button hidden. Set this to a real Payment Link URL once one exists.
const TIP_URL = '';

const LBS_PER_KG = 2.2046226218;

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
        // Stale/expired token → drop the session so the login card re-renders
        // instead of every page silently showing empty data (Vogel 2026-04-21).
        if (response.status === 401) {
            await window.chaprolaAuth.logout();
            window.location.reload();
            return new Promise(() => {});
        }
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

    // Exercise match uses EQ (not CONTAINS) so "bench_press" does not also match
    // a future "incline_bench_press". Exercise strings are fixed-width padded in
    // the .F file; when the caller passes "bench_press" unpadded, Chaprola's
    // EQ operator does a trimmed-comparison under the hood. Verified against
    // HISTORY_STATS.CS 2026-04-20.
    async getWorkouts(exercise = null, limit = 100, offset = 0) {
        const options = {
            order_by: [{ field: 'date', dir: 'desc' }],
            limit,
            offset
        };
        if (exercise) {
            options.where = [{ field: 'exercise', op: 'eq', value: exercise }];
        }
        return this.query('workouts', options);
    },

    async getModel(exercise) {
        const result = await this.query('models', {
            where: [{ field: 'exercise', op: 'eq', value: exercise }],
            limit: 1
        });
        return result.records && result.records[0];
    },

    isGuest() {
        return this.currentUserId() === GUEST_USER_ID;
    },

    // Read-only guard for the shared guest account (Dalf FINDING-005 fix,
    // option a per Charles 2026-04-21). Guest can read everything but
    // cannot write. Every write entry-point calls this first; UI layer also
    // hides/replaces write affordances so the user never sees a dead
    // button. This is app-level defense-in-depth — casual pollution is
    // blocked here; an account-level read-only flag is a platform followup.
    _guardWrite() {
        if (this.isGuest()) {
            const err = new Error('Guest accounts are read-only. Sign up to track your own workouts.');
            err.guest_readonly = true;
            throw err;
        }
    },

    async insertRecord(file, record) {
        this._guardWrite();
        const scoped = { ...record, user_id: this.currentUserId() };
        return this._post('/insert-record', {
            userid: this.USERID,
            project: this.PROJECT,
            file,
            record: scoped
        });
    },

    async updateRecord(file, where, fields) {
        // Endpoint uses "set" (not "update") for the patch payload — per
        // POST /update-record in chaprola_help. "update" is a common misname.
        this._guardWrite();
        return this._post('/update-record', {
            userid: this.USERID,
            project: this.PROJECT,
            file,
            where,
            set: fields
        });
    },

    async deleteRecord(file, where) {
        this._guardWrite();
        return this._post('/delete-record', {
            userid: this.USERID,
            project: this.PROJECT,
            file,
            where
        });
    },

    async upsertRecord(file, key, record) {
        this._guardWrite();
        const scoped = { ...record, user_id: this.currentUserId() };
        return this._post('/upsert-record', {
            userid: this.USERID,
            project: this.PROJECT,
            file,
            key,
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

    // Refit the per-user model for one exercise. Server computes the OLS
    // via OPTIMIZE_MODEL.CS (/run scoped by chp_user_ token), client parses
    // the pipe-delimited output and upserts models.DA. Fire-and-forget from
    // the caller's perspective; insufficient data (n < 2) no-ops the upsert.
    // Returns { slope, base, r_squared, n } or null.
    async refitModel(exercise) {
        this._guardWrite();
        const result = await this.runProgram('OPTIMIZE_MODEL', { exercise });
        const parsed = {};
        (result.output || '').split('\n').forEach(line => {
            const [key, value] = line.split('|');
            if (key) parsed[key.trim()] = (value || '').trim();
        });

        const n = parseInt(parsed.n, 10);
        if (!n || n < 2 || parsed.slope === undefined) return null;

        const slope = parseFloat(parsed.slope);
        const base = parseFloat(parsed.base);
        const r_squared = parseFloat(parsed.r_squared);

        const today = new Date().toISOString().slice(0, 10);
        await this.upsertRecord('models', 'exercise', {
            exercise,
            param_a: slope.toFixed(3),
            param_b: base.toFixed(1),
            r_squared: r_squared.toFixed(2),
            last_updated: today
        });

        return { slope, base, r_squared, n };
    },

    async weeklySummary() {
        const sub = this.currentUserId();
        const body = {
            userid: this.USERID, project: this.PROJECT, file: 'workouts',
            where: [
                { field: 'user_id', op: 'eq', value: sub },
                { field: 'date', op: 'date_within', value: '7d' }
            ],
            // Cookbook Recipe 21a shape: { field: [funcs] }. Response comes back
            // as aggregates.<field>.<func>.
            aggregate: { workout_id: ['count'] }
        };
        return this._post('/query', body);
    },

    // Goals CRUD
    async getGoals(exercise = null) {
        const extra = exercise ? [{ field: 'exercise', op: 'eq', value: exercise }] : null;
        return this.query('goals', extra ? { where: extra, order_by: [{field:'created', dir:'desc'}] } : { order_by: [{field:'created', dir:'desc'}] });
    },

    async addGoal({ exercise, target_weight, target_date }) {
        return this.insertRecord('goals', {
            goal_id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())).replace(/-/g, '').slice(0, 36),
            exercise,
            target_weight: String(target_weight),
            target_date,
            created: new Date().toISOString().slice(0, 10),
            status: 'active'
        });
    },

    async deleteGoal(goal_id) {
        return this.deleteRecord('goals', { goal_id });
    },

    // Preferences
    async getUnit() {
        const res = await this.query('preferences', { limit: 1 });
        const r = res.records && res.records[0];
        return (r && r.unit && r.unit.trim()) || 'lbs';
    },

    async setUnit(unit) {
        return this.upsertRecord('preferences', 'user_id', { unit });
    },

    // Unit conversion (canonical storage is lbs; display converts)
    toDisplay(weightLbs, unit) {
        const n = typeof weightLbs === 'string' ? parseFloat(weightLbs) : weightLbs;
        if (unit === 'kg') return Math.round(n / LBS_PER_KG * 10) / 10;
        return Math.round(n);
    },

    toLbs(weight, unit) {
        const n = typeof weight === 'string' ? parseFloat(weight) : weight;
        if (unit === 'kg') return Math.round(n * LBS_PER_KG);
        return Math.round(n);
    },

    parseReportTable(output) {
        const lines = output.split('\n');
        const rows = [];
        let inData = false;
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('---')) { inData = true; continue; }
            if (inData && trimmed) {
                const parts = trimmed.split(/\s+/).filter(Boolean);
                if (parts.length >= 2) rows.push(parts);
            }
        }
        return rows;
    }
};

const EXERCISES = {
    bench_press: { name: 'Bench Press', icon: '🏋️' },
    squat: { name: 'Squat', icon: '🦵' },
    deadlift: { name: 'Deadlift', icon: '💪' },
    overhead_press: { name: 'Overhead Press', icon: '🙌' }
};

// HTML-escape any backend-sourced string before it hits innerHTML. Covers
// stored-XSS via the shared guest account (Dalf FINDING-005) and self-XSS
// via display_name (FINDING-008). Apply to every field that was written
// by a user — notes, display_name, email, free-form inputs. Numeric fields
// from records get the same treatment as defense-in-depth.
function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// Return the "Sign up to track your own workouts" CTA markup for guest users.
// Callers drop this into whatever container replaces a write control (the
// log form, the goal form, the dashboard quick-action bar, etc.). The copy
// is intentionally identical everywhere so the upsell reads as one message.
function guestSignupCta(opts = {}) {
    const headline = opts.headline || "You're exploring fitlog as a guest";
    const body = opts.body || 'Sign up (free) to log your own workouts, fit your own model, and see your own progress curve.';
    const returnTo = typeof window !== 'undefined' ? window.location.href : '';
    return `
        <div class="guest-cta">
            <h3>${esc(headline)}</h3>
            <p>${esc(body)}</p>
            <a href="https://chaprola.org/signup/?return_to=${esc(encodeURIComponent(returnTo))}" class="btn btn-primary btn-large">Sign up</a>
        </div>
    `;
}

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
    const showMsg = (t, ok) => { msg.textContent = t; msg.className = 'auth-msg ' + (ok ? 'ok' : 'err'); };

    document.getElementById('auth-login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        showMsg('Signing in...', true);
        try { await window.chaprolaAuth.login({ email, password }); window.location.reload(); }
        catch (err) { showMsg(err.message || 'Login failed', false); }
    });

    document.getElementById('auth-guest-btn').addEventListener('click', async () => {
        showMsg('Logging in as guest...', true);
        try { await window.chaprolaAuth.login({ email: GUEST_EMAIL, password: GUEST_PASSWORD }); window.location.reload(); }
        catch (err) { showMsg(err.message || 'Guest login failed', false); }
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
    const label = u.sub === GUEST_USER_ID ? 'Guest' : (u.display_name || u.email);

    const chip = document.createElement('div');
    chip.id = 'user-chip';
    const isGuest = u.sub === GUEST_USER_ID;
    // Guest is read-only (per Dalf FINDING-005 fix, option a). Unit toggle
    // writes to preferences.DA — guest can't persist a personal unit, so
    // the dropdown is hidden for guest. Guest display stays in lbs.
    chip.innerHTML = `
        <span class="user-chip-label">${esc(label)}</span>
        ${isGuest ? '' : `
            <select id="user-chip-unit" class="user-chip-unit" title="Display unit">
                <option value="lbs">lbs</option>
                <option value="kg">kg</option>
            </select>
        `}
        <button id="user-chip-logout" class="btn btn-link">Log out</button>
    `;
    nav.appendChild(chip);

    if (!isGuest) {
        FITLOG_API.getUnit().then(unit => {
            window.FITLOG_UNIT = unit;
            document.getElementById('user-chip-unit').value = unit;
        });
        document.getElementById('user-chip-unit').addEventListener('change', async (e) => {
            const unit = e.target.value;
            await FITLOG_API.setUnit(unit);
            window.FITLOG_UNIT = unit;
            window.location.reload();
        });
    } else {
        window.FITLOG_UNIT = 'lbs';
    }

    document.getElementById('user-chip-logout').addEventListener('click', async () => {
        await window.chaprolaAuth.logout();
        window.location.reload();
    });
}

function requireAuth() {
    return new Promise((resolve) => {
        if (!window.chaprolaAuth) { console.error('chaprolaAuth not loaded'); return; }
        if (window.chaprolaAuth.isAuthenticated()) {
            const u = window.chaprolaAuth.getUser();
            // Tag <body> for CSS-level gating of write UI when guest is active.
            if (u && u.sub === GUEST_USER_ID) {
                document.body.classList.add('is-guest');
            }
            _renderUserChip();
            // Guest stays in lbs (no preferences.DA write). Non-guest loads their saved unit.
            if (u && u.sub === GUEST_USER_ID) {
                window.FITLOG_UNIT = 'lbs';
                resolve(u);
            } else {
                FITLOG_API.getUnit().then(unit => { window.FITLOG_UNIT = unit; resolve(u); });
            }
            return;
        }
        _renderLoginCard();
    });
}
