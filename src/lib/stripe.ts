import Stripe from "stripe";
import { getServerEnv } from "@/lib/env";

const env = getServerEnv();

declare global {
  var __finetuneopsStripe: Stripe | undefined;
}

export function getStripe() {
  if (!globalThis.__finetuneopsStripe) {
    globalThis.__finetuneopsStripe = new Stripe(env.STRIPE_SECRET_KEY);
  }

  return globalThis.__finetuneopsStripe;
}
