import Stripe from "stripe";
import { getServerEnv } from "@/lib/env";

const env = getServerEnv();

declare global {
  // eslint-disable-next-line no-var
  var __finetuneopsStripe: Stripe | undefined;
}

export function getStripe() {
  if (!globalThis.__finetuneopsStripe) {
    globalThis.__finetuneopsStripe = new Stripe(env.STRIPE_SECRET_KEY);
  }

  return globalThis.__finetuneopsStripe;
}
