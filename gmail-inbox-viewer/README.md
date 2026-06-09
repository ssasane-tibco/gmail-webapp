# Gmail Inbox Viewer

A simple web app to browse the automation Gmail inbox without giving users direct Gmail access.

## Features
- View latest emails from the automation Gmail inbox
- Filter by recipient (`To:`), read/unread status, subject keyword
- Renders full HTML email body in a sandboxed iframe
- Copy all links from an email (invite, activation, magic links)
- Read-only — no send, no delete

---

## Project Structure

```
gmail-inbox-viewer/
  server.js          # Express backend — proxies Gmail API
  public/index.html  # Web UI
  package.json       # Dependencies: express, axios, dotenv
  .env               # Local credentials (gitignored — create manually)
  .env.example       # Template for .env
  .gitignore         # Excludes .env and node_modules
```

---

## Local Setup

### 1. Install dependencies
```bash
cd tools/gmail-inbox-viewer
npm install
```

### 2. Create `.env` file with Gmail OAuth credentials
```bash
cp .env.example .env
```

Edit `.env`:
```
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REFRESH_TOKEN=your-refresh-token
PORT=3535
```

### 3. Start the app
```bash
npm start
```

Open: `http://localhost:3535`

---

## Getting a Gmail Refresh Token

The refresh token expires if unused for 6 months. To generate a new one:

1. Go to [Google OAuth Playground](https://developers.google.com/oauthplayground/)
2. Authorize scope: `https://www.googleapis.com/auth/gmail.readonly`
3. Use your Client ID and Client Secret
4. Exchange authorization code for tokens
5. Copy the `refresh_token` value into your `.env`

---

## Hosting on GCP VM

### Step 1 — Copy app to VM (from local machine)
```bash
gcloud compute scp --recurse \
  tools/gmail-inbox-viewer \
  <VM-NAME>:~/gmail-inbox-viewer \
  --zone=<ZONE>
```

### Step 2 — SSH into the VM
```bash
gcloud compute ssh <VM-NAME> --zone=<ZONE>
```

### Step 3 — Install Node.js (RHEL/CentOS based VM)
```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs
node -v
```

> For Debian/Ubuntu VMs use:
> ```bash
> curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
> sudo apt-get install -y nodejs
> ```

### Step 4 — Clone from GitHub (alternative to scp)
```bash
git clone https://github.com/ssasane-tibco/gmail-webapp.git
cd gmail-webapp/gmail-inbox-viewer
```

### Step 5 — Install dependencies
```bash
npm install
npm install dotenv   # if dotenv is missing after clone
```

### Step 6 — Create `.env` file on the VM
```bash
cat > .env << 'EOF'
GMAIL_CLIENT_ID=your-client-id
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REFRESH_TOKEN=your-refresh-token
PORT=3535
EOF
```

### Step 7 — Run with PM2 (persists after SSH disconnect)
```bash
npm install -g pm2
pm2 start server.js --name gmail-inbox-viewer
pm2 save
pm2 startup   # follow the printed command to survive reboots
```

### Step 8 — Open firewall port on GCP
```bash
# Authenticate gcloud on the VM if needed
gcloud auth login --no-launch-browser

# Create firewall rule
gcloud compute firewall-rules create allow-gmail-viewer \
  --allow=tcp:3535 \
  --source-ranges=0.0.0.0/0 \
  --direction=INGRESS \
  --project=<YOUR-PROJECT-ID>
```

Or via GCP Console: **VPC Network → Firewall → Create Rule → TCP 3535**

### Step 9 — Get external IP
```bash
curl -s ifconfig.me
```

Open: `http://<EXTERNAL-IP>:3535`

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Cannot find module 'dotenv'` | Run `npm install dotenv` in the app directory |
| PM2 status shows `errored` | Run `pm2 logs gmail-inbox-viewer --lines 30` to see error, then `pm2 delete gmail-inbox-viewer` and restart |
| `invalid_grant` from Google | Refresh token expired — generate a new one via OAuth Playground |
| Site can't be reached (public IP) | Check app is listening on `0.0.0.0`: run `ss -tlnp | grep 3535`. Also verify firewall rule exists |
| `gcloud: You do not have an active account` | Run `gcloud auth login --no-launch-browser` on the VM |
| Node install fails on RHEL | Use `rpm.nodesource.com` instead of `deb.nodesource.com` |

---

## PM2 Commands

```bash
pm2 status                          # Check app status
pm2 logs gmail-inbox-viewer         # View live logs
pm2 restart gmail-inbox-viewer      # Restart app
pm2 delete gmail-inbox-viewer       # Remove from PM2
pm2 start server.js --name gmail-inbox-viewer  # Start fresh
```

---

## Security Notes

- The `.env` file is gitignored — never commit it
- The Gmail OAuth token has full `https://mail.google.com/` scope — keep it private
- The firewall rule `0.0.0.0/0` allows all IPs — restrict to your office/VPN IP range for tighter security:
  ```bash
  gcloud compute firewall-rules update allow-gmail-viewer \
    --source-ranges=<YOUR-IP>/32
  ```
