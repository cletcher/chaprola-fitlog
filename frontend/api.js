// FitLog API Helper

const FITLOG_API = {
    BASE: 'https://api.chaprola.org',
    USERID: 'chaprola-fitlog',
    PROJECT: 'fitlog',
    SITE_KEY: 'site_3dcb3e6762ec243e9ceb9f886f91d205b59208be60db1e2cedab4ecf818e0d89',

    // Query data from a file (retries once on 401 — CORS preflight race on first load)
    async query(file, options = {}) {
        const doFetch = () => fetch(`${this.BASE}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.SITE_KEY}`
            },
            body: JSON.stringify({
                userid: this.USERID,
                project: this.PROJECT,
                file,
                ...options
            })
        });
        let response = await doFetch();
        if (response.status === 401) {
            await new Promise(r => setTimeout(r, 500));
            response = await doFetch();
        }
        return response.json();
    },

    // Get a published report
    async report(name, params = {}) {
        const queryParams = new URLSearchParams({
            userid: this.USERID,
            project: this.PROJECT,
            name,
            ...params
        });
        const response = await fetch(`${this.BASE}/report?${queryParams}`);
        return response.text();
    },

    // Get models data
    async getModels() {
        return this.query('models');
    },

    // Get workouts, optionally filtered by exercise.
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

    // Get model for a specific exercise
    async getModel(exercise) {
        const result = await this.query('models', {
            where: [{ field: 'exercise', op: 'contains', value: exercise }],
            limit: 1
        });
        return result.records && result.records[0];
    },

    // Insert a record into a file (retries once on 401)
    async insertRecord(file, record) {
        const doFetch = () => fetch(`${this.BASE}/insert-record`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.SITE_KEY}`
            },
            body: JSON.stringify({
                userid: this.USERID,
                project: this.PROJECT,
                file,
                record
            })
        });
        let response = await doFetch();
        if (response.status === 401) {
            await new Promise(r => setTimeout(r, 500));
            response = await doFetch();
        }
        return response.json();
    },

    // Calculate predicted 1RM using linear model
    predict1RM(slope, base, day) {
        return slope * day + base;
    },

    // Parse Chaprola report output
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

// Format number with commas
function formatNumber(num) {
    return new Intl.NumberFormat().format(num);
}

// Calculate Epley 1RM
function epley1RM(weight, reps) {
    if (reps === 1) return weight;
    return Math.round(weight * (1 + reps / 30));
}

// Get URL parameter
function getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}
