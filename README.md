#  Mama Mboga — M-Pesa Ordering System

A full-stack fresh produce shop with real M-Pesa STK Push payments.

---

## Quick Start (5 steps)

### 1. Get Daraja Credentials
1. Go to [developer.safaricom.co.ke](https://developer.safaricom.co.ke)
2. Sign up / log in → **Create App** → enable **Lipa Na M-Pesa Sandbox**
3. From your app's **App Credentials** tab, copy:
   - Consumer Key
   - Consumer Secret
4. From the **Lipa Na M-Pesa** tab, copy the **Passkey**

### 2. Configure Your Environment
```bash
cp .env.example .env
# Open .env in a text editor and fill in your 4 values:
#   MPESA_CONSUMER_KEY
#   MPESA_CONSUMER_SECRET
#   MPESA_PASSKEY
#   MPESA_RECEIVER_PHONE
```

### 3. Set Up a Callback URL (ngrok)
M-Pesa needs a public HTTPS URL to send payment confirmations.
```bash
# Install ngrok (once): https://ngrok.com/download
ngrok http 3000
# Copy the https://xxxx.ngrok.io URL and set in .env:
# MPESA_CALLBACK_URL=https://xxxx.ngrok.io/api/mpesa/callback
```

### 4. Run the Server
```bash
# Option A — guided start (validates .env first):
./start.sh

# Option B — manual:
npm install
npm run dev
```

### 5. Test a Payment
- Open http://localhost:3000
- Add items to cart → Checkout
- Use Safaricom test phone: **254708374149**
- Enter any 4-digit PIN when prompted

---

## API Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| `POST` | `/api/orders` | Create order + trigger STK Push |
| `GET`  | `/api/orders/:id` | Poll payment status |
| `GET`  | `/api/orders` | List all orders (owner dashboard) |
| `POST` | `/api/mpesa/callback` | Safaricom posts payment result here |

---

## Payment Flow

```
Customer places order
     ↓
Server calls Daraja STK Push
     ↓
Customer's phone: M-Pesa PIN prompt
     ↓
Customer enters PIN
     ↓
Safaricom hits /api/mpesa/callback
     ↓
Order marked as "paid" ✅
```

---

## Going Live (Production)

1. Apply for **Go Live** on the Daraja dashboard (1–3 business days)
2. You'll receive production Consumer Key, Secret, and Shortcode
3. Update `.env`:
   ```
   MPESA_ENV=production
   MPESA_CONSUMER_KEY=<production key>
   MPESA_CONSUMER_SECRET=<production secret>
   MPESA_SHORTCODE=<your real till number>
   MPESA_CALLBACK_URL=https://your-live-domain.com/api/mpesa/callback
   ```

### Free Deployment on Render
1. Push code to GitHub (make sure `.env` is in `.gitignore`)
2. [render.com](https://render.com) → New Web Service → connect repo
3. Build command: `npm install` | Start command: `node server.js`
4. Add your environment variables in the Render dashboard
5. Use your Render URL as `MPESA_CALLBACK_URL`

---

## Security Notes
- **Never** share or commit your `.env` file
- Credentials go directly into `.env` on your machine — not in chat
- The `.gitignore` already excludes `.env`
