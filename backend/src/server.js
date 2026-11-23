
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const { randomUUID } = require('crypto');

const app = express();

// =====================================================
// DATABASE CONNECTION
// =====================================================

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true'
    ? { rejectUnauthorized: false }
    : undefined
});

// =====================================================
// SUPABASE STORAGE
// =====================================================

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key'
);

const IMAGE_BUCKET = 'product-images';

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 5
  },
  fileFilter: (req, file, callback) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp'
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return callback(
        new Error('Only JPG, PNG, and WEBP images are allowed.')
      );
    }

    callback(null, true);
  }
});

function handleImageUpload(req, res, next) {
  imageUpload.array('images', 5)(req, res, error => {
    if (error) {
      return res.status(400).json({
        error: error.message || 'Image upload failed.'
      });
    }

    next();
  });
}

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(helmet());

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*'
}));

app.use(express.json({
  limit: '1mb'
}));

app.use('/api', rateLimit({
  windowMs: 900000,
  limit: 300
}));

// =====================================================
// HELPERS AND AUTHENTICATION
// =====================================================

const q = (sql, params = []) => db.query(sql, params);

const wrap = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const token = user => jwt.sign({
  id: user.id,
  role: user.role,
  name: user.name
}, process.env.JWT_SECRET, {
  expiresIn: '7d'
});

function auth(req, res, next) {
  try {
    const t = (req.headers.authorization || '')
      .replace(/^Bearer\s+/i, '');

    if (!t) throw new Error('Missing token');

    req.user = jwt.verify(t, process.env.JWT_SECRET);

    next();

  } catch {
    return res.status(401).json({
      error: 'Authentication required'
    });
  }
}

const role = (...roles) => (req, res, next) =>
  roles.includes(req.user.role)
    ? next()
    : res.status(403).json({
        error: 'Not authorized'
      });

const approved = wrap(async (req, res, next) => {
  const result = await q(
    'SELECT approved, role FROM users WHERE id=$1',
    [req.user.id]
  );

  if (
    !result.rows[0] ||
    (!result.rows[0].approved &&
      result.rows[0].role !== 'admin')
  ) {
    return res.status(403).json({
      error: 'Account pending admin approval'
    });
  }

  next();
});

// =====================================================
// HEALTH CHECK
// =====================================================

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'Storque Industries API'
  });
});

// =====================================================
// AUTHENTICATION
// =====================================================

app.post('/api/auth/register', wrap(async (req, res) => {
  const {
    name,
    email,
    password,
    phone,
    role: userRole = 'customer'
  } = req.body;

  if (
    !name ||
    !email ||
    !password ||
    password.length < 8 ||
    !['customer', 'seller', 'rider'].includes(userRole)
  ) {
    return res.status(400).json({
      error: 'Valid name, email, password (8+ chars) and role required'
    });
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const result = await q(
    `INSERT INTO users
    (name, email, phone, password_hash, role, approved)
    VALUES ($1, $2, $3, $4, $5, false)
    RETURNING id, name, email, role, approved`,
    [
      name,
      email.toLowerCase(),
      phone || null,
      hashedPassword,
      userRole
    ]
  );

  res.status(201).json({
    token: token(result.rows[0]),
    user: result.rows[0],
    message: 'Registration received. Your account is pending admin approval.'
  });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const result = await q(
    'SELECT * FROM users WHERE email=$1',
    [String(req.body.email || '').toLowerCase()]
  );

  const user = result.rows[0];

  if (
    !user ||
    !await bcrypt.compare(
      req.body.password || '',
      user.password_hash
    )
  ) {
    return res.status(401).json({
      error: 'Incorrect email or password'
    });
  }

  if (req.body.role && req.body.role !== user.role) {
    return res.status(403).json({
      error: 'Wrong app for this account role'
    });
  }

  if (!user.approved && user.role !== 'admin') {
    return res.status(403).json({
      error: 'Your account is pending admin approval'
    });
  }

  res.json({
    token: token(user),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      approved: user.approved
    }
  });
}));

app.get(
  '/api/auth/me',
  auth,
  approved,
  wrap(async (req, res) => {
    const result = await q(
      `SELECT id, name, email, phone, role, approved
       FROM users WHERE id=$1`,
      [req.user.id]
    );

    res.json({
      user: result.rows[0]
    });
  })
);

// =====================================================
// PUBLIC PRODUCTS
// Archived products are hidden from customers.
// =====================================================

app.get('/api/products', wrap(async (req, res) => {
  const result = await q(
    `SELECT p.*, u.name seller_name
     FROM products p
     JOIN users u ON u.id = p.seller_id
     WHERE p.active = true
     AND p.archived_at IS NULL
     AND ($1::text IS NULL OR p.category = $1)
     AND (
       $2::text IS NULL
       OR p.name ILIKE '%' || $2 || '%'
       OR p.description ILIKE '%' || $2 || '%'
     )
     ORDER BY p.created_at DESC
     LIMIT 100`,
    [
      req.query.category || null,
      req.query.q || null
    ]
  );

  res.json({
    products: result.rows
  });
}));

// =====================================================
// SELLER PRODUCT IMAGE UPLOAD
// =====================================================

app.post(
  '/api/products/images',
  auth,
  role('seller'),
  approved,
  handleImageUpload,
  wrap(async (req, res) => {
    if (
      !process.env.SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return res.status(500).json({
        error: 'Supabase Storage is not configured.'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'Please select at least one image.'
      });
    }

    const extensionByType = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp'
    };

    const uploadedImages = [];

    for (const file of req.files) {
      const extension = extensionByType[file.mimetype];

      if (!extension) {
        return res.status(400).json({
          error: 'Unsupported image format.'
        });
      }

      const filePath =
        `${req.user.id}/${randomUUID()}.${extension}`;

      const { data, error } = await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        });

      if (error) {
        throw new Error(
          `Image upload failed: ${error.message}`
        );
      }

      const { data: publicData } = supabase.storage
        .from(IMAGE_BUCKET)
        .getPublicUrl(data.path);

      uploadedImages.push(publicData.publicUrl);
    }

    res.status(201).json({
      message: 'Product images uploaded successfully.',
      images: uploadedImages
    });
  })
);

// =====================================================
// SELLER PRODUCT CREATION
// =====================================================

app.post(
  '/api/products',
  auth,
  role('seller'),
  approved,
  wrap(async (req, res) => {
    const {
      name,
      description,
      category,
      price,
      stock,
      image_url,
      images
    } = req.body;

    if (
      !name ||
      !category ||
      !Number.isFinite(+price) ||
      +price < 0 ||
      !Number.isInteger(+stock) ||
      +stock < 0
    ) {
      return res.status(400).json({
        error: 'Valid product details required'
      });
    }

    const productImages = Array.isArray(images)
      ? images
      : [];

    const storagePrefix =
      `${process.env.SUPABASE_URL}/storage/v1/object/public/${IMAGE_BUCKET}/`;

    if (
      productImages.length > 5 ||
      productImages.some(url =>
        typeof url !== 'string' ||
        !url.startsWith(storagePrefix)
      )
    ) {
      return res.status(400).json({
        error: 'Invalid product images. Maximum of 5 uploaded images allowed.'
      });
    }

    const primaryImage =
      productImages[0] || image_url || null;

    const result = await q(
      `INSERT INTO products
      (
        seller_id,
        name,
        description,
        category,
        price,
        stock,
        image_url,
        images
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      RETURNING *`,
      [
        req.user.id,
        name,
        description || '',
        category,
        price,
        stock,
        primaryImage,
        JSON.stringify(productImages)
      ]
    );

    res.status(201).json({
      product: result.rows[0]
    });
  })
);

// =====================================================
// SELLER PRODUCT LIST
// Includes active and archived products.
// =====================================================

app.get(
  '/api/seller/products',
  auth,
  role('seller'),
  approved,
  wrap(async (req, res) => {
    const result = await q(
      `SELECT *
       FROM products
       WHERE seller_id=$1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({
      products: result.rows
    });
  })
);

// =====================================================
// UPDATE PRODUCTS
// =====================================================

app.patch(
  '/api/products/:id',
  auth,
  role('seller', 'admin'),
  approved,
  wrap(async (req, res) => {
    const old = await q(
      'SELECT * FROM products WHERE id=$1',
      [req.params.id]
    );

    if (!old.rows[0]) {
      return res.status(404).json({
        error: 'Product not found'
      });
    }

    if (
      req.user.role === 'seller' &&
      old.rows[0].seller_id !== req.user.id
    ) {
      return res.status(403).json({
        error: 'Not your product'
      });
    }

    const product = old.rows[0];
    const body = req.body;

    const result = await q(
      `UPDATE products SET
      name=$1,
      description=$2,
      category=$3,
      price=$4,
      stock=$5,
      image_url=$6,
      active=$7
      WHERE id=$8
      RETURNING *`,
      [
        body.name ?? product.name,
        body.description ?? product.description,
        body.category ?? product.category,
        body.price ?? product.price,
        body.stock ?? product.stock,
        body.image_url ?? product.image_url,
        body.active ?? product.active,
        product.id
      ]
    );

    res.json({
      product: result.rows[0]
    });
  })
);

// =====================================================
// ARCHIVE / RESTORE PRODUCTS
// =====================================================

app.patch(
  '/api/products/:id/archive',
  auth,
  role('seller', 'admin'),
  approved,
  wrap(async (req, res) => {
    if (typeof req.body.archived !== 'boolean') {
      return res.status(400).json({
        error: 'archived must be true or false'
      });
    }

    const old = await q(
      'SELECT * FROM products WHERE id=$1',
      [req.params.id]
    );

    if (!old.rows[0]) {
      return res.status(404).json({
        error: 'Product not found'
      });
    }

    const product = old.rows[0];

    if (
      req.user.role === 'seller' &&
      product.seller_id !== req.user.id
    ) {
      return res.status(403).json({
        error: 'Not your product'
      });
    }

    const result = await q(
      `UPDATE products
       SET archived_at = CASE
         WHEN $1 = true THEN COALESCE(archived_at, NOW())
         ELSE NULL
       END
       WHERE id = $2
       RETURNING *`,
      [req.body.archived, product.id]
    );

    res.json({
      message: req.body.archived
        ? 'Product archived successfully'
        : 'Product restored successfully',
      product: result.rows[0]
    });
  })
);

// =====================================================
// PERMANENTLY DELETE PRODUCT
// Requires archive first. Protects order history.
// =====================================================

app.delete(
  '/api/products/:id',
  auth,
  role('seller', 'admin'),
  approved,
  wrap(async (req, res) => {
    const old = await q(
      'SELECT * FROM products WHERE id=$1',
      [req.params.id]
    );

    if (!old.rows[0]) {
      return res.status(404).json({
        error: 'Product not found'
      });
    }

    const product = old.rows[0];

    if (
      req.user.role === 'seller' &&
      product.seller_id !== req.user.id
    ) {
      return res.status(403).json({
        error: 'Not your product'
      });
    }

    if (product.archived_at === null) {
      return res.status(400).json({
        error: 'Archive this product before permanently deleting it.'
      });
    }

    const result = await q(
      `DELETE FROM products p
       WHERE p.id=$1
       AND NOT EXISTS (
         SELECT 1
         FROM order_items oi
         WHERE oi.product_id=p.id
       )
       RETURNING p.id`,
      [product.id]
    );

    if (!result.rows[0]) {
      return res.status(409).json({
        error: 'This product has order history and cannot be permanently deleted. Keep it archived instead.'
      });
    }

    res.json({
      message: 'Product permanently deleted'
    });
  })
);

// =====================================================
// CUSTOMER ORDER CREATION
// Archived products cannot be checked out.
// =====================================================

app.post(
  '/api/orders',
  auth,
  role('customer'),
  approved,
  wrap(async (req, res) => {
    const {
      items,
      payment_method,
      shipping_name,
      shipping_phone,
      shipping_address,
      notes
    } = req.body;

    if (
      !Array.isArray(items) ||
      !items.length ||
      !['COD', 'GCash', 'Maya', 'Bank Transfer', 'Card'].includes(payment_method) ||
      !shipping_name ||
      !shipping_phone ||
      !shipping_address
    ) {
      return res.status(400).json({
        error: 'Complete checkout details required'
      });
    }

    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const ids = items.map(item => item.product_id);

      const products = await client.query(
        `SELECT * FROM products
         WHERE id = ANY($1::uuid[])
         AND active = true
         AND archived_at IS NULL
         FOR UPDATE`,
        [ids]
      );

      if (products.rows.length !== new Set(ids).size) {
        throw Error('Unavailable product');
      }

      const sellers = [
        ...new Set(
          products.rows.map(product => product.seller_id)
        )
      ];

      if (sellers.length !== 1) {
        throw Error('Checkout one seller at a time');
      }

      let subtotal = 0;

      const lines = items.map(item => {
        const product = products.rows.find(
          p => p.id === item.product_id
        );

        const quantity = Number(item.quantity);

        if (
          !Number.isInteger(quantity) ||
          quantity < 1 ||
          product.stock < quantity
        ) {
          throw Error(
            'Insufficient stock: ' + product.name
          );
        }

        subtotal += Number(product.price) * quantity;

        return {
          product,
          quantity
        };
      });

      const order = (
        await client.query(
          `INSERT INTO orders
          (
            customer_id,
            seller_id,
            status,
            payment_method,
            payment_status,
            subtotal,
            delivery_fee,
            total,
            shipping_name,
            shipping_phone,
            shipping_address,
            notes
          )
          VALUES
          ($1, $2, 'pending', $3, 'unpaid', $4, 0, $4, $5, $6, $7, $8)
          RETURNING *`,
          [
            req.user.id,
            sellers[0],
            payment_method,
            subtotal,
            shipping_name,
            shipping_phone,
            shipping_address,
            notes || ''
          ]
        )
      ).rows[0];

      for (const line of lines) {
        await client.query(
          `INSERT INTO order_items
          (order_id, product_id, product_name, quantity, unit_price)
          VALUES ($1, $2, $3, $4, $5)`,
          [
            order.id,
            line.product.id,
            line.product.name,
            line.quantity,
            line.product.price
          ]
        );

        await client.query(
          'UPDATE products SET stock=stock-$1 WHERE id=$2',
          [
            line.quantity,
            line.product.id
          ]
        );
      }

      await client.query('COMMIT');

      res.status(201).json({
        order
      });

    } catch (error) {
      await client.query('ROLLBACK');

      res.status(400).json({
        error: error.message
      });

    } finally {
      client.release();
    }
  })
);

// =====================================================
// ORDER VIEWING
// =====================================================

app.get(
  '/api/orders',
  auth,
  approved,
  wrap(async (req, res) => {
    let sql;
    let args;

    if (req.user.role === 'customer') {
      sql = `
        SELECT * FROM orders
        WHERE customer_id=$1
        ORDER BY created_at DESC
      `;

      args = [req.user.id];

    } else if (req.user.role === 'seller') {
      sql = `
        SELECT * FROM orders
        WHERE seller_id=$1
        ORDER BY created_at DESC
      `;

      args = [req.user.id];

    } else if (req.user.role === 'rider') {
      sql = `
        SELECT * FROM orders
        WHERE rider_id=$1
        ORDER BY created_at DESC
      `;

      args = [req.user.id];

    } else {
      sql = `
        SELECT * FROM orders
        ORDER BY created_at DESC
        LIMIT 200
      `;

      args = [];
    }

    const result = await q(sql, args);

    res.json({
      orders: result.rows
    });
  })
);

// =====================================================
// SELLER ORDER STATUS
// =====================================================

app.patch(
  '/api/orders/:id/status',
  auth,
  role('seller', 'admin'),
  approved,
  wrap(async (req, res) => {
    const allowed = [
      'accepted',
      'packed',
      'ready_for_pickup',
      'cancelled'
    ];

    if (!allowed.includes(req.body.status)) {
      return res.status(400).json({
        error: 'Invalid seller status'
      });
    }

    const old = await q(
      'SELECT * FROM orders WHERE id=$1',
      [req.params.id]
    );

    if (
      !old.rows[0] ||
      (
        req.user.role === 'seller' &&
        old.rows[0].seller_id !== req.user.id
      )
    ) {
      return res.status(404).json({
        error: 'Order not found'
      });
    }

    const result = await q(
      `UPDATE orders
       SET status=$1, updated_at=NOW()
       WHERE id=$2
       RETURNING *`,
      [
        req.body.status,
        req.params.id
      ]
    );

    res.json({
      order: result.rows[0]
    });
  })
);

// =====================================================
// RIDER DELIVERY MANAGEMENT
// =====================================================

app.get(
  '/api/rider/deliveries',
  auth,
  role('rider'),
  approved,
  wrap(async (req, res) => {
    const result = await q(
      `SELECT * FROM orders
       WHERE rider_id=$1
       OR (rider_id IS NULL AND status='ready_for_pickup')
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({
      deliveries: result.rows
    });
  })
);

app.patch(
  '/api/rider/deliveries/:id/status',
  auth,
  role('rider'),
  approved,
  wrap(async (req, res) => {
    const status = req.body.status;

    if (!['picked_up', 'in_transit', 'delivered'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid delivery status'
      });
    }

    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const old = await client.query(
        'SELECT * FROM orders WHERE id=$1 FOR UPDATE',
        [req.params.id]
      );

      if (!old.rows[0]) {
        throw Error('Delivery not found');
      }

      if (
        old.rows[0].rider_id &&
        old.rows[0].rider_id !== req.user.id
      ) {
        throw Error('Assigned to another rider');
      }

      if (
        !old.rows[0].rider_id &&
        old.rows[0].status !== 'ready_for_pickup'
      ) {
        throw Error('Not ready for pickup');
      }

      const result = await client.query(
        `UPDATE orders
         SET rider_id=$1, status=$2, updated_at=NOW()
         WHERE id=$3
         RETURNING *`,
        [
          req.user.id,
          status,
          req.params.id
        ]
      );

      await client.query(
        `INSERT INTO delivery_events
         (order_id, rider_id, status, note)
         VALUES ($1, $2, $3, $4)`,
        [
          req.params.id,
          req.user.id,
          status,
          req.body.note || ''
        ]
      );

      await client.query('COMMIT');

      res.json({
        delivery: result.rows[0]
      });

    } catch (error) {
      await client.query('ROLLBACK');

      res.status(400).json({
        error: error.message
      });

    } finally {
      client.release();
    }
  })
);

// =====================================================
// ADMIN OVERVIEW
// =====================================================

app.get(
  '/api/admin/overview',
  auth,
  role('admin'),
  wrap(async (req, res) => {
    const [
      users,
      products,
      orders,
      revenue,
      pending
    ] = await Promise.all([
      q(
        'SELECT role, COUNT(*)::int count FROM users GROUP BY role'
      ),

      q(
        'SELECT COUNT(*)::int count FROM products'
      ),

      q(
        'SELECT COUNT(*)::int count FROM orders'
      ),

      q(
        `SELECT COALESCE(SUM(total),0) total
         FROM orders
         WHERE status<>'cancelled'`
      ),

      q(
        `SELECT id, name, email, role
         FROM users
         WHERE role IN ('customer','seller','rider')
         AND approved=false`
      )
    ]);

    res.json({
      users: users.rows,
      products: products.rows[0].count,
      orders: orders.rows[0].count,
      revenue: revenue.rows[0].total,
      pendingApprovals: pending.rows
    });
  })
);

// =====================================================
// ADMIN PRODUCT MANAGEMENT
// =====================================================

app.get(
  '/api/admin/products',
  auth,
  role('admin'),
  wrap(async (req, res) => {
    const result = await q(
      `SELECT
        p.*,
        u.name AS seller_name,
        u.email AS seller_email
       FROM products p
       JOIN users u ON u.id = p.seller_id
       ORDER BY p.created_at DESC
       LIMIT 500`
    );

    res.json({
      products: result.rows
    });
  })
);

// =====================================================
// ADMIN USER MANAGEMENT
// =====================================================

app.get(
  '/api/admin/users',
  auth,
  role('admin'),
  wrap(async (req, res) => {
    const result = await q(
      `SELECT id, name, email, phone, role, approved, created_at
       FROM users
       ORDER BY created_at DESC
       LIMIT 500`
    );

    res.json({
      users: result.rows
    });
  })
);

app.patch(
  '/api/admin/users/:id/approval',
  auth,
  role('admin'),
  wrap(async (req, res) => {
    if (typeof req.body.approved !== 'boolean') {
      return res.status(400).json({
        error: 'approved boolean required'
      });
    }

    const result = await q(
      `UPDATE users
       SET approved=$1
       WHERE id=$2
       AND role IN ('customer','seller','rider')
       RETURNING id, name, email, role, approved`,
      [
        req.body.approved,
        req.params.id
      ]
    );

    if (!result.rows[0]) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    res.json({
      user: result.rows[0]
    });
  })
);

// =====================================================
// ERROR HANDLER
// =====================================================

app.use((error, req, res, next) => {
  console.error('API Error:', error);

  if (res.headersSent) {
    return next(error);
  }

  if (error.code === '23503') {
    return res.status(409).json({
      error: 'This record is linked to order history and cannot be deleted.'
    });
  }

  res.status(500).json({
    error: 'Server error'
  });
});

// =====================================================
// START SERVER
// =====================================================

(async () => {
  if (!process.env.DATABASE_URL) {
    throw Error('DATABASE_URL is required');
  }

  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32
  ) {
    throw Error('JWT_SECRET must be at least 32 characters');
  }

  if (
    !process.env.ADMIN_EMAIL ||
    !process.env.ADMIN_PASSWORD ||
    process.env.ADMIN_PASSWORD.length < 12
  ) {
    throw Error(
      'Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters'
    );
  }

  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required'
    );
  }

  const schemaPath = [
    path.join(__dirname, '../../database/schema.sql'),
    path.join(__dirname, '../database/schema.sql')
  ].find(fs.existsSync);

  if (!schemaPath) {
    throw Error('database/schema.sql not found');
  }

  const schema = fs.readFileSync(schemaPath, 'utf8');

  await db.query(schema);

  // Ensure product gallery column exists.
  await db.query(`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS
    images JSONB NOT NULL DEFAULT '[]'::jsonb
  `);

  // Ensure archive column and index exist.
  await db.query(`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS products_archived_at_idx
    ON products(archived_at)
  `);

  const exists = await q(
    'SELECT id FROM users WHERE email=$1',
    [process.env.ADMIN_EMAIL.toLowerCase()]
  );

  if (!exists.rows[0]) {
    await q(
      `INSERT INTO users
       (name, email, password_hash, role, approved)
       VALUES ($1, $2, $3, 'admin', true)`,
      [
        process.env.ADMIN_NAME || 'Storque Admin',
        process.env.ADMIN_EMAIL.toLowerCase(),
        await bcrypt.hash(process.env.ADMIN_PASSWORD, 12)
      ]
    );
  }

  const PORT = process.env.PORT || 4000;

  app.listen(PORT, () => {
    console.log('====================================');
    console.log('STORQUE INDUSTRIES API');
    console.log('====================================');
    console.log(`Server running on port ${PORT}`);
    console.log('Database connected');
    console.log('Supabase Storage configured');
    console.log('Product image upload enabled');
    console.log('Product archive and restore enabled');
    console.log('====================================');
  });

})().catch(error => {
  console.error('SERVER STARTUP ERROR:', error);
  process.exit(1);
});
