// ─────────────────────────────────────────────────────────
//  RRN Checker — Backend (Node.js + Express + MongoDB)
//  File: server.js
//  Run: node server.js
// ─────────────────────────────────────────────────────────

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // serves index.html, dashboard.html

// ── ENV VARIABLES (.env file) ──────────────────────────────
// MONGO_URI=mongodb://localhost:27017/rrn_checker
// JWT_SECRET=your_super_secret_key
// EMAIL_USER=your_gmail@gmail.com
// EMAIL_PASS=your_app_password     (Gmail App Password)
// PORT=3000

// ── MONGODB CONNECTION ─────────────────────────────────────
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/rrn_checker')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ─────────────────────────────────────────────────────────
//  SCHEMAS & MODELS
// ─────────────────────────────────────────────────────────

// User
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  mobile: String,
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  isVerified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  lastLogin: Date,
});
const User = mongoose.model('User', userSchema);

// OTP Store
const otpSchema = new mongoose.Schema({
  email: { type: String, required: true },
  otp: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index
const OtpStore = mongoose.model('OtpStore', otpSchema);

// Payment / RRN Record
const paymentSchema = new mongoose.Schema({
  rrn: { type: String, required: true, unique: true, index: true },
  payee: { type: String, required: true },
  amount: { type: Number, required: true },
  scheme: { type: String, enum: ['MGNREGS', 'PMGSY', 'PMJDY', 'OTHER'], default: 'OTHER' },
  bank: String,
  ifsc: String,
  accountNumber: String,
  district: String,
  state: String,
  status: { type: String, enum: ['SUCCESS', 'PENDING', 'FAILED', 'REVERSED'], default: 'PENDING' },
  transactionDate: Date,
  remarks: String,
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});
const Payment = mongoose.model('Payment', paymentSchema);

// Check History (user's lookup history)
const checkHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rrn: String,
  statusAtCheck: String,
  checkedAt: { type: Date, default: Date.now },
});
const CheckHistory = mongoose.model('CheckHistory', checkHistorySchema);

// ─────────────────────────────────────────────────────────
//  EMAIL TRANSPORTER (Nodemailer)
// ─────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendOtpEmail(email, otp, name = 'User') {
  const mailOptions = {
    from: `"RRN Checker" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: '🔐 Your OTP for RRN Checker Login',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f4f1eb; border-radius: 16px;">
        <h2 style="font-size: 24px; color: #0a0f1e; margin-bottom: 8px;">Hello, ${name}!</h2>
        <p style="color: #6b7280; margin-bottom: 28px;">Your one-time password to login to RRN Checker:</p>
        <div style="text-align: center; margin: 28px 0;">
          <div style="display: inline-block; background: #0a0f1e; color: #fff;
            font-size: 36px; font-weight: 900; letter-spacing: 16px;
            padding: 20px 32px; border-radius: 12px;">
            ${otp}
          </div>
        </div>
        <p style="color: #6b7280; font-size: 13px; text-align: center;">
          This OTP is valid for <strong>10 minutes</strong>. Do not share it with anyone.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e1d8; margin: 24px 0;"/>
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">
          RRN Checker — Secure Payment Verification Portal
        </p>
      </div>
    `,
  };
  await transporter.sendMail(mailOptions);
}

// ─────────────────────────────────────────────────────────
//  MIDDLEWARE
// ─────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'rrnchecker_secret');
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─────────────────────────────────────────────────────────
//  AUTH ROUTES
// ─────────────────────────────────────────────────────────

// POST /api/auth/send-otp
// Body: { email, name (optional for register) }
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    // Delete any existing OTPs for this email
    await OtpStore.deleteMany({ email });

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save hashed OTP
    const hashedOtp = await bcrypt.hash(otp, 10);
    await OtpStore.create({ email, otp: hashedOtp, expiresAt });

    // Send email
    await sendOtpEmail(email, otp, name || 'User');

    res.json({ success: true, message: `OTP sent to ${email}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send OTP. Check email configuration.' });
  }
});

// POST /api/auth/verify-otp
// Body: { email, otp, name (for registration) }
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp, name, mobile } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });

    // Find latest unused OTP
    const otpRecord = await OtpStore.findOne({ email, used: false, expiresAt: { $gt: new Date() } });
    if (!otpRecord) return res.status(400).json({ error: 'OTP expired or not found. Please request a new one.' });

    // Verify OTP
    const valid = await bcrypt.compare(otp, otpRecord.otp);
    if (!valid) return res.status(400).json({ error: 'Incorrect OTP' });

    // Mark OTP as used
    await OtpStore.findByIdAndUpdate(otpRecord._id, { used: true });

    // Upsert user
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({ email, name: name || email.split('@')[0], mobile, isVerified: true });
    } else {
      await User.findByIdAndUpdate(user._id, { isVerified: true, lastLogin: new Date() });
    }

    // Issue JWT
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'rrnchecker_secret',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// GET /api/auth/me  (protected)
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.userId).select('-__v');
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// ─────────────────────────────────────────────────────────
//  RRN / PAYMENT ROUTES
// ─────────────────────────────────────────────────────────

// GET /api/rrn/:rrn  — Public check
app.get('/api/rrn/:rrn', async (req, res) => {
  try {
    const { rrn } = req.params;
    if (!rrn || rrn.length < 8) return res.status(400).json({ error: 'Invalid RRN format' });

    const payment = await Payment.findOne({ rrn: rrn.trim() });
    if (!payment) return res.status(404).json({ error: 'No payment record found for this RRN', rrn });

    res.json({
      success: true,
      data: {
        rrn: payment.rrn,
        status: payment.status,
        payee: payment.payee,
        amount: payment.amount,
        scheme: payment.scheme,
        bank: payment.bank,
        district: payment.district,
        state: payment.state,
        transactionDate: payment.transactionDate,
        updatedAt: payment.updatedAt,
        remarks: payment.remarks,
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/rrn/check/:rrn  — Authenticated check with history save
app.get('/api/rrn/check/:rrn', authMiddleware, async (req, res) => {
  try {
    const { rrn } = req.params;
    const payment = await Payment.findOne({ rrn: rrn.trim() });

    // Save to history
    await CheckHistory.create({
      userId: req.user.userId,
      rrn,
      statusAtCheck: payment ? payment.status : 'NOT_FOUND',
    });

    if (!payment) return res.status(404).json({ error: 'RRN not found', rrn });
    res.json({ success: true, data: payment });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/history  — User's check history (protected)
app.get('/api/history', authMiddleware, async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const history = await CheckHistory.find({ userId: req.user.userId })
    .sort({ checkedAt: -1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit));
  const total = await CheckHistory.countDocuments({ userId: req.user.userId });
  res.json({ history, total, page: parseInt(page) });
});

// GET /api/stats  — User's stats (protected)
app.get('/api/stats', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const total = await CheckHistory.countDocuments({ userId });
  const success = await CheckHistory.countDocuments({ userId, statusAtCheck: 'SUCCESS' });
  const pending = await CheckHistory.countDocuments({ userId, statusAtCheck: 'PENDING' });
  const failed = await CheckHistory.countDocuments({ userId, statusAtCheck: 'FAILED' });
  res.json({ total, success, pending, failed });
});

// ─────────────────────────────────────────────────────────
//  ADMIN ROUTES (add/update payment records)
// ─────────────────────────────────────────────────────────

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access only' });
  next();
}

// POST /api/admin/payment  — Add payment record
app.post('/api/admin/payment', authMiddleware, adminOnly, async (req, res) => {
  try {
    const payment = await Payment.create(req.body);
    res.status(201).json({ success: true, data: payment });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/admin/payment/:rrn  — Update payment status
app.put('/api/admin/payment/:rrn', authMiddleware, adminOnly, async (req, res) => {
  try {
    const updated = await Payment.findOneAndUpdate(
      { rrn: req.params.rrn },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'RRN not found' });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/admin/seed  — Seed sample data for testing
app.post('/api/admin/seed', async (req, res) => {
  const samples = [
    { rrn: '942384710023', payee: 'Ramu Krishna', amount: 12500, scheme: 'MGNREGS', bank: 'SBI', ifsc: 'SBIN0004821', district: 'Kadapa', state: 'Andhra Pradesh', status: 'SUCCESS', transactionDate: new Date('2025-01-23') },
    { rrn: '847261930011', payee: 'Sita Devi', amount: 8200, scheme: 'PMGSY', bank: 'Canara Bank', ifsc: 'CNRB0002813', district: 'Kurnool', state: 'Andhra Pradesh', status: 'PENDING', transactionDate: new Date('2025-01-21') },
    { rrn: '112938475562', payee: 'Venkat Rao', amount: 5000, scheme: 'PMJDY', bank: 'Andhra Bank', ifsc: 'ANDB0000421', district: 'Nellore', state: 'Andhra Pradesh', status: 'FAILED', transactionDate: new Date('2025-01-20') },
    { rrn: '334910283746', payee: 'Anand Kumar', amount: 22000, scheme: 'PMGSY', bank: 'Bank of Baroda', ifsc: 'BARB0KADAPA', district: 'Guntur', state: 'Andhra Pradesh', status: 'SUCCESS', transactionDate: new Date('2025-01-19') },
  ];
  for (const s of samples) {
    await Payment.findOneAndUpdate({ rrn: s.rrn }, s, { upsert: true, new: true });
  }
  res.json({ success: true, message: `${samples.length} sample records seeded` });
});

// ─────────────────────────────────────────────────────────
//  START SERVER
// ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 RRN Checker API running on http://localhost:${PORT}`);
  console.log(`📋 Endpoints:`);
  console.log(`   POST /api/auth/send-otp`);
  console.log(`   POST /api/auth/verify-otp`);
  console.log(`   GET  /api/rrn/:rrn`);
  console.log(`   GET  /api/history  (auth)`);
  console.log(`   GET  /api/stats    (auth)`);
  console.log(`   POST /api/admin/seed`);
});
