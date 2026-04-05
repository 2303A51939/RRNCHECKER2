# 🔍 RRN Checker — Payment Status Portal

A full-stack web application to check RRN (Reference Receipt Number) payment statuses for government schemes like MGNREGS, PMGSY, and PMJDY.

---

## 🚀 Features

| Feature | Details |
|---|---|
| 🔍 RRN Status Check | Real-time lookup by RRN |
| 🔐 OTP Login | Email OTP authentication (Nodemailer + Gmail) |
| 📊 Dashboard | Stats, history, analytics |
| 🤖 AI Chatbot | Built-in assistant for user queries |
| 👮 Admin Panel | Add/update payment records |
| 🏛️ Scheme Support | MGNREGS, PMGSY, PMJDY, Others |

---

## 🗂️ Project Structure

```
rrn-checker/
├── index.html          # Landing page (hero, features, chatbot, auth modal)
├── dashboard.html      # User dashboard
├── server.js           # Express backend + all API routes
├── package.json        # Dependencies
├── .env.example        # Environment variable template
└── README.md
```

---

## ⚙️ Setup Instructions

### 1. Prerequisites
- Node.js v18+
- MongoDB (local or MongoDB Atlas)
- Gmail account (for OTP emails)

### 2. Clone / Extract the project
```bash
cd rrn-checker
```

### 3. Install dependencies
```bash
npm install
```

### 4. Configure environment variables
```bash
cp .env.example .env
# Edit .env with your MongoDB URI, Gmail credentials, JWT secret
```

#### Getting Gmail App Password:
1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification**
3. Go to **App Passwords** → select "Mail" → "Other"
4. Copy the 16-character password → paste as `EMAIL_PASS` in `.env`

### 5. Start the server
```bash
npm run dev     # Development (with auto-restart)
# or
npm start       # Production
```

### 6. Open in browser
```
http://localhost:3000
```

### 7. Seed sample data (for testing)
```bash
curl -X POST http://localhost:3000/api/admin/seed
```

Then test with these RRNs:
- `942384710023` → SUCCESS
- `847261930011` → PENDING  
- `112938475562` → FAILED

---

## 🔌 API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/send-otp` | Send OTP to email |
| POST | `/api/auth/verify-otp` | Verify OTP → get JWT token |
| GET | `/api/auth/me` | Get current user (auth required) |

### RRN
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/rrn/:rrn` | Public RRN status check |
| GET | `/api/rrn/check/:rrn` | Authenticated check (saves history) |
| GET | `/api/history` | User's check history (auth) |
| GET | `/api/stats` | User stats (auth) |

### Admin
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/admin/payment` | Add payment record (admin) |
| PUT | `/api/admin/payment/:rrn` | Update payment status (admin) |
| POST | `/api/admin/seed` | Seed sample data |

---

## 🗄️ Database Schema

### Users
```js
{ name, email, mobile, role, isVerified, createdAt, lastLogin }
```

### Payments (RRN Records)
```js
{ rrn, payee, amount, scheme, bank, ifsc, accountNumber,
  district, state, status, transactionDate, remarks, updatedAt }
```

### OtpStore
```js
{ email, otp (hashed), expiresAt, used, createdAt }
// Auto-deleted after expiry via MongoDB TTL index
```

### CheckHistory
```js
{ userId, rrn, statusAtCheck, checkedAt }
```

---

## 🔐 Authentication Flow

```
User enters email
      ↓
POST /api/auth/send-otp
      ↓
6-digit OTP generated → hashed → stored in MongoDB
      ↓
OTP emailed via Gmail (Nodemailer)
      ↓
User enters OTP
      ↓
POST /api/auth/verify-otp
      ↓
OTP matched → JWT issued (7-day expiry)
      ↓
User is logged in ✅
```

---

## 🤖 AI Chatbot Integration

The chatbot in `index.html` and `dashboard.html` currently uses rule-based responses. To upgrade to real AI (Claude API):

```javascript
// Replace the botResponses lookup with:
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': 'YOUR_KEY', 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: 'You are RRN Assistant, a helpful chatbot for RRN payment status queries.',
    messages: [{ role: 'user', content: userMessage }]
  })
});
```

---

## 📦 Dependencies

| Package | Purpose |
|---|---|
| express | Web framework |
| mongoose | MongoDB ODM |
| nodemailer | Email sending (OTP) |
| jsonwebtoken | JWT auth tokens |
| bcryptjs | OTP hashing |
| dotenv | Environment variables |
| cors | Cross-origin support |

---

## 🛠️ Future Enhancements

- [ ] SMS OTP via Twilio/MSG91
- [ ] Google OAuth login
- [ ] PDF export of payment receipts
- [ ] Email alerts on RRN status change
- [ ] Admin dashboard UI
- [ ] Bulk RRN upload (CSV)
- [ ] Integration with NIC/PFMS APIs

---

Made with ❤️ for transparent government payment tracking in India.
