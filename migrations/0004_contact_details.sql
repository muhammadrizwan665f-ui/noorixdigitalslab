-- B-MART contact details (shown in the footer, Support page and policy pages).
-- Safe to run more than once. Only touches these three site settings.
INSERT INTO site_settings(key,value) VALUES('whatsapp','923154429417')
  ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO site_settings(key,value) VALUES('support_email','noorixdigitals@gmail.com')
  ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO site_settings(key,value) VALUES('contact_address','3rd Floor, H-Mall, Shalimar Link Road, Lahore, Pakistan')
  ON CONFLICT(key) DO UPDATE SET value=excluded.value;
