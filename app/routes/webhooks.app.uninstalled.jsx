import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  
  // Dynamic import to avoid client-side bundling issues
  const { default: db } = await import("../db.server");

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response();
};
