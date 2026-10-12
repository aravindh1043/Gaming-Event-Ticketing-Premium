require("dotenv").config();
const path=require("path");
const express=require("express");
const cors=require("cors");
const bcrypt=require("bcryptjs");
const jwt=require("jsonwebtoken");
const {Pool}=require("pg");
const QRCode=require("qrcode");

const app=express();
const PORT=process.env.PORT||3000;
const JWT_SECRET=process.env.JWT_SECRET||"dev-secret-change-me";
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?{rejectUnauthorized:false}:false});

app.use(cors());
app.use(express.json({limit:"1mb"}));
const db=(q,p=[])=>pool.query(q,p).then(r=>r.rows);
const id=(p)=>p+Math.floor(100000+Math.random()*900000);
const token=u=>jwt.sign({id:u.id,email:u.email,name:u.name},JWT_SECRET,{expiresIn:"12h"});
function auth(req,res,next){const h=req.headers.authorization||"";if(!h.startsWith("Bearer "))return res.status(401).json({message:"Organizer login required."});try{req.user=jwt.verify(h.slice(7),JWT_SECRET);next()}catch{return res.status(401).json({message:"Session expired. Login again."})}}

async function init(){
 if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is missing.");
 await db(`CREATE TABLE IF NOT EXISTS organizers(id SERIAL PRIMARY KEY,name VARCHAR(120) NOT NULL,email VARCHAR(180) UNIQUE NOT NULL,password_hash TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS events(id SERIAL PRIMARY KEY,title VARCHAR(160) NOT NULL,game VARCHAR(100) NOT NULL,event_date DATE NOT NULL,venue VARCHAR(180) NOT NULL,price INTEGER NOT NULL CHECK(price>=0),capacity INTEGER NOT NULL CHECK(capacity>0),description TEXT DEFAULT '',created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS registrations(id SERIAL PRIMARY KEY,registration_id VARCHAR(30) UNIQUE NOT NULL,name VARCHAR(120) NOT NULL,email VARCHAR(180) NOT NULL,event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,event_name VARCHAR(160) NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS bookings(id SERIAL PRIMARY KEY,booking_id VARCHAR(30) UNIQUE NOT NULL,name VARCHAR(120) NOT NULL,email VARCHAR(180) NOT NULL,event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,event_name VARCHAR(160) NOT NULL,tickets INTEGER NOT NULL CHECK(tickets>0),total INTEGER NOT NULL CHECK(total>=0),tier VARCHAR(30) NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW());`);
 if((await db("SELECT COUNT(*)::int count FROM events"))[0].count===0)await db(`INSERT INTO events(title,game,event_date,venue,price,capacity,description) VALUES
 ('Neon Gaming Championship','Valorant','2026-11-15','Chennai Arena',350,500,'Competitive Valorant showdown with live audience energy.'),
 ('BGMI Masters','BGMI','2026-11-22','Chennai Convention Hall',300,800,'Squad battle royale tournament with exciting prizes.'),
 ('Free Fire Night League','Free Fire','2026-12-06','Coimbatore Esports Hub',250,600,'Fast-paced mobile esports tournament.'),
 ('Ultimate Gaming Fest','Multi Game','2026-12-20','Tamil Nadu Expo Centre',500,1000,'A full-day gaming festival with multiple tournaments.')`);
}

app.get("/api/health",async(req,res)=>{try{await db("SELECT 1");res.json({ok:true,database:"connected"})}catch(e){res.status(503).json({ok:false,database:"disconnected"})}});
app.get("/api/events",async(req,res)=>{try{res.json(await db(`SELECT e.*,COALESCE(SUM(b.tickets),0)::int booked_tickets FROM events e LEFT JOIN bookings b ON b.event_id=e.id GROUP BY e.id ORDER BY e.event_date,e.id`))}catch(e){res.status(500).json({message:"Could not load events."})}});
app.post("/api/organizers/register",async(req,res)=>{const{name,email,password}=req.body;if(!name||!email||!password||password.length<6)return res.status(400).json({message:"Name, email and a 6+ character password are required."});try{const hash=await bcrypt.hash(password,12),u=(await db("INSERT INTO organizers(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email",[name.trim(),email.trim().toLowerCase(),hash]))[0];res.status(201).json({organizer:u,token:token(u)})}catch(e){res.status(e.code==="23505"?409:500).json({message:e.code==="23505"?"Organizer email already exists.":"Organizer registration failed."})}});
app.post("/api/organizers/login",async(req,res)=>{try{const r=(await db("SELECT * FROM organizers WHERE email=$1",[(req.body.email||"").trim().toLowerCase()]))[0];if(!r||!(await bcrypt.compare(req.body.password||"",r.password_hash)))return res.status(401).json({message:"Invalid email or password."});const u={id:r.id,name:r.name,email:r.email};res.json({organizer:u,token:token(u)})}catch(e){res.status(500).json({message:"Login failed."})}});
app.post("/api/events",auth,async(req,res)=>{const{title,game,event_date,venue,price,capacity,description}=req.body;if(!title||!game||!event_date||!venue||Number(price)<0||Number(capacity)<1)return res.status(400).json({message:"Please fill all event fields."});try{res.status(201).json((await db("INSERT INTO events(title,game,event_date,venue,price,capacity,description) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",[title,game,event_date,venue,+price,+capacity,description||""]))[0])}catch(e){res.status(500).json({message:"Could not create event."})}});
app.delete("/api/events/:id",auth,async(req,res)=>{try{await db("DELETE FROM events WHERE id=$1",[req.params.id]);res.json({message:"Event deleted."})}catch(e){res.status(500).json({message:"Could not delete event."})}});
app.post("/api/registrations",async(req,res)=>{const{name,email,eventId}=req.body;if(!name||!email||!eventId)return res.status(400).json({message:"Name, email and event are required."});try{const e=(await db("SELECT * FROM events WHERE id=$1",[eventId]))[0];if(!e)return res.status(404).json({message:"Event not found."});res.status(201).json((await db("INSERT INTO registrations(registration_id,name,email,event_id,event_name) VALUES($1,$2,$3,$4,$5) RETURNING *",[id("REG"),name.trim(),email.trim(),e.id,e.title]))[0])}catch(e){res.status(500).json({message:"Registration failed."})}});
app.post("/api/bookings",async(req,res)=>{const{name,email,eventId,tickets}=req.body,t=Number(tickets);if(!name||!email||!eventId||!Number.isInteger(t)||t<1||t>10)return res.status(400).json({message:"Enter valid booking details."});try{const e=(await db("SELECT * FROM events WHERE id=$1",[eventId]))[0];if(!e)return res.status(404).json({message:"Event not found."});const used=(await db("SELECT COALESCE(SUM(tickets),0)::int n FROM bookings WHERE event_id=$1",[e.id]))[0].n;if(used+t>e.capacity)return res.status(409).json({message:`Only ${e.capacity-used} tickets are left.`});const total=e.price*t,tier=total>=1000?"Golden VIP":"Premium",bookingId=id("GET"),qr=await QRCode.toDataURL(JSON.stringify({bookingId,name,event:e.title,tickets:t,total,tier}),{width:260,margin:2});const row=(await db("INSERT INTO bookings(booking_id,name,email,event_id,event_name,tickets,total,tier) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",[bookingId,name.trim(),email.trim(),e.id,e.title,t,total,tier]))[0];res.status(201).json({...row,qrDataUrl:qr})}catch(e){console.error(e);res.status(500).json({message:"Booking failed."})}});
app.get("/api/admin/stats",auth,async(req,res)=>{try{const a=await db("SELECT COUNT(*)::int n FROM events"),b=await db("SELECT COUNT(*)::int n FROM registrations"),c=await db("SELECT COUNT(*)::int n FROM bookings"),d=await db("SELECT COALESCE(SUM(total),0)::int n FROM bookings");res.json({events:a[0].n,registrations:b[0].n,bookings:c[0].n,revenue:d[0].n})}catch(e){res.status(500).json({message:"Stats unavailable."})}});
app.get("/api/admin/overview",auth,async(req,res)=>{try{const[events,bookings,registrations]=await Promise.all([db("SELECT * FROM events ORDER BY event_date"),db("SELECT * FROM bookings ORDER BY created_at DESC LIMIT 100"),db("SELECT * FROM registrations ORDER BY created_at DESC LIMIT 100")]);res.json({events,bookings,registrations})}catch(e){res.status(500).json({message:"Dashboard unavailable."})}});

app.use(express.static(path.join(__dirname,"../frontend")));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"../frontend/index.html")));

init().then(()=>app.listen(PORT,"0.0.0.0",()=>console.log("GameVerse server running on port "+PORT))).catch(e=>{console.error(e);process.exit(1)});
