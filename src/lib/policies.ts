import type { Brand, Contact } from './brand';

/**
 * Built-in text for the Return Policy and the Digital Delivery / Service Policy. They are shown until a page with the same
 * slug ("return" / "delivery") is saved in Admin → Content, which then takes over. The wording only describes how this
 * store actually works (digital products, wallet payments, manual verification, refunds to the wallet); it contains no
 * registration numbers or legal claims. The owner should review it and adjust any time limits to match business practice.
 */
export const POLICY_SLUGS = ['return', 'delivery'] as const;

const contactBlock = (c: Contact) => `Business address: ${c.address}
Email: ${c.email}
WhatsApp support: ${c.phone}`;

export function policyFallback(slug: string, brand: Brand, c: Contact): { title: string; body: string } | null {
  if (slug === 'return') return {
    title: 'Return Policy',
    body: `${brand.name} sells digital products and services (for example subscriptions, accounts, software licences and digital services). Because these items are delivered electronically, there is nothing to ship back, so returns work differently from physical goods.

What you can ask us for
• A replacement or a fix, if a delivered product does not work, is not what was described on the product page, or was delivered incorrectly.
• A refund, if the product is marked as refund-eligible and it has not been successfully used. Please see our Refund Policy for how approved refunds are paid.

What we cannot return
• Products that have already been successfully used, activated or redeemed, unless they were faulty when delivered.
• Wallet deposits. Money added to your wallet stays in your wallet; it is not returned to the original payment method.

How to request a return
1. Contact us as soon as you notice a problem. Open a support ticket from the order in your dashboard (Dashboard → My Orders → the order), or message us on WhatsApp.
2. Include your order number and a short description. Screenshots help us resolve it faster.
3. Our team reviews the request and replies with a replacement, a refund, or the reason a return is not possible.

Approved refunds are credited to your ${brand.name} wallet.

Contact us
${contactBlock(c)}

${brand.name} is operated by ${brand.parent}.`,
  };
  if (slug === 'delivery') return {
    title: 'Digital Delivery / Service Policy',
    body: `${brand.name} delivers digital products and services only. Nothing is shipped physically, so there are no shipping charges or courier delays.

How you pay
Add funds to your ${brand.name} wallet with Bank Transfer, Easypaisa or JazzCash, then pay for orders from the wallet. Funds are added after our team verifies your payment, so please submit the transaction ID (and a screenshot) when you add funds.

How delivery works
• Automatic products: delivered as soon as your order is placed and paid from your wallet. Delivery details appear in your order and are also sent to your registered email where email is enabled.
• Manual products: prepared and delivered by our team. The expected delivery time is shown on the product page. You are notified when your order status changes.

Where to find your product
Log in and open Dashboard → My Orders → select the order to see its status and delivery details (such as an account, key, link or instructions). You can also check an order from the Track Order page using your order number and email.

If something goes wrong
If an order is delayed, fails, or what you received does not work, open a support ticket from the order or message us on WhatsApp with your order number. We will fix the problem, replace the product, or refund it according to our Return Policy and Refund Policy.

Your responsibilities
Please provide correct details when ordering (such as the email or account the service should be linked to) and keep your delivery details private. We cannot deliver to wrong details that were entered at checkout.

Contact us
${contactBlock(c)}

${brand.name} is operated by ${brand.parent}.`,
  };
  return null;
}
