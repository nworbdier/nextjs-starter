# NextJS Affiliate System Setup Guide

This guide outlines the complete setup of an affiliate system in a NextJS application, including database schema, API routes, frontend implementation, and Stripe integration.

## Database Schema

### Users Table Extensions

```typescript
// Add these fields to your users table
isAffiliate: boolean("is_affiliate").default(false),
affiliate_paymentEmail: text("affiliate_payment_email"),
```

### Affiliate Tables

```typescript
// Affiliate table
export const affiliates = pgTable("affiliates", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  affiliateCode: text("affiliate_code").notNull().unique(),
  commissionRate: decimal("commission_rate").notNull().default("0.50"),
  paymentEmail: text("payment_email").notNull().unique(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Referrals table
export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  affiliateId: integer("affiliate_id").references(() => affiliates.id),
  orderId: text("order_id").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  priceId: text("price_id"),
  commissionAmount: decimal("commission_amount", {
    precision: 10,
    scale: 2,
  }).notNull(),
  status: text("status").notNull().default("pending"),
  customerEmail: text("customer_email").notNull(),
  subscriptionId: text("subscription_id"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

## Utility Functions

### Affiliate Code Generation and Management

```javascript
// affiliate-utils.js
import { db } from "@/db";
import { affiliates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

// Generate unique affiliate code
export async function generateAffiliateCode() {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const length = 8;
  let code;

  do {
    code = "";
    for (let i = 0; i < length; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    const existing = await db
      .select()
      .from(affiliates)
      .where(eq(affiliates.affiliateCode, code))
      .limit(1);

    if (existing.length === 0) break;
  } while (true);

  return code;
}

// Get affiliate code from cookie
export async function getAffiliateCodeFromCookie() {
  const cookieStore = await cookies();
  const affiliateRef = cookieStore.get("affiliate_ref");
  return affiliateRef?.value;
}

// Set affiliate cookie
export async function setAffiliateCookie(affiliateCode) {
  const cookieStore = await cookies();
  const cookieValue = {
    name: "affiliate_ref",
    value: affiliateCode,
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  };
  await cookieStore.set(cookieValue);
}

// Calculate commission
export async function calculateCommission(amount, affiliateCode) {
  const affiliate = await db
    .select()
    .from(affiliates)
    .where(eq(affiliates.affiliateCode, affiliateCode))
    .limit(1);

  if (!affiliate.length) {
    return 0;
  }

  const commission = amount * Number(affiliate[0].commissionRate);
  return commission;
}
```

## Middleware Setup

Add this to your middleware.js to handle affiliate referral tracking:

```javascript
// Handle affiliate referral tracking
const affiliateCode = request.nextUrl.searchParams.get("ref");

if (affiliateCode) {
  response.cookies.set({
    name: "affiliate_ref",
    value: affiliateCode,
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
```

## Implementation Steps

1. **Database Setup**

   - Run the database migrations to create the affiliate and referral tables
   - Add the affiliate-related fields to your users table

2. **Utility Functions**

   - Create the affiliate-utils.js file with the provided utility functions
   - Import and use these functions in your API routes and components

3. **Middleware Configuration**

   - Add the affiliate tracking code to your middleware.js
   - This will handle storing affiliate referral codes in cookies

4. **API Routes**

   - Create routes for:
     - Registering new affiliates
     - Updating affiliate information
     - Retrieving affiliate statistics
     - Managing referrals
     - Processing commissions

5. **Frontend Implementation**
   - Create an affiliate dashboard for users to:
     - View their affiliate status
     - Get their affiliate link
     - Track referrals and earnings
     - Update payment information

## Security Considerations

1. Always validate affiliate codes before processing
2. Implement rate limiting on affiliate-related endpoints
3. Secure payment information and commission calculations
4. Validate user permissions for affiliate actions
5. Implement proper error handling and logging

## Testing

1. Test affiliate code generation and uniqueness
2. Verify referral tracking through cookies
3. Test commission calculations
4. Verify referral attribution
5. Test payment processing and status updates

## Monitoring and Maintenance

1. Monitor affiliate sign-ups and activity
2. Track commission payments and disputes
3. Monitor for potential fraud or abuse
4. Regular database maintenance and optimization
5. Keep payment processing systems updated

## Best Practices

1. Use secure cookies for tracking
2. Implement proper error handling
3. Use database transactions for critical operations
4. Keep detailed logs of all affiliate activities
5. Regular backups of affiliate data
6. Clear documentation for affiliate terms and conditions

## Stripe Integration

### Setup Requirements

```javascript
// Environment variables needed
STRIPE_SECRET_KEY = your_stripe_secret_key;
STRIPE_WEBHOOK_SECRET = your_webhook_secret;
```

### Webhook Handler

```javascript
// src/app/api/stripe/webhook/route.js
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { db } from "@/db";
import { users, stripeEvents, affiliates, referrals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { calculateCommission } from "@/lib/affiliate-utils";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Disable body parsing for webhook
export const config = {
  api: {
    bodyParser: false,
  },
};

async function handleAffiliateCommission(session) {
  try {
    const affiliateCode = session.metadata?.affiliateCode;
    if (!affiliateCode) return;

    // Validate the customer isn't using their own affiliate code
    const customerEmail = session.customer_details?.email;

    const affiliate = await db
      .select()
      .from(affiliates)
      .where(eq(affiliates.affiliateCode, affiliateCode))
      .limit(1);

    if (!affiliate.length || affiliate[0].status !== "active") return;

    // Prevent self-referral
    if (affiliate[0].paymentEmail === customerEmail) return;

    const amount = session.amount_total / 100;
    const commissionAmount = await calculateCommission(amount, affiliateCode);
    const priceId = session.line_items?.data[0]?.price?.id;

    await db.insert(referrals).values({
      affiliateId: affiliate[0].id,
      orderId: session.id,
      amount,
      priceId,
      commissionAmount,
      status: "pending",
      customerEmail,
      subscriptionId: session.subscription,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("Error handling affiliate commission:", error);
  }
}

export async function POST(request) {
  const body = await request.text();
  const sig = headers().get("stripe-signature");

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  // Handle the event
  switch (event.type) {
    case "checkout.session.completed":
      await handleAffiliateCommission(event.data.object);
      break;
  }

  return NextResponse.json({ received: true });
}
```

### Checkout Integration

When creating a Stripe checkout session, include the affiliate code in the metadata:

```javascript
const session = await stripe.checkout.sessions.create({
  ...checkoutOptions,
  metadata: {
    affiliateCode: affiliateCode, // From cookie or query param
  },
});
```

## Admin Dashboard

### Affiliate Management Dashboard

```javascript
// src/app/(admin)/affiliates/page.js
function AffiliateDashboard() {
  const [affiliate, setAffiliate] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [totalCommission, setTotalCommission] = useState(0);

  // Fetch affiliate data
  const fetchAffiliateData = async () => {
    const response = await fetch("/api/affiliates");
    const data = await response.json();
    setAffiliate(data);
    await fetchReferrals();
  };

  // Fetch referrals
  const fetchReferrals = async () => {
    const response = await fetch("/api/affiliates/referrals");
    const data = await response.json();
    setReferrals(data);
  };

  // Calculate total commission
  useEffect(() => {
    const total = referrals.reduce(
      (sum, ref) => sum + Number(ref.commissionAmount),
      0
    );
    setTotalCommission(total);
  }, [referrals]);

  return (
    <div className="container">
      <h1>Affiliate Dashboard</h1>

      {/* Affiliate Status */}
      <Card>
        <h2>Your Affiliate Status</h2>
        <p>Code: {affiliate?.affiliateCode}</p>
        <p>Total Earnings: ${totalCommission}</p>
      </Card>

      {/* Referrals Table */}
      <Card>
        <h2>Your Referrals</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Order ID</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Commission</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {referrals.map((referral) => (
              <TableRow key={referral.id}>
                <TableCell>
                  {new Date(referral.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>{referral.orderId}</TableCell>
                <TableCell>${referral.amount}</TableCell>
                <TableCell>${referral.commissionAmount}</TableCell>
                <TableCell>{referral.status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
```

### Admin API Routes

Create the following API routes for affiliate management:

1. `src/app/api/affiliates/route.js` - Handle affiliate registration and retrieval
2. `src/app/api/affiliates/referrals/route.js` - Manage referral data
3. `src/app/api/affiliates/update-code/route.js` - Update affiliate codes
4. `src/app/api/affiliates/payout/route.js` - Process affiliate payouts

## Stripe Payout Process

1. **Track Commissions**

   - Record each successful referral in the referrals table
   - Calculate commission based on configured rate
   - Mark referral status as "pending"

2. **Process Payouts**

   - Implement a payout schedule (e.g., monthly)
   - Use Stripe Connect or manual payouts
   - Update referral status to "paid" after successful payout

3. **Payout Security**
   - Verify affiliate status before processing payouts
   - Implement double-entry accounting
   - Keep detailed payout logs
   - Handle failed payouts gracefully

## Monitoring and Analytics

1. **Key Metrics to Track**

   - Total number of affiliates
   - Active vs inactive affiliates
   - Conversion rates per affiliate
   - Total commissions earned/paid
   - Average commission per referral

2. **Reporting Dashboard**

   - Create admin views for all affiliate activities
   - Generate monthly/quarterly reports
   - Track payment history
   - Monitor for unusual patterns

3. **Fraud Prevention**
   - Implement rate limiting on affiliate signups
   - Monitor for suspicious referral patterns
   - Track IP addresses for potential abuse
   - Implement manual review process for large payouts
