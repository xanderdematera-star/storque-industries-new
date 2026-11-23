CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL,
 email TEXT UNIQUE NOT NULL, phone TEXT, password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('customer','seller','rider','admin')),
 approved BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS products (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), seller_id UUID NOT NULL REFERENCES users(id),
 name TEXT NOT NULL, description TEXT DEFAULT '', category TEXT NOT NULL,
 price NUMERIC(12,2) NOT NULL CHECK(price>=0), stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0),
 image_url TEXT, active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS orders (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID NOT NULL REFERENCES users(id),
 seller_id UUID NOT NULL REFERENCES users(id), rider_id UUID REFERENCES users(id),
 status TEXT NOT NULL DEFAULT 'pending',
 payment_method TEXT NOT NULL CHECK(payment_method IN ('COD','GCash','Maya','Bank Transfer','Card')),
 payment_status TEXT NOT NULL DEFAULT 'unpaid',
 subtotal NUMERIC(12,2) NOT NULL, delivery_fee NUMERIC(12,2) DEFAULT 0, total NUMERIC(12,2) NOT NULL,
 shipping_name TEXT NOT NULL, shipping_phone TEXT NOT NULL, shipping_address TEXT NOT NULL,
 notes TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS order_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 product_id UUID NOT NULL REFERENCES products(id), product_name TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity>0), unit_price NUMERIC(12,2) NOT NULL
);
CREATE TABLE IF NOT EXISTS delivery_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID NOT NULL REFERENCES orders(id),
 rider_id UUID NOT NULL REFERENCES users(id), status TEXT NOT NULL, note TEXT DEFAULT '',
 created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS products_category_idx ON products(category);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders(customer_id);
CREATE INDEX IF NOT EXISTS orders_seller_idx ON orders(seller_id);
CREATE INDEX IF NOT EXISTS orders_rider_idx ON orders(rider_id);
