# Complete Setup Guide

## Prerequisites
- Windows 10/11
- Python 3.11 (installed to C:\Python311\)
- Node.js LTS
- MongoDB (local or cloud)

## Step 1: Install MongoDB

1. Download: https://www.mongodb.com/try/download/community
2. Run installer with "Install as Service" checked
3. Verify: Open CMD and run `mongod --version`

## Step 2: Install Python 3.11

1. Download: https://www.python.org/downloads/release/python-3119/
2. Install to: C:\Python311\
3. **Do NOT check "Add Python to PATH"** if you have Python 3.13
4. Verify: `C:\Python311\python.exe --version`

## Step 3: Install Node.js LTS

1. Download: https://nodejs.org
2. Install with defaults
3. Verify: `node --version` and `npm --version`

## Step 4: Configure Backend

```bash
cd backend
copy .env.example .env
```

Edit `.env`:
```
MONGO_URI=mongodb://localhost:27017/gesture_explorer_elite
JWT_SECRET_KEY=your_secret_key_here
```

## Step 5: Setup Backend Environment

```bash
cd backend
C:\Python311\python.exe -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

## Step 6: Setup Frontend

```bash
cd frontend
npm install
```

## Step 7: Run Application

**Terminal 1 (Backend):**
```bash
cd backend
venv\Scripts\activate
python app.py
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```

## Step 8: Access Application

Open browser: http://localhost:5173

## Troubleshooting

**MediaPipe Error:** Make sure using Python 3.11 (not 3.13)
- Run: `C:\Python311\python.exe -m pip install mediapipe`

**MongoDB Connection Error:** Make sure MongoDB service is running
- Run: `net start MongoDB`

**Port Already in Use:**
- Backend: Change port in app.py (last line)
- Frontend: Change in vite.config.js

**npm Install Fails:**
- Run: `npm install --legacy-peer-deps`

## Production Deployment

For production:
1. Change FLASK_ENV=production in .env
2. Use MongoDB Atlas (cloud) instead of local
3. Build frontend: `npm run build`
4. Deploy using Gunicorn/Nginx

