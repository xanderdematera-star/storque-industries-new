import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';

const API =
  process.env.EXPO_PUBLIC_API_URL ||
  'http://192.168.254.104:4000/api';

const ORANGE = '#D6A84F';
const BLACK = '#111114';
const BG = '#F5F5F6';
const WHITE = '#FFFFFF';
const MUTED = '#777780';
const GOLD_DARK = '#9A702A';
const PALE_GOLD = '#FFF6E5';

const PAYMENT_METHODS = [
  'COD',
  'GCash',
  'Maya',
  'Bank Transfer',
  'Card',
];

const money = value =>
  '₱' + Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function App() {
  // Authentication
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [registerMode, setRegisterMode] = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');

  // Marketplace
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Shopping cart
  const [cart, setCart] = useState([]);

  // Checkout
  const [shippingName, setShippingName] = useState('');
  const [shippingPhone, setShippingPhone] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [payment, setPayment] = useState('COD');

  // Orders
  const [orders, setOrders] = useState([]);

  // Navigation
  const [tab, setTab] = useState('Home');
  const [checkoutMode, setCheckoutMode] = useState(false);

  // Loading
  const [loading, setLoading] = useState(false);

  async function call(path, method = 'GET', body) {
    const response = await fetch(API + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token
          ? { Authorization: 'Bearer ' + token }
          : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error('Invalid server response.');
    }

    if (!response.ok) {
      throw new Error(data.error || 'Request failed.');
    }

    return data;
  }

  // --------------------------------------------------
  // AUTHENTICATION
  // --------------------------------------------------

  async function login() {
    if (!email.trim() || !password) {
      Alert.alert('Missing details', 'Enter your email and password.');
      return;
    }

    setLoading(true);

    try {
      const data = await call('/auth/login', 'POST', {
        email: email.trim(),
        password,
        role: 'customer',
      });

      setToken(data.token);
      setUser(data.user);
      setShippingName(data.user.name || '');
      setPendingMessage('');
    } catch (error) {
      Alert.alert('Sign in failed', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function register() {
    if (!name.trim() || !email.trim() || !password || !phone.trim()) {
      Alert.alert(
        'Missing details',
        'Complete all registration fields.'
      );
      return;
    }

    if (password.length < 8) {
      Alert.alert(
        'Password too short',
        'Your password must contain at least 8 characters.'
      );
      return;
    }

    setLoading(true);

    try {
      await call('/auth/register', 'POST', {
        name: name.trim(),
        email: email.trim(),
        password,
        phone: phone.trim(),
        role: 'customer',
      });

      setRegisterMode(false);
      setPassword('');

      setPendingMessage(
        'Your registration was submitted successfully. Your account is waiting for administrator approval. You can sign in after approval.'
      );

      Alert.alert(
        'Registration submitted',
        'Your account is pending admin approval. Please sign in after your account has been approved.'
      );
    } catch (error) {
      Alert.alert('Registration failed', error.message);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    setToken('');
    setUser(null);
    setProducts([]);
    setOrders([]);
    setCart([]);
    setSelectedProduct(null);
    setCheckoutMode(false);
    setTab('Home');
  }

  // --------------------------------------------------
  // PRODUCTS
  // --------------------------------------------------

  async function loadProducts() {
    setLoading(true);

    try {
      const params = new URLSearchParams();

      if (search.trim()) params.append('q', search.trim());
      if (category !== 'All') params.append('category', category);

      const query = params.toString();
      const data = await call('/products' + (query ? '?' + query : ''));

      setProducts(data.products || []);
    } catch (error) {
      Alert.alert('Marketplace error', error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) {
      loadProducts();
      loadOrders();
    }
  }, [token]);

  const categories = useMemo(() => {
    const values = [...new Set(
      products.map(p => p.category).filter(Boolean)
    )];

    return ['All', ...values];
  }, [products]);

  // --------------------------------------------------
  // CART
  // --------------------------------------------------

  const cartCount = cart.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const subtotal = cart.reduce(
    (sum, item) =>
      sum + Number(item.product.price) * item.quantity,
    0
  );

  function addToCart(product) {
    if (product.stock < 1) {
      Alert.alert('Out of stock', 'This product is unavailable.');
      return;
    }

    if (!product.active || product.archived_at) {
      Alert.alert('Unavailable', 'This product cannot be purchased.');
      return;
    }

    if (
      cart.length > 0 &&
      cart[0].product.seller_id !== product.seller_id
    ) {
      Alert.alert(
        'One seller per order',
        'Your cart already contains products from another seller. Complete that order first, or clear your cart.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Clear cart',
            style: 'destructive',
            onPress: () => {
              setCart([{ product, quantity: 1 }]);
              setSelectedProduct(null);
            },
          },
        ]
      );
      return;
    }

    setCart(current => {
      const existing = current.find(
        item => item.product.id === product.id
      );

      if (existing) {
        if (existing.quantity >= product.stock) {
          Alert.alert('Stock limit', 'No more stock available.');
          return current;
        }

        return current.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...current, { product, quantity: 1 }];
    });

    Alert.alert('Added to cart', product.name + ' added successfully.');
    setSelectedProduct(null);
  }

  function changeQuantity(productId, amount) {
    setCart(current =>
      current
        .map(item => {
          if (item.product.id !== productId) return item;

          const next = item.quantity + amount;

          if (next < 1) return null;

          if (next > item.product.stock) {
            Alert.alert('Stock limit', 'Not enough stock available.');
            return item;
          }

          return { ...item, quantity: next };
        })
        .filter(Boolean)
    );
  }

  function removeFromCart(productId) {
    setCart(current =>
      current.filter(item => item.product.id !== productId)
    );
  }

  // --------------------------------------------------
  // CHECKOUT
  // --------------------------------------------------

  async function placeOrder() {
    if (cart.length === 0) {
      Alert.alert('Empty cart', 'Add products before checkout.');
      return;
    }

    if (
      !shippingName.trim() ||
      !shippingPhone.trim() ||
      !shippingAddress.trim()
    ) {
      Alert.alert(
        'Incomplete checkout',
        'Please complete your delivery information.'
      );
      return;
    }

    Alert.alert(
      'Confirm order',
      `Total: ${money(subtotal)}\nPayment: ${payment}\n\nPlace your order?`,
      [
        { text: 'Review', style: 'cancel' },
        {
          text: 'Place order',
          onPress: submitOrder,
        },
      ]
    );
  }

  async function submitOrder() {
    setLoading(true);

    try {
      const data = await call('/orders', 'POST', {
        items: cart.map(item => ({
          product_id: item.product.id,
          quantity: item.quantity,
        })),
        payment_method: payment,
        shipping_name: shippingName.trim(),
        shipping_phone: shippingPhone.trim(),
        shipping_address: shippingAddress.trim(),
        notes: notes.trim(),
      });

      setCart([]);
      setCheckoutMode(false);
      setSelectedProduct(null);
      setTab('Orders');

      Alert.alert(
        'Order placed!',
        `Your order has been submitted.\nOrder ID: ${data.order.id}`
      );

      await loadOrders();
      await loadProducts();
    } catch (error) {
      Alert.alert(
        'Checkout failed',
        error.message +
          '\n\nPlease check your stock and try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  // --------------------------------------------------
  // ORDER HISTORY
  // --------------------------------------------------

  async function loadOrders() {
    try {
      const data = await call('/orders');
      setOrders(data.orders || []);
    } catch (error) {
      Alert.alert('Orders error', error.message);
    }
  }

  // --------------------------------------------------
  // UI HELPERS
  // --------------------------------------------------

  function button(label, onPress, color = ORANGE, disabled = false) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        style={{
          backgroundColor: disabled ? '#AAAAAA' : color,
          padding: 14,
          borderRadius: 12,
          marginVertical: 5,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: WHITE, fontWeight: '900' }}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  }

  function field(label, value, setter, options = {}) {
    return (
      <View style={{ marginBottom: 12 }}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={setter}
          placeholder={options.placeholder || label}
          secureTextEntry={options.secure || false}
          keyboardType={options.keyboard || 'default'}
          autoCapitalize={options.capitalization || 'sentences'}
          multiline={options.multiline || false}
          style={[
            styles.input,
            options.multiline && {
              minHeight: 90,
              textAlignVertical: 'top',
            },
          ]}
        />
      </View>
    );
  }

  function productImage(product, height = 145) {
    const url =
      product.images?.[0] ||
      product.image_url;

    return (
      <View
        style={{
          height,
          backgroundColor: '#EEEEEE',
          borderRadius: 12,
          overflow: 'hidden',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {url ? (
          <Image
            source={{ uri: url }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        ) : (
          <Text style={{ fontSize: 42 }}>📦</Text>
        )}
      </View>
    );
  }

  // --------------------------------------------------
  // AUTH SCREEN
  // --------------------------------------------------

  if (!user) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />

        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <Text style={styles.brand}>STORQUE</Text>
          <Text style={styles.brandSub}>INDUSTRIES</Text>

          <Text style={styles.authTitle}>
            {registerMode ? 'Create your account' : 'Welcome back'}
          </Text>

          <Text style={styles.muted}>
            {registerMode
              ? 'Join the Storque marketplace.'
              : 'Sign in to continue shopping.'}
          </Text>

          {pendingMessage ? (
            <View style={styles.notice}>
              <Text style={{ color: '#8A4B00', lineHeight: 21 }}>
                {pendingMessage}
              </Text>
            </View>
          ) : null}

          {registerMode && (
            <>
              {field('Full name', name, setName)}
              {field('Phone number', phone, setPhone, {
                keyboard: 'phone-pad',
              })}
            </>
          )}

          {field('Email address', email, setEmail, {
            keyboard: 'email-address',
            capitalization: 'none',
          })}

          {field('Password', password, setPassword, {
            secure: true,
            capitalization: 'none',
          })}

          {button(
            loading
              ? 'PLEASE WAIT...'
              : registerMode
                ? 'CREATE ACCOUNT'
                : 'SIGN IN',
            registerMode ? register : login,
            ORANGE,
            loading
          )}

          <TouchableOpacity
            onPress={() => setRegisterMode(!registerMode)}
            style={{ padding: 15 }}
          >
            <Text style={{ textAlign: 'center', color: BLACK }}>
              {registerMode
                ? 'Already have an account? Sign in'
                : "Don't have an account? Register"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.muted}>
            Customer accounts require administrator approval.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --------------------------------------------------
  // PRODUCT DETAILS
  // --------------------------------------------------

  if (selectedProduct) {
    const p = selectedProduct;

    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={BLACK} />

        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSelectedProduct(null)}>
            <Text style={styles.headerLink}>← BACK</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>PRODUCT DETAILS</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {productImage(p, 280)}

          <Text style={styles.productTitle}>{p.name}</Text>
          <Text style={styles.price}>{money(p.price)}</Text>

          <Text style={styles.muted}>
            Category: {p.category}
          </Text>

          <Text style={styles.muted}>
            Sold by: {p.seller_name || 'Storque Seller'}
          </Text>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.bodyText}>
              {p.description || 'No description available.'}
            </Text>

            <Text style={styles.bodyText}>
              Available stock: {p.stock}
            </Text>
          </View>

          {button(
            'ADD TO CART',
            () => addToCart(p),
            ORANGE,
            Number(p.stock) < 1
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --------------------------------------------------
  // MAIN APP
  // --------------------------------------------------

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={BLACK} />

      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>STORQUE</Text>
          <Text style={styles.headerSubtitle}>INDUSTRIES MARKETPLACE</Text>
        </View>

        <TouchableOpacity
          onPress={() => setTab('Account')}
          style={styles.headerIconButton}
        >
          <Text style={styles.headerIcon}>♙</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setTab('Cart')}
          style={styles.headerIconButton}
        >
          <Text style={styles.headerIcon}>
            🛒{cartCount > 0 ? ` ${cartCount}` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
      >
        {checkoutMode ? (
          <>
            <TouchableOpacity onPress={() => setCheckoutMode(false)}>
              <Text style={styles.backText}>← Back to cart</Text>
            </TouchableOpacity>

            <Text style={styles.screenTitle}>Checkout</Text>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>
                Delivery information
              </Text>

              {field('Recipient name', shippingName, setShippingName)}
              {field('Phone number', shippingPhone, setShippingPhone, {
                keyboard: 'phone-pad',
              })}
              {field(
                'Complete delivery address',
                shippingAddress,
                setShippingAddress,
                { multiline: true }
              )}
              {field('Order notes (optional)', notes, setNotes, {
                multiline: true,
              })}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Payment method</Text>

              {PAYMENT_METHODS.map(method => (
                <TouchableOpacity
                  key={method}
                  onPress={() => setPayment(method)}
                  style={[
                    styles.paymentOption,
                    payment === method && styles.paymentSelected,
                  ]}
                >
                  <Text style={{ fontSize: 16 }}>
                    {payment === method ? '🔘' : '⚪'} {method}
                  </Text>
                </TouchableOpacity>
              ))}

              <Text style={styles.muted}>
                Payment gateway processing is not yet connected.
                GCash, Maya, Bank Transfer, and Card are currently
                recorded as selected payment methods. Follow the
                seller/admin payment instructions when applicable.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Order summary</Text>

              {cart.map(item => (
                <View key={item.product.id} style={styles.summaryRow}>
                  <Text style={styles.bodyText}>
                    {item.product.name} × {item.quantity}
                  </Text>
                  <Text style={styles.bodyText}>
                    {money(item.product.price * item.quantity)}
                  </Text>
                </View>
              ))}

              <View style={styles.summaryRow}>
                <Text style={styles.sectionTitle}>Total</Text>
                <Text style={styles.price}>{money(subtotal)}</Text>
              </View>

              <Text style={styles.muted}>
                Delivery fee: Not yet configured (₱0.00)
              </Text>
            </View>

            {button(
              loading ? 'PROCESSING...' : 'PLACE ORDER',
              placeOrder,
              ORANGE,
              loading
            )}
          </>
        ) : tab === 'Home' ? (
          <>
            <View style={styles.homeGreeting}>
              <Text style={styles.greetingSmall}>WELCOME BACK</Text>
              <Text style={styles.greetingName}>
                {user.name || 'Customer'} 👋
              </Text>
            </View>

            <TouchableOpacity
              style={styles.hero}
              onPress={() => setTab('Shop')}
              activeOpacity={0.9}
            >
              <Text style={styles.heroSmall}>STORQUE INDUSTRIES</Text>
              <Text style={styles.heroTitle}>DISCOVER MORE.</Text>
              <Text style={styles.heroDescription}>
                Your marketplace for hardware, electronics, and more.
              </Text>
              <View style={styles.heroAction}>
                <Text style={styles.heroActionText}>
                  EXPLORE MARKETPLACE →
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.quickGrid}>
              {[
                {
                  title: 'Shop',
                  icon: '▦',
                  target: 'Shop',
                  subtitle: 'Explore products',
                },
                {
                  title: 'Coupons',
                  icon: '％',
                  target: 'Coupons',
                  subtitle: 'Vouchers & deals',
                },
                {
                  title: 'My Orders',
                  icon: '▤',
                  target: 'Orders',
                  subtitle: 'Purchase updates',
                },
                {
                  title: 'News',
                  icon: '▣',
                  target: 'News',
                  subtitle: 'Latest updates',
                },
              ].map(item => (
                <TouchableOpacity
                  key={item.title}
                  style={styles.quickTile}
                  onPress={() => setTab(item.target)}
                >
                  <Text style={styles.quickIcon}>{item.icon}</Text>
                  <Text style={styles.quickTitle}>{item.title}</Text>
                  <Text style={styles.quickSubtitle}>
                    {item.subtitle}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.sectionHeadingRow}>
              <Text style={styles.screenTitle}>Browse categories</Text>
              <TouchableOpacity
                onPress={() => {
                  setCategory('All');
                  setTab('Shop');
                }}
              >
                <Text style={styles.seeAll}>SEE ALL</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }}
            >
              {categories.map(item => (
                <TouchableOpacity
                  key={item}
                  onPress={() => {
                    setCategory(item);
                    setTab('Shop');
                  }}
                  style={styles.categoryChip}
                >
                  <Text style={{ color: BLACK, fontWeight: '800' }}>
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.sectionHeadingRow}>
              <Text style={styles.screenTitle}>Featured products</Text>
              <TouchableOpacity onPress={() => setTab('Shop')}>
                <Text style={styles.seeAll}>VIEW SHOP</Text>
              </TouchableOpacity>
            </View>

            {products.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>
                  Your marketplace is ready
                </Text>
                <Text style={styles.muted}>
                  Products from approved sellers will appear here.
                </Text>
                {button('REFRESH PRODUCTS', loadProducts, BLACK)}
              </View>
            ) : (
              <View style={styles.productGrid}>
                {products.slice(0, 4).map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.productCard}
                    onPress={() => setSelectedProduct(p)}
                    activeOpacity={0.85}
                  >
                    {productImage(p, 125)}
                    <Text style={styles.productName} numberOfLines={2}>
                      {p.name}
                    </Text>
                    <Text style={styles.price}>{money(p.price)}</Text>
                    <TouchableOpacity
                      onPress={() => addToCart(p)}
                      style={styles.smallButton}
                    >
                      <Text style={styles.smallButtonText}>
                        + ADD TO CART
                      </Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        ) : tab === 'Coupons' ? (
          <>
            <Text style={styles.screenTitle}>My coupons</Text>

            <View style={styles.couponBanner}>
              <Text style={styles.couponBannerTitle}>
                SAVE MORE WITH STORQUE
              </Text>
              <Text style={styles.couponBannerText}>
                Promotional vouchers and seller discounts will be shown
                here when they are enabled.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Available vouchers</Text>
              <View style={styles.emptyIcon}>
                <Text style={{ fontSize: 34 }}>％</Text>
              </View>
              <Text style={styles.emptyTitle}>No active coupons yet</Text>
              <Text style={styles.muted}>
                Check back for marketplace promotions. Valid coupon
                codes will appear here once the coupon feature is
                connected.
              </Text>
              {button(
                'CONTINUE SHOPPING',
                () => setTab('Shop'),
                BLACK
              )}
            </View>
          </>
        ) : tab === 'News' ? (
          <>
            <Text style={styles.screenTitle}>News & updates</Text>

            <View style={styles.newsFeature}>
              <Text style={styles.newsTag}>STORQUE BULLETIN</Text>
              <Text style={styles.newsTitle}>
                Stay connected with STORQUE
              </Text>
              <Text style={styles.newsText}>
                Marketplace announcements, new features, seller updates,
                and upcoming promotions will appear in this section.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>
                Latest announcements
              </Text>
              <View style={styles.emptyIcon}>
                <Text style={{ fontSize: 32 }}>▤</Text>
              </View>
              <Text style={styles.emptyTitle}>
                No news published yet
              </Text>
              <Text style={styles.muted}>
                There are no announcements to show right now. Please
                check again later.
              </Text>
            </View>
          </>
        ) : tab === 'Shop' ? (
          <>
            <View style={styles.hero}>
              <Text style={styles.heroSmall}>WELCOME TO</Text>
              <Text style={styles.heroTitle}>STORQUE MARKETPLACE</Text>
              <Text style={styles.heroDescription}>
                Hardware, electronics, and more.
              </Text>
            </View>

            <Text style={styles.screenTitle}>Discover products</Text>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search products..."
              style={styles.input}
              returnKeyType="search"
              onSubmitEditing={loadProducts}
            />

            {button('SEARCH PRODUCTS', loadProducts)}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginVertical: 12 }}
            >
              {categories.map(item => (
                <TouchableOpacity
                  key={item}
                  onPress={() => {
                    setCategory(item);
                  }}
                  style={[
                    styles.categoryChip,
                    category === item && styles.categorySelected,
                  ]}
                >
                  <Text
                    style={{
                      color: category === item ? WHITE : BLACK,
                      fontWeight: '800',
                    }}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {loading ? (
              <ActivityIndicator size="large" color={ORANGE} />
            ) : products.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>
                  No products found
                </Text>
                <Text style={styles.muted}>
                  Try another search or refresh the marketplace.
                </Text>
                {button('REFRESH', loadProducts)}
              </View>
            ) : (
              <View style={styles.productGrid}>
                {products.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.productCard}
                    onPress={() => setSelectedProduct(p)}
                    activeOpacity={0.85}
                  >
                    {productImage(p, 125)}

                    <Text style={styles.productName} numberOfLines={2}>
                      {p.name}
                    </Text>

                    <Text style={styles.price}>
                      {money(p.price)}
                    </Text>

                    <Text style={styles.stockText}>
                      Stock: {p.stock}
                    </Text>

                    <TouchableOpacity
                      onPress={() => addToCart(p)}
                      style={styles.smallButton}
                    >
                      <Text style={styles.smallButtonText}>
                        + ADD TO CART
                      </Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        ) : 

                  tab === 'Cart' ? (
            <>
              <Text style={styles.screenTitle}>
                Shopping cart ({cartCount})
              </Text>

              {cart.length === 0 ? (
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>
                    Your cart is empty
                  </Text>
                  <Text style={styles.muted}>
                    Browse the marketplace and add something you like.
                  </Text>
                  {button(
                    'START SHOPPING',
                    () => setTab('Shop')
                  )}
                </View>
              ) : (
                <>
                  {cart.map(item => (
                    <View
                      key={item.product.id}
                      style={styles.cartItem}
                    >
                      <View style={{ width: 95 }}>
                        {productImage(item.product, 90)}
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.productName}>
                          {item.product.name}
                        </Text>

                        <Text style={styles.price}>
                          {money(item.product.price)}
                        </Text>

                        <View style={styles.quantityRow}>
                          <TouchableOpacity
                            onPress={() =>
                              changeQuantity(item.product.id, -1)
                            }
                            style={styles.quantityButton}
                          >
                            <Text style={styles.quantityText}>−</Text>
                          </TouchableOpacity>

                          <Text style={styles.quantityText}>
                            {item.quantity}
                          </Text>

                          <TouchableOpacity
                            onPress={() =>
                              changeQuantity(item.product.id, 1)
                            }
                            style={styles.quantityButton}
                          >
                            <Text style={styles.quantityText}>+</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() =>
                              removeFromCart(item.product.id)
                            }
                          >
                            <Text
                              style={{
                                color: '#D93025',
                                fontWeight: '800',
                              }}
                            >
                              Remove
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ))}

                  <View style={styles.card}>
                    <View style={styles.summaryRow}>
                      <Text style={styles.sectionTitle}>Subtotal</Text>
                      <Text style={styles.price}>
                        {money(subtotal)}
                      </Text>
                    </View>

                    <Text style={styles.muted}>
                      Delivery fee is currently ₱0.00.
                    </Text>

                    {button(
                      'PROCEED TO CHECKOUT',
                      () => {
                        setCheckoutMode(true);
                        setTab('Cart');
                      }
                    )}
                  </View>
                </>
              )}
            </>
          ) : tab === 'Orders' ? (
            <>
              <Text style={styles.screenTitle}>My orders</Text>

              {button('REFRESH ORDERS', loadOrders)}

              {orders.length === 0 ? (
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>
                    No orders yet
                  </Text>
                  <Text style={styles.muted}>
                    Your purchases will appear here.
                  </Text>
                </View>
              ) : (
                orders.map(order => (
                  <View key={order.id} style={styles.card}>
                    <Text style={styles.sectionTitle}>
                      Order #
                      {String(order.id).slice(0, 8).toUpperCase()}
                    </Text>

                    <Text style={styles.bodyText}>
                      Status:{' '}
                      {String(order.status)
                        .replace(/_/g, ' ')
                        .toUpperCase()}
                    </Text>

                    <Text style={styles.bodyText}>
                      Payment: {order.payment_method}
                    </Text>

                    <Text style={styles.bodyText}>
                      Payment status: {order.payment_status}
                    </Text>

                    <Text style={styles.price}>
                      {money(order.total)}
                    </Text>

                    <Text style={styles.muted}>
                      {order.shipping_address}
                    </Text>

                    <Text style={styles.muted}>
                      Ordered:{' '}
                      {new Date(order.created_at).toLocaleString()}
                    </Text>
                  </View>
                ))
              )}
            </>
          ) : (
            // ACCOUNT
            <>
              <View style={styles.accountHero}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>
                    {(user.name || 'C').charAt(0).toUpperCase()}
                  </Text>
                </View>

                <Text style={styles.accountName}>
                  {user.name || 'Customer'}
                </Text>

                <Text style={styles.accountEmail}>
                  {user.email || email}
                </Text>

                <Text style={styles.accountMember}>
                  STORQUE CUSTOMER
                </Text>
              </View>

              <View style={styles.accountMenu}>
                {[
                  {
                    title: 'My orders',
                    detail: 'View purchases and order status',
                    icon: '▤',
                    target: 'Orders',
                  },
                  {
                    title: 'My coupons',
                    detail: 'View available vouchers',
                    icon: '％',
                    target: 'Coupons',
                  },
                  {
                    title: 'News & announcements',
                    detail: 'Marketplace updates',
                    icon: '▣',
                    target: 'News',
                  },
                  {
                    title: 'Shopping cart',
                    detail: `${cartCount} item(s) in your cart`,
                    icon: '🛒',
                    target: 'Cart',
                  },
                ].map(item => (
                  <TouchableOpacity
                    key={item.title}
                    style={styles.accountRow}
                    onPress={() => setTab(item.target)}
                  >
                    <Text style={styles.accountRowIcon}>
                      {item.icon}
                    </Text>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.accountRowTitle}>
                        {item.title}
                      </Text>
                      <Text style={styles.accountRowDetail}>
                        {item.detail}
                      </Text>
                    </View>

                    <Text style={styles.accountArrow}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>
                  Delivery information
                </Text>

                <Text style={styles.bodyText}>
                  {shippingName ||
                    user.name ||
                    'No recipient name saved'}
                </Text>

                <Text style={styles.muted}>
                  {shippingPhone ||
                    user.phone ||
                    'No phone number entered yet'}
                </Text>

                <Text style={styles.muted}>
                  {shippingAddress ||
                    'Your delivery address will be entered during checkout.'}
                </Text>
              </View>

              {button('SIGN OUT', logout, BLACK)}
            </>
          )}
        </ScrollView>

        {/* BOTTOM NAVIGATION */}
        {!checkoutMode && (
          <View style={styles.bottomNav}>
            {[
              { name: 'Home', icon: '⌂' },
              { name: 'Shop', icon: '▦' },
              { name: 'News', icon: '▤' },
              { name: 'Cart', icon: '🛒' },
              { name: 'Account', icon: '♙' },
            ].map(item => (
              <TouchableOpacity
                key={item.name}
                onPress={() => {
                  setTab(item.name);
                  setSelectedProduct(null);
                }}
                style={styles.navItem}
              >
                <Text
                  style={[
                    styles.navIcon,
                    tab === item.name && styles.navIconActive,
                  ]}
                >
                  {item.icon}
                  {item.name === 'Cart' && cartCount > 0
                    ? ` ${cartCount}`
                    : ''}
                </Text>

                <Text
                  style={[
                    styles.navLabel,
                    tab === item.name && styles.navLabelActive,
                  ]}
                >
                  {item.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </SafeAreaView>
    );
  }


// =====================================================
// STYLES
// =====================================================

const styles = {
  safe: {
    flex: 1,
    backgroundColor: BG,
  },

  header: {
    backgroundColor: BLACK,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2926',
  },

  headerTitle: {
    color: ORANGE,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
  },

  headerSubtitle: {
    color: '#B9B9BD',
    marginTop: 2,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
  },

  headerLink: {
    color: ORANGE,
    fontWeight: '900',
  },

  headerIconButton: {
    padding: 8,
    marginLeft: 5,
  },

  headerIcon: {
    color: WHITE,
    fontSize: 19,
    fontWeight: '800',
  },

  brand: {
    fontSize: 45,
    fontWeight: '900',
    color: BLACK,
    letterSpacing: 2,
  },

  brandSub: {
    fontSize: 17,
    color: ORANGE,
    fontWeight: '900',
    letterSpacing: 5,
    marginBottom: 35,
  },

  authTitle: {
    fontSize: 27,
    fontWeight: '900',
    color: BLACK,
    marginBottom: 8,
  },

  muted: {
    color: MUTED,
    lineHeight: 20,
    marginTop: 5,
    fontSize: 13,
  },

  notice: {
    backgroundColor: '#FFF0D9',
    padding: 13,
    borderRadius: 12,
    marginVertical: 15,
  },

  label: {
    fontWeight: '800',
    color: BLACK,
    marginBottom: 6,
  },

  input: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: '#E2E2E5',
    padding: 13,
    borderRadius: 11,
    color: BLACK,
    fontSize: 15,
  },

  content: {
    padding: 16,
    paddingBottom: 35,
  },

  screenTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: BLACK,
    marginVertical: 12,
  },

  homeGreeting: {
    marginBottom: 14,
  },

  greetingSmall: {
    color: GOLD_DARK,
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 2,
  },

  greetingName: {
    color: BLACK,
    fontSize: 23,
    fontWeight: '900',
    marginTop: 3,
  },

  hero: {
    backgroundColor: BLACK,
    borderRadius: 20,
    padding: 22,
    marginBottom: 17,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#3C3324',
  },

  heroSmall: {
    color: ORANGE,
    fontWeight: '900',
    letterSpacing: 3,
    fontSize: 10,
  },

  heroTitle: {
    color: WHITE,
    fontSize: 28,
    fontWeight: '900',
    marginVertical: 8,
  },

  heroDescription: {
    color: '#D1D1D4',
    lineHeight: 20,
    maxWidth: 260,
  },

  heroAction: {
    alignSelf: 'flex-start',
    backgroundColor: ORANGE,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 17,
  },

  heroActionText: {
    color: BLACK,
    fontWeight: '900',
    fontSize: 11,
  },

  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  quickTile: {
    width: '48.5%',
    backgroundColor: WHITE,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ECECEF',
  },

  quickIcon: {
    color: GOLD_DARK,
    fontSize: 25,
    fontWeight: '900',
    marginBottom: 7,
  },

  quickTitle: {
    color: BLACK,
    fontSize: 14,
    fontWeight: '900',
  },

  quickSubtitle: {
    color: MUTED,
    fontSize: 11,
    marginTop: 3,
  },

  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  seeAll: {
    color: GOLD_DARK,
    fontSize: 10,
    fontWeight: '900',
  },

  categoryChip: {
    backgroundColor: WHITE,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    marginRight: 9,
    borderWidth: 1,
    borderColor: '#E3E3E6',
  },

  categorySelected: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },

  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  productCard: {
    width: '48.5%',
    backgroundColor: WHITE,
    borderRadius: 14,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ECECEF',
  },

  productName: {
    color: BLACK,
    fontWeight: '900',
    fontSize: 14,
    marginTop: 10,
  },

  productTitle: {
    fontSize: 25,
    color: BLACK,
    fontWeight: '900',
    marginTop: 18,
  },

  price: {
    color: GOLD_DARK,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 6,
  },

  stockText: {
    color: MUTED,
    fontSize: 12,
    marginTop: 5,
  },

  smallButton: {
    backgroundColor: BLACK,
    padding: 10,
    borderRadius: 9,
    marginTop: 10,
  },

  smallButtonText: {
    color: ORANGE,
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 11,
  },

  card: {
    backgroundColor: WHITE,
    borderRadius: 14,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#ECECEF',
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: BLACK,
    marginBottom: 8,
  },

  bodyText: {
    color: BLACK,
    lineHeight: 23,
    marginVertical: 3,
  },

  paymentOption: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#DDDDDD',
    borderRadius: 10,
    marginVertical: 5,
  },

  paymentSelected: {
    borderColor: ORANGE,
    backgroundColor: PALE_GOLD,
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 6,
  },

  cartItem: {
    backgroundColor: WHITE,
    padding: 12,
    borderRadius: 13,
    marginBottom: 12,
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderColor: '#ECECEF',
  },

  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    flexWrap: 'wrap',
  },

  quantityButton: {
    backgroundColor: '#EEEEEE',
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  quantityText: {
    fontSize: 16,
    fontWeight: '900',
    color: BLACK,
  },

  backText: {
    color: GOLD_DARK,
    fontWeight: '900',
    marginVertical: 8,
  },

  bottomNav: {
    flexDirection: 'row',
    backgroundColor: WHITE,
    borderTopWidth: 1,
    borderTopColor: '#E6E6E8',
    paddingTop: 9,
    paddingBottom: 7,
    justifyContent: 'space-around',
  },

  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },

  navIcon: {
    fontSize: 19,
    color: MUTED,
    fontWeight: '900',
  },

  navIconActive: {
    color: GOLD_DARK,
  },

  navLabel: {
    color: MUTED,
    fontWeight: '800',
    fontSize: 10,
    marginTop: 3,
  },

  navLabelActive: {
    color: GOLD_DARK,
  },
    couponBanner: {
    backgroundColor: BLACK,
    borderRadius: 16,
    padding: 19,
    marginBottom: 12,
  },

  couponBannerTitle: {
    color: ORANGE,
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 1,
  },

  couponBannerText: {
    color: '#E0E0E0',
    lineHeight: 20,
    marginTop: 8,
  },

  emptyIcon: {
    alignSelf: 'center',
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: PALE_GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },

  emptyTitle: {
    color: BLACK,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '900',
  },

  newsFeature: {
    backgroundColor: BLACK,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
  },

  newsTag: {
    color: ORANGE,
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 2,
  },

  newsTitle: {
    color: WHITE,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 10,
  },

  newsText: {
    color: '#D0D0D3',
    lineHeight: 21,
    marginTop: 8,
  },

  accountHero: {
    backgroundColor: BLACK,
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
    marginBottom: 14,
  },

  avatarCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  avatarText: {
    color: BLACK,
    fontSize: 28,
    fontWeight: '900',
  },

  accountName: {
    color: WHITE,
    fontSize: 20,
    fontWeight: '900',
  },

  accountEmail: {
    color: '#C9C9CC',
    marginTop: 4,
  },

  accountMember: {
    color: ORANGE,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 10,
  },

  accountMenu: {
    backgroundColor: WHITE,
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ECECEF',
  },

  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F1',
    gap: 12,
  },

  accountRowIcon: {
    color: GOLD_DARK,
    fontSize: 22,
    width: 28,
    textAlign: 'center',
  },

  accountRowTitle: {
    color: BLACK,
    fontWeight: '900',
    fontSize: 14,
  },

  accountRowDetail: {
    color: MUTED,
    fontSize: 11,
    marginTop: 3,
  },

  accountArrow: {
    color: MUTED,
    fontSize: 25,
  },
};