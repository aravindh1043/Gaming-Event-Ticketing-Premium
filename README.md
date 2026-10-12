# GameVerse — Gaming Event Ticketing

Premium full-stack capstone version.

## Features
- Premium gaming UI
- Event listing
- Participant registration stored in PostgreSQL
- Ticket booking stored in PostgreSQL
- Automatic Premium / Golden VIP tier (₹1000+)
- QR ticket
- Print / save ticket
- Organizer registration + login
- Organizer dashboard
- Create/delete events
- Booking, registration and revenue stats
- Render Blueprint with PostgreSQL

## Local
1. Install Node.js.
2. Create PostgreSQL database.
3. Copy `.env.example` to `.env` and set DATABASE_URL + JWT_SECRET.
4. `npm install`
5. `npm start`
6. Open http://localhost:3000

## Render
The included `render.yaml` creates a Web Service and PostgreSQL database. Deploy the repository as a Blueprint. No frontend static-site deployment is needed because the Node server serves the frontend.
