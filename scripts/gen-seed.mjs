// Generates migrations/0002_seed.sql  (run: node scripts/gen-seed.mjs)
import { writeFileSync } from 'node:fs';
const q = (s) => s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`;
const out = [];
const perms = {
  'dashboard.view':'View dashboard','customers.view':'View customers','customers.manage':'Suspend/activate customers',
  'wallets.view':'View wallets & ledger','wallets.adjust':'Manual wallet adjustments','deposits.review':'Approve/reject deposits',
  'products.manage':'Manage products & plans','categories.manage':'Manage categories','inventory.manage':'Manage inventory',
  'orders.view':'View orders','orders.manage':'Manage order status','orders.deliver':'Deliver orders','refunds.manage':'Process refunds',
  'payments.settings':'Edit payment methods','support.manage':'Handle support tickets','marketing.manage':'Banners, coupons, announcements',
  'content.manage':'Edit CMS pages and FAQs','reports.view':'View reports & exports','providers.manage':'Manage API providers',
  'staff.manage':'Manage staff & roles (Super Admin)','settings.manage':'System settings (Super Admin)','audit.view':'View audit logs',
};
const roles = {
  super_admin: ['Super Admin','Full access', Object.keys(perms)],
  order_manager: ['Order Manager','Orders, delivery, inventory, refunds requests',['dashboard.view','orders.view','orders.manage','orders.deliver','inventory.manage','customers.view','providers.manage']],
  finance_manager: ['Finance Manager','Deposits, wallets, refunds, reports',['dashboard.view','wallets.view','wallets.adjust','deposits.review','refunds.manage','reports.view','orders.view','customers.view']],
  support_agent: ['Support Agent','Tickets and customer lookup',['dashboard.view','support.manage','customers.view','orders.view']],
  product_manager: ['Product Manager','Catalogue, categories, marketing, content',['dashboard.view','products.manage','categories.manage','inventory.manage','marketing.manage','content.manage']],
};
for (const [c,d] of Object.entries(perms)) out.push(`INSERT INTO permissions(code,description) VALUES(${q(c)},${q(d)});`);
for (const [code,[name,desc,ps]] of Object.entries(roles)) {
  out.push(`INSERT INTO roles(id,code,name,description) VALUES(${q('role_'+code)},${q(code)},${q(name)},${q(desc)});`);
  for (const p of ps) out.push(`INSERT INTO role_permissions(role_id,permission_code) VALUES(${q('role_'+code)},${q(p)});`);
}
const cats = [
 ['ai-tools','AI Tools & AI Subscriptions','sparkles'],['streaming','Streaming Subscriptions','play'],
 ['software','Software & Productivity','layers'],['video-editing','Video Editing Tools','film'],
 ['design','Design & Graphics Tools','palette'],['vpn','VPN & Privacy Tools','shield'],
 ['social','Social Media Digital Services','share'],['accounts','Digital Accounts','user'],
 ['hosting','Website & Hosting Products','globe'],['other','Other Digital Products','box'],
];
cats.forEach(([s,n,i],k)=>out.push(`INSERT INTO product_categories(id,slug,name,icon,sort_order) VALUES(${q('cat_'+s)},${q(s)},${q(n)},${q(i)},${k});`));
// DEMO products — all flagged is_demo=1. Replace/delete from Admin before launch.
const P = [
 ['netflix','streaming','Netflix','Premium streaming plans delivered to your account.','#E50914','manual',1,1,1,[['1 Month','1 month',29900,39900],['3 Months','3 months',79900,119900]]],
 ['prime-video','streaming','Prime Video','Prime Video subscription plans.','#00A8E1','manual',1,1,0,[['1 Month','1 month',24900,34900]]],
 ['youtube-premium','streaming','YouTube Premium','Ad-free YouTube with background play.','#FF0000','manual',0,1,0,[['1 Month','1 month',34900,null]]],
 ['spotify-premium','streaming','Spotify Premium','Ad-free music streaming.','#1DB954','manual',1,1,0,[['1 Month','1 month',29900,null],['3 Months','3 months',84900,null]]],
 ['hbo-max','streaming','HBO Max','HBO Max streaming plans.','#5822B4','manual',0,0,0,[['1 Month','1 month',39900,null]]],
 ['hulu','streaming','Hulu','Hulu streaming plans.','#1CE783','manual',0,0,0,[['1 Month','1 month',34900,null]]],
 ['chatgpt-pro','ai-tools','ChatGPT Pro','AI assistant subscription.','#10A37F','manual',1,1,1,[['1 Month','1 month',149900,199900]]],
 ['gemini-pro','ai-tools','Gemini Pro','Google Gemini AI subscription.','#4285F4','manual',1,0,0,[['1 Month','1 month',129900,null]]],
 ['canva-pro','design','Canva Pro','Premium design tools and templates.','#7D2AE8','manual',1,1,0,[['1 Month','1 month',44900,59900],['1 Year','12 months',399900,null]]],
 ['capcut-pro','video-editing','CapCut Pro','Pro video editing features.','#111827','manual',0,1,0,[['1 Month','1 month',39900,null]]],
 ['muse-ai','ai-tools','Muse AI','AI creative generation credits.','#0EA5E9','manual',0,0,1,[['1 Month','1 month',59900,79900]]],
 ['kling-ai','video-editing','Kling AI','AI video generation credits.','#F97316','manual',0,1,0,[['1 Month','1 month',99900,null]]],
 ['vpn-service','vpn','VPN Service','Private browsing across devices.','#087BFF','manual',0,1,1,[['1 Month','1 month',19900,29900],['1 Year','12 months',149900,null]]],
];
const feats = ['Delivered by our team after payment','Works worldwide','Support available on WhatsApp and tickets'];
P.forEach(([slug,cat,name,desc,color,dt,feat,trend,deal,plans])=>{
  out.push(`INSERT INTO products(id,slug,category_id,name,short_description,description,brand_color,status,delivery_type,features,terms,refund_eligible,refund_policy,is_featured,is_trending,is_deal,is_demo,input_fields) VALUES(${q('prd_'+slug)},${q(slug)},${q('cat_'+cat)},${q(name)},${q(desc)},${q('DEMO PRODUCT — '+desc+' Edit or remove this product in the admin panel before launch.')},${q(color)},'active',${q(dt)},${q(JSON.stringify(feats))},${q('Digital product. Delivery is manual and usually completes within the stated time. Read our Refund Policy before purchasing.')},0,'',${feat},${trend},${deal},1,${q(JSON.stringify([{key:'account_email',label:'Account email / username',type:'text',required:true,help:'The account we should activate this plan on.'}]))});`);
  plans.forEach(([pn,dur,price,cmp],i)=>out.push(`INSERT INTO product_plans(id,product_id,name,duration_label,price,compare_price,sort_order) VALUES(${q(`pln_${slug}_${i}`)},${q('prd_'+slug)},${q(pn)},${q(dur)},${price},${cmp??'NULL'},${i});`));
});
const pm = [['bank_transfer','Bank Transfer',0],['easypaisa','Easypaisa',1],['jazzcash','JazzCash',2]];
pm.forEach(([c,n,s])=>out.push(`INSERT INTO payment_methods(code,name,type,enabled,instructions,sort_order) VALUES(${q(c)},${q(n)},'manual',0,'Send the exact amount to the account shown, then submit the transaction ID and a screenshot. An admin verifies and credits your wallet.',${s});`));
out.push(`INSERT INTO payment_methods(code,name,type,enabled,instructions,sort_order) VALUES('payfast','PayFast (Cards)','gateway',0,'Awaiting merchant credentials.',3);`);
out.push(`INSERT INTO provider_integrations(id,code,name,enabled,status,config) VALUES('prov_generic','generic-http','Generic HTTP provider',0,'awaiting_credentials',${q(JSON.stringify({createPath:'/orders',statusPath:'/orders/{ref}',timeoutMs:10000}))});`);
const S = {
 site_name:'NOORIX DIGITAL LAB', tagline:'All-in-One Digital Solutions Under One Roof.', site_url:'https://noorixdigitallab.online',
 whatsapp:'923154429417', support_email:'', currency:'PKR', timezone:'Asia/Karachi', announcement:'', announcement_active:'0',
 maintenance:'0', min_deposit:'10000', hero_title:'Premium Digital Products & Subscriptions', hero_subtitle:'Get your favourite services at the best prices — delivered fast and supported by a real team.',
 registration_open:'1', require_email_verification:'0',
};
Object.entries(S).forEach(([k,v])=>out.push(`INSERT INTO site_settings(key,value) VALUES(${q(k)},${q(v)});`));
const pages = {
 about:['About Noorix Digital Lab','NOORIX DIGITAL LAB is a digital products and subscriptions marketplace. All-in-One Digital Solutions Under One Roof.'],
 terms:['Terms of Service','DRAFT — have this reviewed before launch.\n\nBy using this website you agree to these terms. Digital products are delivered electronically. Prices are in PKR. We may refuse or cancel orders where fraud or misuse is suspected. Wallet funds are usable only for purchases on this website.'],
 privacy:['Privacy Policy','DRAFT — have this reviewed before launch.\n\nWe store the information you give us (name, email, phone, orders, support messages, payment proofs) to operate your account. We do not sell personal data. Contact us to request correction or deletion.'],
 refund:['Refund Policy','DRAFT — have this reviewed before launch.\n\nRefunds are only available for products marked as refund-eligible and only where the product has not been successfully used. Approved refunds are credited to your Noorix wallet. Wallet deposits are not refundable to the original payment method.'],
};
Object.entries(pages).forEach(([s,[t,b]])=>out.push(`INSERT INTO cms_pages(slug,title,body) VALUES(${q(s)},${q(t)},${q(b)});`));
[['How long does delivery take?','Automatic products are delivered instantly. Manual products are delivered by our team, normally within the time shown on the product.'],
 ['How do I add funds?','Open Wallet, choose Add Funds, pay by Bank Transfer, Easypaisa or JazzCash, and submit the transaction ID with a screenshot. Funds appear after an admin verifies the payment.'],
 ['Can I get a refund?','Only products marked refund-eligible can be refunded, according to the Refund Policy. Open a support ticket from your order.'],
].forEach(([a,b],i)=>out.push(`INSERT INTO faqs(id,question,answer,sort_order) VALUES(${q('faq_'+i)},${q(a)},${q(b)},${i});`));
out.push(`INSERT INTO homepage_banners(id,title,subtitle,cta_label,cta_url,sort_order) VALUES('ban_1','Premium Digital Products & Subscriptions','Get your favourite services at the best prices.','Browse Products','/products',0);`);
writeFileSync(new URL('../migrations/0002_seed.sql', import.meta.url), out.join('\n') + '\n');
console.log(out.length, 'statements');
