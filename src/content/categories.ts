/**
 * Short, original introductions for the standard B-MART categories. They are only a fallback: when a category has its own
 * description saved in the database (Admin), that description is used instead. They describe the kind of product in general
 * terms and make no claims about prices, brands or partnerships.
 */
export const CATEGORY_COPY: Record<string, { intro: string; tips: string[] }> = {
  'ai-tools': {
    intro: 'AI tools and AI subscriptions help with writing, research, design, coding and everyday study or office work. This category lists AI plans and tools you can buy in PKR, with the plan length, price and delivery type shown on each product page.',
    tips: ['Check which plan or tier is included and for how long.', 'Read whether the product is activated on your own account or supplied as a ready account.', 'Keep your order number so support can find your purchase quickly.'],
  },
  streaming: {
    intro: 'Streaming subscriptions give you access to films, series, music or live entertainment for a fixed period. Each product page here shows the available plans, the duration, the price in PKR and how the subscription is delivered.',
    tips: ['Compare plan durations before you choose, not just the price.', 'Check how many screens or profiles the plan covers, if the product page states it.', 'Follow the activation steps given after your order and do not share your login with others.'],
  },
  software: {
    intro: 'Software and productivity products cover office tools, utilities and licences used for work, study and freelancing. Open a product to see its plans, what the licence covers and how it is delivered.',
    tips: ['Check the licence period and the number of devices, if listed.', 'Make sure the product suits your operating system before buying.', 'Save any licence key or login details in a safe place after delivery.'],
  },
  'video-editing': {
    intro: 'Video editing tools for creating clips, reels and longer videos. Compare the plans listed for each tool and check the delivery type before you order.',
    tips: ['Look at the plan length and what is included.', 'Confirm whether the tool is activated on your account or supplied with a login.', 'Contact support before ordering if you are unsure which plan you need.'],
  },
  design: {
    intro: 'Design and graphics tools for social media posts, presentations, branding and photo work. Each listing shows its plans, prices in PKR and how the product is delivered.',
    tips: ['Compare plan durations and what each plan includes.', 'Read the product terms before ordering.', 'Keep your order number and delivery details after purchase.'],
  },
  vpn: {
    intro: 'VPN and privacy tools protect your connection on public networks and help keep browsing private. Check each product page for the plan length, price and delivery type.',
    tips: ['Check how long the plan runs and on how many devices it can be used, if stated.', 'Use a service in line with the laws and the terms of the platforms you use.', 'Never share your account details with others.'],
  },
  social: {
    intro: 'Social media digital services for creators and businesses. Read each product description carefully, because the delivery details and the information we need from you can differ between services.',
    tips: ['Provide only the details the order form asks for, and never your password unless the product page explicitly requires it.', 'Read the terms and refund information shown on the product page.', 'Contact support if anything is unclear before you pay.'],
  },
  accounts: {
    intro: 'Digital accounts supplied as ready-to-use logins. The product page explains what is included, how it is delivered and which terms apply.',
    tips: ['Read what the account includes and for how long.', 'Change or secure the login details as the delivery message advises.', 'Check the refund information on the product page before ordering.'],
  },
  hosting: {
    intro: 'Website and hosting products such as domains, hosting plans and related services. Each listing shows the plans, prices in PKR and what you need to provide for setup.',
    tips: ['Check the plan period and what is included.', 'Have your domain or setup details ready if the order form asks for them.', 'Ask support before ordering if you need a specific setup.'],
  },
  other: {
    intro: 'Other digital products and services that do not fit the main categories. Open a product to see its plans, prices in PKR and how it is delivered.',
    tips: ['Read the product description and terms first.', 'Check the delivery type shown on the page.', 'Contact support if you need more information before ordering.'],
  },
};
export const GENERIC_CATEGORY_INTRO = (name: string) => `Browse ${name} on B-MART. Each product page shows the available plans, the price in PKR, whether the item is in stock and how it is delivered.`;
