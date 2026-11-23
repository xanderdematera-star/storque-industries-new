import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function App() {
  const [token, setToken] = useState(localStorage.getItem('storque_admin_token') || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [data, setData] = useState({});
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState('overview');
  const [productSearch, setProductSearch] = useState('');

  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || result.message || 'Request failed');
    }

    return result;
  }

  async function loadDashboard() {
    setLoading(true);
    setError('');

    try {
      const [overview, userData, productData] = await Promise.all([
        request('/admin/overview'),
        request('/admin/users'),
        request('/admin/products')
      ]);

      setData(overview);
      setUsers(userData.users || []);
      setProducts(productData.products || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) loadDashboard();
  }, [token]);

  async function login(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      if (result.user?.role !== 'admin') {
        throw new Error('This account is not an administrator.');
      }

      localStorage.setItem('storque_admin_token', result.token);
      setToken(result.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function approveUser(user) {
    const approved = user.approved !== true;

    try {
      await request(`/admin/users/${user.id}/approval`, {
        method: 'PATCH',
        body: JSON.stringify({ approved })
      });

      await loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleProduct(product) {
    const action = product.active ? 'deactivate' : 'activate';

    if (!window.confirm(`Are you sure you want to ${action} this product?`)) {
      return;
    }

    try {
      await request(`/products/${product.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !product.active })
      });

      await loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  }

  function logout() {
    localStorage.removeItem('storque_admin_token');
    setToken('');
    setData({});
    setUsers([]);
    setProducts([]);
  }

  if (!token) {
    return (
      <div className="login-screen">
        <form className="login-card" onSubmit={login}>
          <img
            className="login-logo"
            src="/storque_logo.png"
            alt="Storque Industries"
          />

          <h1>STORQUE INDUSTRIES</h1>
          <p>ADMIN CONTROL CENTER</p>

          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Admin email"
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Admin password"
              required
            />
          </div>

          <button className="primary-button" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    );
  }

  const filteredProducts = products.filter(product =>
    `${product.name || ''} ${product.category || ''} ${product.seller_name || ''}`
      .toLowerCase()
      .includes(productSearch.toLowerCase())
  );

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <img
          className="sidebar-logo"
          src="/storque_logo.png"
          alt="Logo"
        />

        <h2>STORQUE</h2>
        <p className="sidebar-subtitle">ADMIN CONTROL CENTER</p>

        <nav className="sidebar-nav">
          <button
            className={page === 'overview' ? 'active' : ''}
            onClick={() => setPage('overview')}
          >
            Overview
          </button>

          <button
            className={page === 'users' ? 'active' : ''}
            onClick={() => setPage('users')}
          >
            User Management
          </button>

          <button
            className={page === 'products' ? 'active' : ''}
            onClick={() => setPage('products')}
          >
            Product Management
          </button>
        </nav>

        <div className="sidebar-footer">
          <button className="logout-button" onClick={logout}>
            Log Out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <h1>
              {page === 'overview' && 'Dashboard Overview'}
              {page === 'users' && 'User Management'}
              {page === 'products' && 'Product Management'}
            </h1>
            <p>STORQUE INDUSTRIES — Administration Portal</p>
          </div>

          <div className="admin-profile">Administrator</div>
        </header>

        {error && <div className="error-message">{error}</div>}

        {loading && <p>Loading dashboard...</p>}

        {!loading && page === 'overview' && (
          <>
            <section className="stats-grid">
              <StatCard label="Total Users" value={data.totalUsers ?? data.users ?? users.length} />
              <StatCard label="Total Products" value={data.totalProducts ?? products.length} />
              <StatCard label="Total Orders" value={data.totalOrders ?? data.orders ?? 0} />
              <StatCard label="Pending Approvals" value={users.filter(u => !u.approved).length} />
            </section>

            <section className="panel">
              <div className="panel-header">
                <h2>Recent Users</h2>
              </div>

              <UserTable users={users.slice(0, 5)} approveUser={approveUser} />
            </section>
          </>
        )}

        {!loading && page === 'users' && (
          <section className="panel">
            <div className="panel-header">
              <h2>Registered Users</h2>
              <span>{users.length} accounts</span>
            </div>

            <UserTable users={users} approveUser={approveUser} />
          </section>
        )}

        {!loading && page === 'products' && (
          <>
            <section className="product-summary">
              <div>
                <span>Total Products</span>
                <strong>{products.length}</strong>
              </div>

              <div>
                <span>Active Products</span>
                <strong>{products.filter(p => p.active).length}</strong>
              </div>

              <div>
                <span>Inactive Products</span>
                <strong>{products.filter(p => !p.active).length}</strong>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h2>Marketplace Products</h2>
              </div>

              <div className="product-toolbar">
                <input
                  type="search"
                  placeholder="Search products, categories, sellers..."
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                />

                <span>{filteredProducts.length} products found</span>
              </div>

              <ProductTable
                products={filteredProducts}
                toggleProduct={toggleProduct}
              />
            </section>
          </>
        )}

        <button className="secondary-button" onClick={loadDashboard}>
          Refresh Data
        </button>
      </main>
    </div>
  );
}


function StatCard({ label, value }) {
  const displayValue =
    typeof value === 'number' || typeof value === 'string'
      ? value
      : Array.isArray(value)
        ? value.reduce((total, item) => total + Number(item.count || 0), 0)
        : value && typeof value === 'object'
          ? Number(value.count ?? 0)
          : 0;

  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{displayValue}</strong>
    </div>
  );
}

function UserTable({ users, approveUser }) {
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>

        <tbody>
          {users.map(user => (
            <tr key={user.id}>
              <td>{user.name}</td>
              <td>{user.email}</td>
              <td>{user.role}</td>
              <td>
                <span className={`status ${user.approved ? 'approved' : 'pending'}`}>
                  {user.approved ? 'Approved' : 'Pending'}
                </span>
              </td>
              <td>
                <button
                  className="action-button"
                  onClick={() => approveUser(user)}
                >
                  {user.approved ? 'Revoke' : 'Approve'}
                </button>
              </td>
            </tr>
          ))}

          {users.length === 0 && (
            <tr>
              <td colSpan="5">No users found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ProductTable({ products, toggleProduct }) {
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Category</th>
            <th>Seller</th>
            <th>Price</th>
            <th>Stock</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>

        <tbody>
          {products.map(product => (
            <tr key={product.id}>
              <td>{product.name}</td>
              <td>{product.category || 'Uncategorized'}</td>
              <td>{product.seller_name || 'Unknown seller'}</td>
              <td>₱{Number(product.price || 0).toFixed(2)}</td>
              <td>{product.stock ?? 0}</td>
              <td>
                <span className={`status ${product.active ? 'active' : 'inactive'}`}>
                  {product.active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td>
                <button
                  className="deactivate-button"
                  onClick={() => toggleProduct(product)}
                >
                  {product.active ? 'Deactivate' : 'Activate'}
                </button>
              </td>
            </tr>
          ))}

          {products.length === 0 && (
            <tr>
              <td colSpan="7">No products found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);