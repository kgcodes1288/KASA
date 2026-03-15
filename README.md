# 🧹 CleanStay — Airbnb Cleaning Manager

A full-stack web app for Airbnb hosts to manage cleaning between guest stays.

## Features

- **Host** role: Create listings, add rooms with cleaning checklists, assign cleaners, trigger iCal syncs
- **Cleaner** role: See assigned jobs, tick off checklist items room by room
- **iCal sync**: Polls Airbnb's calendar feed every hour — auto-creates cleaning jobs on checkout
- **SMS alerts**: Twilio notifies cleaners when a new job is assigned

---

## Stack

| Layer    | Tech                          |
|----------|-------------------------------|
| Frontend | React 18 + Vite               |
| Backend  | Node.js + Express             |
| Database | MongoDB + Mongoose            |
| SMS      | Twilio                        |
| Calendar | Airbnb iCal feed (node-ical)  |

---

## Getting started

### 1. Clone & install

```bash
# Backend
cd server
npm install
cp .env.example .env   # fill in your values

# Frontend
cd ../client
npm install
```

### 2. Configure environment

Edit `server/.env`:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/airbnb-cleaner
JWT_SECRET=your_secret_here

TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE=+15005550006
```

### 3. Run

```bash
# Terminal 1 — backend
cd server && npm run dev

# Terminal 2 — frontend
cd client && npm run dev
```

App runs at `http://localhost:5173`, API at `http://localhost:5000`.

---

## How iCal sync works

1. Add an Airbnb iCal URL to a listing (Airbnb → Listing → Availability → Export calendar)
2. The server polls all listing feeds **every hour**
3. When a checkout event is detected, a cleaning **Job** is created for each room in the listing
4. The assigned cleaner receives an **SMS** with the checkout date
5. Hosts can also trigger a manual sync from the listing detail page

---

## User roles

| Role    | Capabilities                                                      |
|---------|-------------------------------------------------------------------|
| Host    | Create listings, manage rooms & checklists, assign cleaners, sync |
| Cleaner | View assigned jobs, tick off checklist items                      |
