import { NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
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

    const body = await request.json();
    const priceId = body.priceId || process.env.STRIPE_MONTHLY_PRICE_ID;

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/payment?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/payment?canceled=true`,
      customer_email: decodedToken.email,
      client_reference_id: decodedToken.uid,
      metadata: {
        userId: decodedToken.uid,
        userEmail: decodedToken.email,
      },
      allow_promotion_codes: true,
      billing_address_collection: "required",
      automatic_tax: { enabled: true },
    });

    if (!session?.url) {
      throw new Error("Failed to create checkout session URL");
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return NextResponse.json(
      { error: "Error creating checkout session" },
      { status: 500 }
    );
  }
}
