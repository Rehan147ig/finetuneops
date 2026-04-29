import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withApiErrorHandling } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

export const POST = withApiErrorHandling("billing_portal_failed", async () => {
  const session = await auth();

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "You must be signed in to manage billing." }, { status: 401 });
  }

  const stripe = getStripe();

  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured yet." }, { status: 503 });
  }

  const organization = await prisma.organization.findUniqueOrThrow({
    where: {
      id: session.user.organizationId,
    },
  });

  if (!organization.stripeCustomerId) {
    return NextResponse.json({ error: "This workspace does not have a Stripe customer yet." }, { status: 404 });
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: organization.stripeCustomerId,
    return_url: `${process.env.APP_URL ?? "http://localhost:3000"}/settings`,
  });

  return NextResponse.json({ url: portalSession.url }, { status: 200 });
});
