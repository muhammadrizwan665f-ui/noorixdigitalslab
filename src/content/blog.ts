/**
 * Blog articles. They live in code (not the database) so the blog needs no migration or admin changes and is rendered both by the
 * React app and by the Worker for crawlers. Every article must be original, evergreen and free of claims that can go out of date
 * (prices, plan features, brand policies). Add a new article by appending to POSTS.
 */
export type Block = { h2: string } | { p: string } | { ul: string[] } | { ol: string[] };
export interface Post { slug: string; title: string; description: string; published: string; updated: string; minutes: number; body: Block[]; related: { to: string; label: string }[] }

export const POSTS: Post[] = [
  {
    slug: 'how-digital-subscriptions-work',
    title: 'How Digital Subscriptions Work: A Simple Guide',
    description: 'What a digital subscription is, the common ways it is delivered, and what to check before you buy one online.',
    published: '2026-11-19', updated: '2026-11-19', minutes: 5,
    related: [{ to: '/products', label: 'Browse all products' }, { to: '/page/delivery', label: 'Digital Delivery Policy' }],
    body: [
      { p: 'A digital subscription is access to an online service for a fixed period, for example a month or a year. Nothing is shipped to your door. You receive access details, an activation, or a licence key, and the service works until the period ends.' },
      { h2: 'The three common ways a subscription is delivered' },
      { ul: [
        'Activation on your own account: you give the seller the email or username of your existing account and the plan is applied to it.',
        'A ready-made account: you receive a login (email and password) for an account that already has the plan.',
        'A licence key or code: you receive a code that you enter yourself in the app or on the website.',
      ] },
      { p: 'Which of these applies changes how you should use the product, so check the product page before ordering. On B-MART every product page states the delivery type: some products are delivered instantly and automatically, some are delivered through an automated provider, and some are delivered by our team after the order is checked.' },
      { h2: 'Plan, duration and price' },
      { p: 'The same service can be sold in several plans, such as 1 month, 3 months or 12 months. A cheaper plan is not always the better value, so compare the price for the full duration, and check what the plan includes. B-MART lists the price in PKR for each plan on the product page.' },
      { h2: 'What happens when the period ends' },
      { p: 'A fixed-period digital product ends when its duration ends. It does not renew by itself unless the product page says so. If you want to continue, place a new order before the old plan expires so you do not lose access.' },
      { h2: 'Looking after your access' },
      { ul: [
        'Save the delivery message and your order number.',
        'If you receive a login, change the password when the delivery instructions allow it, and do not share it.',
        'Follow the usage rules of the service itself. Breaking them can end your access.',
        'If something does not work, contact support quickly with your order number.',
      ] },
      { h2: 'Before you pay' },
      { p: 'Read the product description, the terms and the refund information on the product page. If anything is unclear, ask on WhatsApp or open a support ticket before you place the order, not after.' },
    ],
  },
  {
    slug: 'how-to-choose-digital-services-safely',
    title: 'How to Choose Digital Services Safely Online',
    description: 'A practical checklist for buying digital products and subscriptions online in Pakistan without losing money or account access.',
    published: '2026-11-19', updated: '2026-11-19', minutes: 5,
    related: [{ to: '/page/refund', label: 'Refund Policy' }, { to: '/support', label: 'Support and FAQ' }],
    body: [
      { p: 'Buying digital services online is convenient, but it also needs a little care. These checks take a few minutes and help you avoid the most common problems.' },
      { h2: 'Check the seller' },
      { ul: [
        'Look for clear contact details: a working email, a support number, and a support channel that answers.',
        'Check that the website has readable terms, a privacy policy and a refund policy, and that they match what the product page says.',
        'Be careful with sellers who only talk to you on social media and avoid giving any written details.',
      ] },
      { h2: 'Check the product page' },
      { ul: [
        'The plan name, the duration and the price should be clearly shown.',
        'The page should say how the product is delivered and what information you must provide.',
        'Look at the stock status. A product shown as out of stock cannot be delivered right now.',
        'Read the terms and the refund information before paying.',
      ] },
      { h2: 'Be careful with prices that look too good' },
      { p: 'If a price is far below what every other seller asks, ask why. A low price can mean a very short duration, limited features, or a product that will not last. Compare the price for the whole period, not just the headline number.' },
      { h2: 'Pay in a way you can trace' },
      { ul: [
        'Use payment methods that give you a transaction ID or receipt, and keep it.',
        'Pay only to the account details shown on the seller\'s official website or confirmed through its official support channel.',
        'Never send money to a number that a stranger gives you in a chat.',
      ] },
      { h2: 'Protect your accounts' },
      { ul: [
        'Never share one-time passwords (OTP) or security codes with anyone.',
        'Do not give your main email password to a seller. A genuine activation only needs the email address or username.',
        'Use a different password for every service.',
      ] },
      { h2: 'Keep a record' },
      { p: 'Save your order number, the delivery message and your payment receipt. If you need help, this lets support find and solve the problem much faster.' },
    ],
  },
  {
    slug: 'how-the-bmart-wallet-works',
    title: 'How the B-MART Wallet Works: Add Funds and Pay',
    description: 'How to add money to your B-MART wallet with Bank Transfer, Easypaisa or JazzCash, and how wallet payments work at checkout.',
    published: '2026-11-19', updated: '2026-11-19', minutes: 4,
    related: [{ to: '/products', label: 'Browse products' }, { to: '/support', label: 'Support and FAQ' }],
    body: [
      { p: 'B-MART uses a wallet in PKR. You add funds to the wallet once and then pay for your orders from the wallet balance, so you do not need to send a separate payment for each product.' },
      { h2: 'Adding funds' },
      { ol: [
        'Create an account or log in, then open your dashboard and choose Wallet.',
        'Choose Add Funds and pick a payment method: Bank Transfer, Easypaisa or JazzCash.',
        'Send the money to the account details shown for that method.',
        'Submit the transaction ID so our team can check the payment.',
        'Once the payment is verified, the amount is credited to your wallet.',
      ] },
      { p: 'The funds are added after verification, so keep your transaction ID and the receipt until the amount appears in your wallet.' },
      { h2: 'Paying for an order' },
      { p: 'Choose a product and a plan, add any details the order form asks for, and pay from your wallet balance at checkout. Prices are shown in PKR for every plan.' },
      { h2: 'Your wallet history' },
      { p: 'Every credit and debit in your wallet is recorded in a ledger that you can see in your dashboard, so you can always check where your balance went.' },
      { h2: 'Need help?' },
      { p: 'If a payment has not appeared in your wallet or an order looks wrong, open a support ticket from your dashboard or message us on WhatsApp with your transaction ID or order number.' },
    ],
  },
];
export const getPost = (slug: string) => POSTS.find((p) => p.slug === slug);
