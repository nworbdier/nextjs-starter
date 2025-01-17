import { NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAuthToken } from "@/lib/utils";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  try {
    const headersList = await headers();
    const token = headersList.get("authorization")?.split("Bearer ")[1];

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decodedToken = await verifyAuthToken(token);
    if (!decodedToken) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get user from database
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.email, decodedToken.email));

    if (!userResult.length) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = userResult[0];

    if (!user.stripeCustomerId) {
      return NextResponse.json(
        { error: "No Stripe customer found" },
        { status: 400 }
      );
    }

    // Verify the customer exists in Stripe
    try {
      const customer = await stripe.customers.retrieve(user.stripeCustomerId);

      if (customer.deleted) {
        return NextResponse.json(
          { error: "Stripe customer has been deleted" },
          { status: 400 }
        );
      }
    } catch (stripeError) {
      console.error("Error retrieving Stripe customer:", stripeError);
      return NextResponse.json(
        { error: "Invalid Stripe customer ID" },
        { status: 400 }
      );
    }

    // Create Stripe Portal session
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings?portal_return=true`,
      });
      return NextResponse.json({ url: session.url });
    } catch (portalError) {
      console.error("Error creating portal session:", portalError);
      return NextResponse.json(
        {
          error: "Failed to create portal session",
          details: portalError.message,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        error: "Error creating portal session",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
