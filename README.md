# aurafit-backend

Backend for AuraFit AI. Hosts the Gemini AI calls (meal photo analysis, weekly meal/workout
plan generation, AI coach chat, etc.) server-side so the Gemini API key never ships inside
any client (web, Android, or future iOS build).

## Architecture

This is a **thin AI proxy**, not a full backend-for-frontend:
- **Auth + user data (Firestore) stay client-side**, exactly as they work today in the
  `aurafit-ai` frontend \u2014 Firebase Auth and Firestore's client SDK are secure by design via
  Firestore security rules, and this preserves real-time sync (`onSnapshot`) for meals/workouts/profile.
- **Only the 10 Gemini-backed functions** (previously in `aurafit-ai/services/geminiService.ts`)
  moved here, unchanged in logic/prompts/schemas \u2014 just relocated so the API key lives server-side.
- Every request must carry a valid **Firebase ID token** (`Authorization: Bearer <token>`) from
  the already-signed-in Firebase user. This backend verifies it via `firebase-admin` and rejects
  anything else with 401. There's no separate login system to build or maintain.

## API

All routes below are under `/api/ai` and require `Authorization: Bearer <Firebase ID token>`.

| Method | Path | Body | Mirrors frontend function |
|---|---|---|---|
| POST | `/analyze-meal-image` | `{ base64Image, profile }` | `analyzeMealImage` |
| POST | `/parse-meal-text` | `{ text, profile }` | `parseMealText` |
| POST | `/weekly-meal-plan` | `{ profile }` | `generateWeeklyMealPlan` |
| POST | `/weekly-workout-plan` | `{ profile }` | `generateWeeklyWorkoutPlan` |
| POST | `/grocery-list` | `{ mealPlan }` | `generateGroceryList` |
| POST | `/meal-alternative` | `{ profile, type, currentMeal }` | `generateMealAlternative` |
| POST | `/recalibrate-workout-plan` | `{ profile, currentPlan, missedDays }` | `recalibrateRemainingPlan` |
| POST | `/daily-workout` | `{ profile, fatigueLevel, historyNotes }` | `generateDailyWorkout` |
| POST | `/specialized-workout` | `{ profile, target, muscles }` | `generateSpecializedWorkout` |
| POST | `/coaching-advice` | `{ profile, dailyStats, message }` | `getCoachingAdvice` \u2192 returns `{ advice: string }` |
| POST | `/live-session-token` | _(none)_ | Mints a short-lived Gemini Live API ephemeral token \u2192 `{ token: string }`. Used for the voice meal-logging feature: the client uses this token to open its own low-latency audio session directly with Gemini (not relayed through this backend), so the long-lived `GEMINI_API_KEY` never leaves the server while audio streaming stays fast. Single-use, expires in 5 minutes if unused. |

`GET /health` (no auth) returns `{ status: 'ok' }` for load balancer / uptime checks.

## Local development

```bash
npm install
cp .env.example .env   # fill in GEMINI_API_KEY and Firebase Admin credentials, see below
npm run dev            # nodemon + ts-node, restarts on file changes
```

Server listens on `PORT` (default `8080`).

### Firebase Admin credentials

Get a service account key from **Firebase Console \u2192 Project Settings \u2192 Service Accounts \u2192
Generate new private key**, then either:
- Base64-encode it and set `FIREBASE_SERVICE_ACCOUNT_BASE64` in `.env` (recommended \u2014 works
  cleanly with systemd `EnvironmentFile=`), or
- Save the JSON file on disk and point `GOOGLE_APPLICATION_CREDENTIALS` at its path instead.

## Build

```bash
npm run build   # tsc -> dist/
npm start        # node dist/server.js
```

## Deploying to AWS EC2

Artifacts are in `deploy/`:
- `setup-ec2.sh` \u2014 one-time instance setup (installs Node 20, copies the app to
  `/opt/aurafit-backend`, installs the systemd service, starts it)
- `aurafit-backend.service` \u2014 systemd unit (auto-restart on crash, logs to
  `/var/log/aurafit-backend.log`)
- `nginx.conf` \u2014 reverse proxy from port 80/443 \u2192 `127.0.0.1:8080`, ready for `certbot`

### First-time deploy

```bash
# From your machine:
scp -i your-key.pem -r . ubuntu@<ec2-ip>:~/aurafit-backend
ssh -i your-key.pem ubuntu@<ec2-ip>

# On the EC2 instance:
cd aurafit-backend
cp .env.example .env && nano .env   # fill in real values
chmod +x deploy/setup-ec2.sh
sudo ./deploy/setup-ec2.sh

# Then set up HTTPS (also printed at the end of setup-ec2.sh):
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/aurafit-backend
sudo ln -s /etc/nginx/sites-available/aurafit-backend /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.yourdomain.com
```

Make sure the EC2 security group allows inbound **80** and **443** (and **22** for your IP).

### Redeploying after code changes

```bash
ssh -i your-key.pem ubuntu@<ec2-ip>
cd aurafit-backend && git pull   # or re-scp/rsync
sudo rsync -a --exclude node_modules --exclude .git ./ /opt/aurafit-backend/
cd /opt/aurafit-backend
sudo npm ci && sudo npm run build
sudo systemctl restart aurafit-backend
```

### Docker alternative

A `Dockerfile` is included if you'd rather run this in a container on EC2 (e.g. behind an
ALB) instead of systemd directly:

```bash
docker build -t aurafit-backend .
docker run -d -p 8080:8080 --env-file .env --name aurafit-backend aurafit-backend
```

## Frontend integration

The `aurafit-ai` frontend calls this via `VITE_API_BASE_URL` (see its `.env.local`), attaching
the current Firebase user's ID token on every request. Point it at:
- `http://localhost:8080` during local development
- `https://api.yourdomain.com` once deployed
