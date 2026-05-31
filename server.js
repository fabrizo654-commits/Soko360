require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── In-memory order store (use a database in production) ───
const orders = {};

// ─── M-Pesa Config ───
const MPESA_ENV     = process.env.MPESA_ENV || 'sandbox';
const BASE_URL      = MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

const CONSUMER_KEY    = process.env.MPESA_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET;
const SHORTCODE       = process.env.MPESA_SHORTCODE || '174379';
const PASSKEY         = process.env.MPESA_PASSKEY;
const CALLBACK_URL    = process.env.MPESA_CALLBACK_URL;

// ─── Helper: Get OAuth Token ───
async function getAccessToken() {
  const credentials = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
  const res = await axios.get(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` }
  });
  return res.data.access_token;
}

// ─── Helper: Generate timestamp & password ───
function getMpesaTimestamp() {
  return new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
}
function getMpesaPassword(timestamp) {
  return Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString('base64');
}

// ─── Helper: Format phone number to 254XXXXXXXXX ───
function formatPhone(phone) {
  let p = phone.toString().replace(/\s+/g, '').replace(/^0/, '254').replace(/^\+/, '');
  if (!p.startsWith('254')) p = '254' + p;
  return p;
}

// ════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════

// ── POST /api/orders — Create order & trigger STK Push ──
app.post('/api/orders', async (req, res) => {
  try {
    const { customer, phone, location, items, total, notes } = req.body;

    // Validate
    if (!customer || !phone || !items?.length || !total) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    const orderId  = 'MM-' + Date.now().toString().slice(-6);
    const formattedPhone = formatPhone(phone);

    // Save order (pending payment)
    orders[orderId] = {
      orderId, customer, phone: formattedPhone, location,
      items, total, notes,
      status: 'pending',
      createdAt: new Date().toISOString(),
      mpesaRef: null
    };

    // Trigger M-Pesa STK Push
    const token     = await getAccessToken();
    const timestamp = getMpesaTimestamp();
    const password  = getMpesaPassword(timestamp);

    const stkRes = await axios.post(
      `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: SHORTCODE,
        Password:          password,
        Timestamp:         timestamp,
        TransactionType:   'CustomerPayBillOnline',
        Amount:            Math.ceil(total),
        PartyA:            formattedPhone,
        PartyB:            SHORTCODE,
        PhoneNumber:       formattedPhone,
        CallBackURL:       CALLBACK_URL,
        AccountReference:  orderId,
        TransactionDesc:   `Mama Mboga Order ${orderId}`
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Store checkout request ID for callback matching
    orders[orderId].checkoutRequestId = stkRes.data.CheckoutRequestID;

    console.log(`✅ Order ${orderId} created. STK Push sent to ${formattedPhone}`);

    res.json({
      success:    true,
      orderId,
      message:    `M-Pesa prompt sent to ${phone}. Enter your PIN to complete payment.`,
      checkoutId: stkRes.data.CheckoutRequestID
    });

  } catch (err) {
    console.error('Order error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.errorMessage || 'Failed to process order. Please try again.'
    });
  }
});

// ── POST /api/mpesa/callback — Safaricom sends payment result here ──
app.post('/api/mpesa/callback', (req, res) => {
  try {
    const callback = req.body.Body?.stkCallback;
    if (!callback) return res.json({ ResultCode: 0 });

    const { ResultCode, ResultDesc, CallbackMetadata, CheckoutRequestID } = callback;

    // Find order by checkoutRequestId
    const order = Object.values(orders).find(o => o.checkoutRequestId === CheckoutRequestID);
    if (!order) return res.json({ ResultCode: 0 });

    if (ResultCode === 0) {
      // Payment successful
      const meta = CallbackMetadata?.Item || [];
      const getMeta = (name) => meta.find(i => i.Name === name)?.Value;

      order.status    = 'paid';
      order.mpesaRef  = getMeta('MpesaReceiptNumber');
      order.paidAt    = new Date().toISOString();
      order.amount    = getMeta('Amount');

      console.log(`💰 Payment confirmed! Order ${order.orderId} — Ref: ${order.mpesaRef}`);
    } else {
      order.status = 'payment_failed';
      order.failReason = ResultDesc;
      console.log(`❌ Payment failed for order ${order.orderId}: ${ResultDesc}`);
    }

    res.json({ ResultCode: 0 });
  } catch (err) {
    console.error('Callback error:', err);
    res.json({ ResultCode: 0 });
  }
});

// ── GET /api/orders/:id — Poll order status ──
app.get('/api/orders/:id', (req, res) => {
  const order = orders[req.params.id];
  if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
  res.json({
    success: true,
    orderId:  order.orderId,
    status:   order.status,
    mpesaRef: order.mpesaRef,
    customer: order.customer,
    total:    order.total,
    items:    order.items,
    paidAt:   order.paidAt
  });
});

// ── GET /api/orders — List all orders (owner dashboard) ──
app.get('/api/orders', (req, res) => {
  const list = Object.values(orders).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, total: list.length, orders: list });
});

// ── Serve frontend ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🥦 Mama Mboga server running on http://localhost:${PORT}`);
  console.log(`   Environment: ${MPESA_ENV}`);
  console.log(`   Shortcode:   ${SHORTCODE}\n`);
});
      
