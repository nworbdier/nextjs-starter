import { NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { db } from "@/db";
import {
  users,
  affiliateReferrals,
  stripeEvents,
  affiliateTransfers,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Disable body parsing, need the raw body for webhook signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

async function updateUserSubscription(
  stripeCustomerId,
  subscriptionData,
  options = {}
) {
  try {
    const customer = await stripe.customers.retrieve(stripeCustomerId);
    if (!customer.email) return;

    const {
      statusChanged,
      previousStatus,
      forceStatus,
      lastInvoiceStatus,
      lastPaymentError,
    } = options;

    await db
      .update(users)
      .set({
        pro_access: ["active", "trialing"].includes(
          forceStatus || subscriptionData.status
        ),
        subscriptionStatus: forceStatus || subscriptionData.status,
        stripeSubscriptionId: subscriptionData.id,
        subscriptionPriceId: subscriptionData.items.data[0].price.id,
        subscriptionCurrentPeriodEnd: new Date(
          subscriptionData.current_period_end * 1000
        ),
        cancelAtPeriodEnd: subscriptionData.cancel_at_period_end,
        ...(lastInvoiceStatus ? { lastInvoiceStatus } : {}),
        ...(lastPaymentError ? { lastPaymentError } : {}),
        ...(lastPaymentError === null ? { lastPaymentError: null } : {}),
      })
      .where(eq(users.email, customer.email));

    // Log important subscription changes
    if (statusChanged) {
      console.log(`Subscription updated for ${customer.email}:`, {
        statusChanged: {
          from: previousStatus,
          to: forceStatus || subscriptionData.status,
        },
      });
    }

    return customer;
  } catch (error) {
    console.error("Error updating user subscription:", error);
    throw error;
  }
}

async function processAffiliateCommission(session, user) {
  // Process affiliate commission if this user was referred
  const referralResult = await db
    .select()
    .from(affiliateReferrals)
    .where(
      and(
        eq(affiliateReferrals.referredUserId, user.id),
        eq(affiliateReferrals.status, "pending")
      )
    );

  if (referralResult.length > 0) {
    const referral = referralResult[0];
    const commissionAmount = (session.amount_total * 0.5) / 100; // 50% commission

    // Get the affiliate user
    const affiliateResult = await db
      .select()
      .from(users)
      .where(eq(users.id, referral.referrerId));

    if (affiliateResult.length > 0) {
      const affiliate = affiliateResult[0];

      // Update the referral status and commission amount
      await db
        .update(affiliateReferrals)
        .set({
          status: "converted",
          commissionAmount: commissionAmount,
          convertedAt: new Date(),
        })
        .where(eq(affiliateReferrals.id, referral.id));

      // Update the affiliate's earnings
      await db
        .update(users)
        .set({
          totalAffiliateEarnings: sql`${users.totalAffiliateEarnings} + ${commissionAmount}`,
          unpaidAffiliateEarnings: sql`${users.unpaidAffiliateEarnings} + ${commissionAmount}`,
        })
        .where(eq(users.id, affiliate.id));

      // Create a transfer record
      if (affiliate.stripeConnectAccountId) {
        await db.insert(affiliateTransfers).values({
          affiliateId: affiliate.id,
          amount: commissionAmount,
          status: "pending",
          sessionId: session.id,
        });
      }
    }
  }
}

async function processAffiliatePayout(transfer) {
  try {
    // Create a transfer to the affiliate's Stripe Connect account
    const stripeTransfer = await stripe.transfers.create({
      amount: Math.floor(transfer.amount * 100), // Convert to cents
      currency: "usd",
      destination: transfer.stripeConnectAccountId,
    });

    // Update transfer record
    await db
      .update(affiliateTransfers)
      .set({
        status: "completed",
        stripeTransferId: stripeTransfer.id,
        processedAt: new Date(),
      })
      .where(eq(affiliateTransfers.id, transfer.id));

    // Update the affiliate's unpaid earnings
    await db
      .update(users)
      .set({
        unpaidAffiliateEarnings: sql`${users.unpaidAffiliateEarnings} - ${transfer.amount}`,
      })
      .where(eq(users.id, transfer.affiliateId));
  } catch (error) {
    // Update transfer record with error
    await db
      .update(affiliateTransfers)
      .set({
        status: "failed",
        error: error.message,
        processedAt: new Date(),
      })
      .where(eq(affiliateTransfers.id, transfer.id));
  }
}

async function handleRefund(charge) {
  // Find the original payment and related affiliate transfer
  const transfer = await db
    .select()
    .from(affiliateTransfers)
    .where(eq(affiliateTransfers.sessionId, charge.payment_intent));

  if (transfer.length > 0) {
    const affiliateTransfer = transfer[0];

    // If the transfer was completed, create a reversal
    if (
      affiliateTransfer.status === "completed" &&
      affiliateTransfer.stripeTransferId
    ) {
      try {
        await stripe.transfers.createReversal(
          affiliateTransfer.stripeTransferId
        );

        // Update affiliate earnings
        await db
          .update(users)
          .set({
            totalAffiliateEarnings: sql`${users.totalAffiliateEarnings} - ${affiliateTransfer.amount}`,
          })
          .where(eq(users.id, affiliateTransfer.affiliateId));
      } catch (error) {
        console.error("Error reversing transfer:", error);
      }
    }
  }
}

export async function POST(request) {
  const body = await request.text();
  const sig = headers().get("stripe-signature");

  let event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed. ${err.message}`);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  try {
    // Check for duplicate event
    const existingEvent = await db
      .select()
      .from(stripeEvents)
      .where(eq(stripeEvents.stripeEventId, event.id));

    if (existingEvent.length > 0) {
      return NextResponse.json({ received: true });
    }

    // Record the event
    await db.insert(stripeEvents).values({
      stripeEventId: event.id,
      type: event.type,
      data: event.data.object,
    });

    switch (event.type) {
      case "customer.subscription.created":
        const newSubscription = event.data.object;
        const newCustomer = await stripe.customers.retrieve(
          newSubscription.customer
        );

        if (newCustomer.email) {
          await db
            .update(users)
            .set({
              stripeSubscriptionId: newSubscription.id,
              subscriptionStatus: newSubscription.status,
              subscriptionPriceId: newSubscription.items.data[0].price.id,
              pro_access: ["active", "trialing"].includes(
                newSubscription.status
              ),
            })
            .where(eq(users.email, newCustomer.email));
        }
        break;

      case "customer.subscription.updated":
        const updatedSubscription = event.data.object;
        const previousAttributes = event.data.previous_attributes || {};

        // Handle status changes
        const statusChanged =
          previousAttributes.status &&
          previousAttributes.status !== updatedSubscription.status;

        await updateUserSubscription(
          updatedSubscription.customer,
          updatedSubscription,
          {
            statusChanged,
            previousStatus: previousAttributes.status,
            ...(statusChanged && updatedSubscription.status === "past_due"
              ? { lastPaymentError: "Payment past due" }
              : {}),
          }
        );
        break;

      case "customer.subscription.deleted":
        const deletedSubscription = event.data.object;
        await updateUserSubscription(
          deletedSubscription.customer,
          deletedSubscription,
          {
            forceStatus: "canceled",
            statusChanged: true,
            previousStatus: deletedSubscription.status,
          }
        );
        break;

      case "customer.subscription.trial_will_end":
        const trialSubscription = event.data.object;
        await updateUserSubscription(
          trialSubscription.customer,
          trialSubscription,
          {
            forceStatus: "trialing",
          }
        );
        break;

      case "payment_intent.succeeded":
        const paymentIntent = event.data.object;
        if (paymentIntent.customer) {
          const customer = await stripe.customers.retrieve(
            paymentIntent.customer
          );
          if (customer.email) {
            await db
              .update(users)
              .set({
                lastInvoiceStatus: "paid",
                lastPaymentError: null,
              })
              .where(eq(users.email, customer.email));
          }
        }
        break;

      case "payment_intent.payment_failed":
        const failedPaymentIntent = event.data.object;
        if (failedPaymentIntent.customer) {
          const customer = await stripe.customers.retrieve(
            failedPaymentIntent.customer
          );
          if (customer.email) {
            await db
              .update(users)
              .set({
                lastInvoiceStatus: "failed",
                lastPaymentError:
                  failedPaymentIntent.last_payment_error?.message ||
                  "Payment failed",
              })
              .where(eq(users.email, customer.email));
          }
        }
        break;

      case "invoice.payment_succeeded":
        const invoice = event.data.object;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            invoice.subscription,
            {
              idempotencyKey: `sub_retrieve_${invoice.id}`,
            }
          );
          await updateUserSubscription(invoice.customer, subscription, {
            lastInvoiceStatus: "paid",
            lastPaymentError: null,
          });
        }
        break;

      case "invoice.payment_failed":
        const failedInvoice = event.data.object;
        if (failedInvoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            failedInvoice.subscription,
            {
              idempotencyKey: `sub_retrieve_${failedInvoice.id}`,
            }
          );
          await updateUserSubscription(failedInvoice.customer, subscription, {
            lastInvoiceStatus: "failed",
            lastPaymentError:
              failedInvoice.last_payment_error?.message || "Payment failed",
          });
        }
        break;

      case "checkout.session.completed":
        const session = event.data.object;
        // Handle the subscription creation
        if (session.mode === "subscription") {
          await db
            .update(users)
            .set({
              stripeCustomerId: session.customer,
            })
            .where(eq(users.id, session.client_reference_id));

          const userResult = await db
            .select()
            .from(users)
            .where(eq(users.id, session.client_reference_id));

          if (!userResult.length) {
            throw new Error("User not found");
          }

          await processAffiliateCommission(session, userResult[0]);
        }
        break;

      case "transfer.failed":
        const failedTransfer = event.data.object;
        await db
          .update(affiliateTransfers)
          .set({
            status: "failed",
            error: "Transfer failed at Stripe",
            processedAt: new Date(),
          })
          .where(eq(affiliateTransfers.stripeTransferId, failedTransfer.id));
        break;

      default:
        console.warn(`Unhandled event type: ${event.type}`);
        break;
    }

    // Process any pending transfers
    const pendingTransfers = await db
      .select()
      .from(affiliateTransfers)
      .where(eq(affiliateTransfers.status, "pending"));

    for (const transfer of pendingTransfers) {
      await processAffiliatePayout(transfer);
    }

    // Mark event as processed
    await db
      .update(stripeEvents)
      .set({ processedAt: new Date() })
      .where(eq(stripeEvents.stripeEventId, event.id));

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
