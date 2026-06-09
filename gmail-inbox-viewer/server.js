require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3535;

// Gmail OAuth credentials — set these in a .env file or as environment variables
const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    console.error('ERROR: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN must be set.');
    process.exit(1);
}

// Cache the access token to avoid refreshing on every request
let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
    if (cachedToken && Date.now() < tokenExpiry - 60000) {
        return cachedToken;
    }
    const data = [
        `client_id=${CLIENT_ID}`,
        `client_secret=${CLIENT_SECRET}`,
        `refresh_token=${REFRESH_TOKEN}`,
        `grant_type=refresh_token`,
    ].join('&');
    const res = await axios.post('https://accounts.google.com/o/oauth2/token', data);
    cachedToken = res.data.access_token;
    tokenExpiry = Date.now() + res.data.expires_in * 1000;
    return cachedToken;
}

function getHeader(headers, name) {
    const h = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return h ? h.value : '';
}

function getBodyData(payload) {
    if (payload.body && payload.body.data) return payload.body.data;
    if (payload.parts) {
        const html = payload.parts.find(p => p.mimeType === 'text/html');
        if (html?.body?.data) return html.body.data;
        for (const part of payload.parts) {
            const data = getBodyData(part);
            if (data) return data;
        }
    }
    return null;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// List emails — supports Gmail search query via ?q=
// Examples: ?q=to:user@gmail.com  ?q=is:unread  ?q=subject:invite
app.get('/api/emails', async (req, res) => {
    try {
        const token = await getAccessToken();
        const q = req.query.q || '';
        const maxResults = Math.min(parseInt(req.query.maxResults) || 50, 500);
        const params = new URLSearchParams({ maxResults });
        if (q) params.set('q', q);

        const listRes = await axios.get(
            `https://www.googleapis.com/gmail/v1/users/me/messages?${params}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        const messages = listRes.data.messages || [];

        // Fetch metadata in parallel (subject, from, to, date)
        const metaHeaders = ['From', 'To', 'Subject', 'Date'];
        const details = await Promise.all(
            messages.map(async (msg) => {
                const metaRes = await axios.get(
                    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}` +
                    `?format=metadata&${metaHeaders.map(h => `metadataHeaders=${h}`).join('&')}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                const d = metaRes.data;
                return {
                    id: d.id,
                    snippet: d.snippet,
                    isUnread: d.labelIds.includes('UNREAD'),
                    from: getHeader(d.payload.headers, 'From'),
                    to: getHeader(d.payload.headers, 'To'),
                    subject: getHeader(d.payload.headers, 'Subject'),
                    date: getHeader(d.payload.headers, 'Date'),
                };
            })
        );

        res.json({ emails: details, total: listRes.data.resultSizeEstimate || details.length });
    } catch (err) {
        console.error('List emails error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Get a single email's full body
app.get('/api/emails/:id', async (req, res) => {
    try {
        const token = await getAccessToken();
        const msgRes = await axios.get(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${req.params.id}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        const d = msgRes.data;
        const rawData = getBodyData(d.payload);
        const body = rawData
            ? Buffer.from(rawData, 'base64').toString('utf-8')
            : `<p>${d.snippet}</p>`;

        res.json({
            id: d.id,
            isUnread: d.labelIds.includes('UNREAD'),
            from: getHeader(d.payload.headers, 'From'),
            to: getHeader(d.payload.headers, 'To'),
            subject: getHeader(d.payload.headers, 'Subject'),
            date: getHeader(d.payload.headers, 'Date'),
            body,
        });
    } catch (err) {
        console.error('Get email error:', err.message);
        res.status(500).json({ error: err.message });
    }
});


app.listen(PORT, () => {
    console.log(`Gmail Inbox Viewer running at http://localhost:${PORT}`);
});
