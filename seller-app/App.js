
import React, { useEffect, useState } from 'react';
import {
  SafeAreaView, View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, Image
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';

// ======================================================
// STORQUE INDUSTRIES - SELLER CENTER
// ======================================================

const API = 'http://192.168.254.104:4000/api';

const COLORS = {
  background: '#0B0B0D',
  surface: '#171719',
  surface2: '#222225',
  red: '#E32636',
  gold: '#D6AA55',
  white: '#FFFFFF',
  muted: '#A1A1AA',
  green: '#35C98A',
  border: '#303035'
};

const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

// ======================================================
// REUSABLE COMPONENTS
// ======================================================

function Field({
  label, value, onChangeText, placeholder,
  secureTextEntry = false, keyboardType = 'default',
  multiline = false
}) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || label}
        placeholderTextColor="#77777F"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize="none"
        multiline={multiline}
      />
    </View>
  );
}

function ActionButton({
  title, onPress, secondary = false, disabled = false
}) {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        secondary && styles.secondaryButton,
        disabled && { opacity: 0.5 }
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={[
        styles.buttonText,
        secondary && styles.secondaryText
      ]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

// ======================================================
// MAIN APPLICATION
// ======================================================

export default function App() {
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);
  const [pending, setPending] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);

  // ACCOUNT INFORMATION
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // PRODUCTS
  const [products, setProducts] = useState([]);
  const [productTab, setProductTab] = useState('active');

  const [form, setForm] = useState({
    name: '',
    category: '',
    price: '',
    stock: '',
    description: ''
  });

  // PRODUCT IMAGES
  const [selectedImages, setSelectedImages] = useState([]);

  // ORDERS
  const [orders, setOrders] = useState([]);
  const [ordersBusy, setOrdersBusy] = useState(false);
  const [orderTab, setOrderTab] = useState('all');

  // OTHER STATES
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);

  // ====================================================
  // API REQUEST HANDLER
  // ====================================================

  async function request(path, method = 'GET', body = null) {
    let response;

    try {
      response = await fetch(API + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch (error) {
      console.log('API NETWORK ERROR:', error);
      throw new Error(
        'Cannot connect to the server. Check your API address, network and backend.'
      );
    }

    const text = await response.text();
    let result = {};

    try {
      result = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(
        'Invalid server response. Check whether the backend is running.'
      );
    }

    if (!response.ok) {
      throw new Error(result.error || result.message || 'Request failed');
    }

    return result;
  }

  // ====================================================
  // SELLER LOGIN
  // ====================================================

  async function login() {
    if (!email.trim() || !password) {
      Alert.alert('Missing information', 'Enter your email and password.');
      return;
    }

    setBusy(true);

    try {
      const result = await request('/auth/login', 'POST', {
        email: email.trim(),
        password,
        role: 'seller'
      });

      setToken(result.token);
      setUser(result.user);
      setPending(false);
    } catch (error) {
      if (error.message.toLowerCase().includes('pending admin approval')) {
        setPending(true);
      } else {
        Alert.alert('Sign in failed', error.message);
      }
    } finally {
      setBusy(false);
    }
  }

  // ====================================================
  // SELLER REGISTRATION
  // ====================================================

  async function register() {
    if (!name.trim() || !email.trim() || !password) {
      Alert.alert(
        'Missing information',
        'Complete your full name, email and password.'
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

    setBusy(true);

    try {
      const result = await request('/auth/register', 'POST', {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        role: 'seller'
      });

      setPending(true);
      setRegisterMode(false);

      Alert.alert(
        'APPLICATION SUBMITTED',
        result.message ||
        'Your seller application was submitted successfully. Please wait for administrator approval.'
      );
    } catch (error) {
      Alert.alert('REGISTRATION FAILED', error.message);
    } finally {
      setBusy(false);
    }
  }

  // ====================================================
  // LOAD SELLER PRODUCTS
  // ====================================================

  async function loadProducts() {
    try {
      const result = await request('/seller/products');
      setProducts(result.products || []);
    } catch (error) {
      Alert.alert('Products', error.message);
    }
  }

  // ====================================================
  // LOAD SELLER ORDERS
  // ====================================================

  async function loadOrders(showError = true) {
    setOrdersBusy(true);

    try {
      const result = await request('/orders');
      setOrders(result.orders || []);
    } catch (error) {
      console.log('LOAD ORDERS ERROR:', error);

      if (showError) {
        Alert.alert('ORDERS', error.message);
      }
    } finally {
      setOrdersBusy(false);
    }
  }

  // ====================================================
  // UPDATE ORDER STATUS
  // ====================================================

  async function updateOrderStatus(order, status) {
    const labels = {
      accepted: 'accept',
      packed: 'mark as packed',
      ready_for_pickup: 'mark as ready for pickup',
      cancelled: 'cancel'
    };

    Alert.alert(
      'UPDATE ORDER',
      `Are you sure you want to ${labels[status]} order #${String(order.id).slice(0, 8)}?`,
      [
        { text: 'CANCEL', style: 'cancel' },
        {
          text: 'CONFIRM',
          onPress: async () => {
            try {
              await request(`/orders/${order.id}/status`, 'PATCH', {
                status
              });

              await loadOrders(false);

              Alert.alert(
                'ORDER UPDATED',
                `Order status changed to ${status.replace(/_/g, ' ').toUpperCase()}.`
              );
            } catch (error) {
              Alert.alert('UPDATE FAILED', error.message);
            }
          }
        }
      ]
    );
  }

  // ====================================================
  // PICK PRODUCT IMAGES
  // ====================================================

  async function pickImages() {
    if (selectedImages.length >= MAX_IMAGES) {
      Alert.alert('IMAGE LIMIT', 'You can select up to 5 images per product.');
      return;
    }

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Permission required',
          'Please allow access to your photo gallery.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: MAX_IMAGES - selectedImages.length,
        quality: 0.8
      });

      if (result.canceled) return;

      const allowedTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/webp'
      ];

      const validImages = result.assets.filter(image => {
        const mime = image.mimeType?.toLowerCase();

        if (mime && !allowedTypes.includes(mime)) return false;
        if (image.fileSize && image.fileSize > MAX_IMAGE_SIZE) return false;

        return true;
      });

      if (validImages.length !== result.assets.length) {
        Alert.alert(
          'Some images were skipped',
          'Only JPG, PNG and WEBP images up to 5 MB are supported.'
        );
      }

      setSelectedImages(previous =>
        [...previous, ...validImages].slice(0, MAX_IMAGES)
      );
    } catch (error) {
      Alert.alert('Gallery error', error.message);
    }
  }

  // ====================================================
  // REMOVE SELECTED IMAGE
  // ====================================================

  function removeImage(index) {
    setSelectedImages(previous => previous.filter((_, i) => i !== index));
  }

  // ====================================================
  // UPLOAD PRODUCT IMAGES TO SUPABASE
  // ====================================================

  async function uploadProductImages() {
    if (selectedImages.length === 0) {
      throw new Error('Please select at least one product photo.');
    }

    setUploadingImages(true);

    try {
      const data = new FormData();

      selectedImages.forEach((image, index) => {
        const mime = image.mimeType?.toLowerCase();

        const supportedMime =
          mime === 'image/png' ||
          mime === 'image/webp' ||
          mime === 'image/jpeg';

        const fileType = supportedMime ? mime : 'image/jpeg';

        const extension =
          fileType === 'image/png' ? 'png' :
          fileType === 'image/webp' ? 'webp' : 'jpg';

        data.append('images', {
          uri: image.uri,
          name: `product-${Date.now()}-${index}.${extension}`,
          type: fileType
        });
      });

      console.log('STORQUE IMAGE UPLOAD STARTED');
      console.log('Selected images:', selectedImages.length);

      let response;

      try {
        response = await fetch(API + '/products/images', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token
          },
          body: data
        });
      } catch (networkError) {
        console.log('IMAGE UPLOAD NETWORK ERROR:', networkError);
        throw new Error(
          'Cannot connect to the image upload server. Check your Wi-Fi, API address, Windows Firewall and backend.'
        );
      }

      const text = await response.text();
      let result = {};

      try {
        result = text ? JSON.parse(text) : {};
      } catch {
        console.log('IMAGE UPLOAD RAW RESPONSE:', text);
        throw new Error('The server returned an invalid response.');
      }

      console.log('IMAGE UPLOAD STATUS:', response.status);
      console.log('IMAGE UPLOAD RESPONSE:', JSON.stringify(result));

      if (!response.ok) {
        throw new Error(
          result.error || `Image upload failed. HTTP ${response.status}`
        );
      }

      if (!Array.isArray(result.images)) {
        throw new Error('The server did not return uploaded image URLs.');
      }

      if (result.images.length !== selectedImages.length) {
        throw new Error(
          'The number of uploaded images does not match the selected images.'
        );
      }

      console.log('STORQUE IMAGE UPLOAD SUCCESS:', result.images.length);
      return result.images;
    } finally {
      setUploadingImages(false);
    }
  }

  // ====================================================
  // PUBLISH PRODUCT
  // ====================================================

  async function publishProduct() {
    const price = Number(form.price);
    const stock = Number(form.stock);

    if (!form.name.trim() || !form.category.trim()) {
      Alert.alert('Missing details', 'Enter the product name and category.');
      return;
    }

    if (form.price.trim() === '' || !Number.isFinite(price) || price < 0) {
      Alert.alert('Invalid price', 'Enter a valid product price.');
      return;
    }

    if (
      form.stock.trim() === '' ||
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      Alert.alert('Invalid stock', 'Enter a whole number for stock.');
      return;
    }

    if (selectedImages.length === 0) {
      Alert.alert(
        'Product photo required',
        'Please select at least one photo from your gallery before publishing.'
      );
      return;
    }

    setBusy(true);

    try {
      const uploadedImages = await uploadProductImages();

      await request('/products', 'POST', {
        name: form.name.trim(),
        category: form.category.trim(),
        price,
        stock,
        description: form.description.trim(),
        images: uploadedImages,
        image_url: uploadedImages[0] || null
      });

      Alert.alert(
        'PRODUCT PUBLISHED',
        'Your product and its photos were uploaded successfully.'
      );

      setForm({
        name: '',
        category: '',
        price: '',
        stock: '',
        description: ''
      });

      setSelectedImages([]);
      await loadProducts();
    } catch (error) {
      console.log('PRODUCT PUBLISH ERROR:', error);
      Alert.alert('PUBLISHING FAILED', error.message);
    } finally {
      setBusy(false);
    }
  }

  // ====================================================
  // ACTIVATE / DEACTIVATE PRODUCT
  // ====================================================

  async function toggleProduct(product) {
    const nextStatus = !product.active;

    Alert.alert(
      nextStatus ? 'Activate product?' : 'Deactivate product?',
      `${product.name} will be ${
        nextStatus ? 'visible' : 'hidden'
      } in the marketplace.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await request('/products/' + product.id, 'PATCH', {
                active: nextStatus
              });
              await loadProducts();
            } catch (error) {
              Alert.alert('Update failed', error.message);
            }
          }
        }
      ]
    );
  }

  // ====================================================
  // ARCHIVE PRODUCT
  // ====================================================

  async function archiveProduct(product) {
    Alert.alert(
      'ARCHIVE PRODUCT?',
      `${product.name} will be removed from the public marketplace and moved to your Archived Products.`,
      [
        { text: 'CANCEL', style: 'cancel' },
        {
          text: 'ARCHIVE',
          style: 'destructive',
          onPress: async () => {
            try {
              await request(
                `/products/${product.id}/archive`,
                'PATCH',
                { archived: true }
              );

              Alert.alert('ARCHIVED', 'The product has been archived.');
              await loadProducts();
            } catch (error) {
              Alert.alert('ARCHIVE FAILED', error.message);
            }
          }
        }
      ]
    );
  }

  // ====================================================
  // RESTORE PRODUCT
  // ====================================================

  async function restoreProduct(product) {
    Alert.alert(
      'RESTORE PRODUCT?',
      `${product.name} will be moved back to your Active Products list.`,
      [
        { text: 'CANCEL', style: 'cancel' },
        {
          text: 'RESTORE',
          onPress: async () => {
            try {
              await request(
                `/products/${product.id}/archive`,
                'PATCH',
                { archived: false }
              );

              Alert.alert('RESTORED', 'The product has been restored.');
              await loadProducts();
            } catch (error) {
              Alert.alert('RESTORE FAILED', error.message);
            }
          }
        }
      ]
    );
  }

  // ====================================================
  // PERMANENTLY DELETE PRODUCT
  // ====================================================

  async function permanentlyDeleteProduct(product) {
    Alert.alert(
      'PERMANENTLY DELETE?',
      `Are you sure you want to permanently delete "${product.name}"?\n\nThis action cannot be undone. Products with order history cannot be permanently deleted.`,
      [
        { text: 'CANCEL', style: 'cancel' },
        {
          text: 'DELETE PERMANENTLY',
          style: 'destructive',
          onPress: async () => {
            try {
              await request(`/products/${product.id}`, 'DELETE');

              Alert.alert(
                'PRODUCT DELETED',
                'The product has been permanently deleted.'
              );

              await loadProducts();
            } catch (error) {
              Alert.alert('DELETE FAILED', error.message);
            }
          }
        }
      ]
    );
  }

  // ====================================================
  // LOGOUT
  // ====================================================

  function logout() {
    setToken('');
    setUser(null);
    setProducts([]);
    setOrders([]);
    setSelectedImages([]);
    setPending(false);
    setPassword('');
    setProductTab('active');
    setOrderTab('all');
    setSearch('');
  }

  // ====================================================
  // LOAD DATA AFTER LOGIN
  // ====================================================

  useEffect(() => {
    if (token && user) {
      loadProducts();
      loadOrders(false);
    }
  }, [token, user]);

  // ====================================================
  // PRODUCT FILTERING
  // ====================================================

  const activeProducts = products.filter(
    product => !product.archived_at
  );

  const archivedProducts = products.filter(
    product => !!product.archived_at
  );

  const displayedProducts = (
    productTab === 'active' ? activeProducts : archivedProducts
  ).filter(product =>
    String(product.name || '')
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  // ====================================================
  // ORDER FILTERING
  // ====================================================

  const displayedOrders = orders.filter(order => {
    if (orderTab === 'all') return true;

    if (orderTab === 'processing') {
      return ['accepted', 'packed'].includes(order.status);
    }

    return order.status === orderTab;
  });

  // ====================================================
  // PENDING APPROVAL SCREEN
  // ====================================================

  if (pending) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <StatusBar style="light" />
        <Text style={styles.logo}>STORQUE</Text>
        <Text style={styles.brandSub}>INDUSTRIES</Text>

        <View style={styles.pendingIcon}>
          <Text style={{ fontSize: 36 }}>⌛</Text>
        </View>

        <Text style={styles.screenTitle}>APPLICATION PENDING</Text>

        <Text style={styles.description}>
          Your seller account has been submitted successfully.
          Our administrator must approve your account before
          you can access Seller Center.
        </Text>

        <Text style={styles.smallText}>
          Please try signing in again after approval.
        </Text>

        <ActionButton
          title="BACK TO SIGN IN"
          onPress={() => {
            setPending(false);
            setRegisterMode(false);
          }}
        />
      </SafeAreaView>
    );
  }

  // ====================================================
  // LOGIN AND REGISTRATION SCREEN
  // ====================================================

  if (!user) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.authContainer}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={styles.brandBlock}>
              <Text style={styles.logo}>STORQUE</Text>
              <Text style={styles.brandSub}>INDUSTRIES</Text>
              <View style={styles.goldLine} />
              <Text style={styles.centerLabel}>SELLER CENTER</Text>
            </View>

            <Text style={styles.screenTitle}>
              {registerMode ? 'CREATE SELLER ACCOUNT' : 'WELCOME BACK'}
            </Text>

            <Text style={styles.description}>
              {registerMode
                ? 'Register your seller account and join our marketplace.'
                : 'Sign in to manage your store and products.'}
            </Text>

            {registerMode && (
              <>
                <Field
                  label="Full name"
                  value={name}
                  onChangeText={setName}
                />

                <Field
                  label="Phone number"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
              </>
            )}

            <Field
              label="Email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
            />

            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <ActionButton
              title={
                busy ? 'PLEASE WAIT...' :
                registerMode ? 'SUBMIT APPLICATION' : 'SIGN IN'
              }
              onPress={registerMode ? register : login}
              disabled={busy}
            />

            {busy && (
              <ActivityIndicator
                color={COLORS.gold}
                style={{ marginTop: 10 }}
              />
            )}

            <ActionButton
              title={registerMode ? 'BACK TO SIGN IN' : 'CREATE SELLER ACCOUNT'}
              secondary
              onPress={() => setRegisterMode(!registerMode)}
              disabled={busy}
            />

            <Text style={styles.footer}>
              SELL WITH CONFIDENCE. SELL WITH STORQUE.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ====================================================
  // SELLER DASHBOARD
  // ====================================================

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerBrand}>STORQUE INDUSTRIES</Text>
          <Text style={styles.headerSubtitle}>SELLER CENTER</Text>
        </View>

        <TouchableOpacity onPress={logout}>
          <Text style={styles.logout}>SIGN OUT</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.dashboard}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.welcome}>Welcome, {user.name}</Text>
        <Text style={styles.muted}>Manage your marketplace store.</Text>

        {/* PRODUCT STATISTICS */}

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{products.length}</Text>
            <Text style={styles.statLabel}>TOTAL PRODUCTS</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{activeProducts.length}</Text>
            <Text style={styles.statLabel}>ACTIVE LIST</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{archivedProducts.length}</Text>
            <Text style={styles.statLabel}>ARCHIVED</Text>
          </View>
        </View>

        {/* ================================================= */}
        {/* CUSTOMER ORDERS */}
        {/* ================================================= */}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>CUSTOMER ORDERS</Text>

          <TouchableOpacity onPress={() => loadOrders()}>
            <Text style={styles.refresh}>REFRESH ↻</Text>
          </TouchableOpacity>
        </View>

        {/* ORDER STATISTICS */}

        <View style={styles.orderStats}>
          <View style={styles.orderStat}>
            <Text style={styles.orderStatNumber}>{orders.length}</Text>
            <Text style={styles.orderStatLabel}>TOTAL</Text>
          </View>

          <View style={styles.orderStat}>
            <Text style={styles.orderStatNumber}>
              {orders.filter(o => o.status === 'pending').length}
            </Text>
            <Text style={styles.orderStatLabel}>PENDING</Text>
          </View>

          <View style={styles.orderStat}>
            <Text style={styles.orderStatNumber}>
              {orders.filter(o => o.status === 'ready_for_pickup').length}
            </Text>
            <Text style={styles.orderStatLabel}>READY</Text>
          </View>
        </View>

        {/* ORDER FILTER TABS */}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.orderTabsScroll}
        >
          <View style={styles.orderTabs}>
            {[
              { key: 'all', label: 'ALL' },
              { key: 'pending', label: 'PENDING' },
              { key: 'processing', label: 'PROCESSING' },
              { key: 'ready_for_pickup', label: 'READY' },
              { key: 'cancelled', label: 'CANCELLED' }
            ].map(tab => (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.orderTab,
                  orderTab === tab.key && styles.orderTabActive
                ]}
                onPress={() => setOrderTab(tab.key)}
              >
                <Text
                  style={[
                    styles.orderTabText,
                    orderTab === tab.key && styles.orderTabTextActive
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* ORDER LOADING */}

        {ordersBusy && (
          <ActivityIndicator
            color={COLORS.gold}
            size="large"
            style={{ marginVertical: 20 }}
          />
        )}

        {/* EMPTY ORDERS */}

        {!ordersBusy && displayedOrders.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>NO ORDERS FOUND</Text>
            <Text style={styles.muted}>
              Customer purchases for your products will appear here.
            </Text>
          </View>
        )}

        {/* ORDER CARDS */}

        {displayedOrders.map(order => {
          const items = Array.isArray(order.items) ? order.items : [];

          const statusColor =
            order.status === 'pending' ? COLORS.gold :
            ['accepted', 'packed', 'ready_for_pickup'].includes(order.status)
              ? COLORS.green :
            order.status === 'cancelled' ? COLORS.red :
            COLORS.muted;

          const nextAction =
            order.status === 'pending'
              ? { label: 'ACCEPT ORDER', status: 'accepted' } :
            order.status === 'accepted'
              ? { label: 'MARK AS PACKED', status: 'packed' } :
            order.status === 'packed'
              ? { label: 'READY FOR PICKUP', status: 'ready_for_pickup' } :
            null;

          return (
            <View key={order.id} style={styles.orderCard}>
              {/* ORDER HEADER */}

              <View style={styles.orderTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderNumber}>
                    ORDER #{String(order.id).slice(0, 8).toUpperCase()}
                  </Text>

                  <Text style={styles.orderDate}>
                    {order.created_at
                      ? new Date(order.created_at).toLocaleString()
                      : 'Date unavailable'}
                  </Text>
                </View>

                <View style={styles.orderStatusBadge}>
                  <Text style={[
                    styles.orderStatusText,
                    { color: statusColor }
                  ]}>
                    {String(order.status || 'unknown')
                      .replace(/_/g, ' ')
                      .toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={styles.orderDivider} />

              {/* CUSTOMER DETAILS */}

              <Text style={styles.orderSectionLabel}>
                CUSTOMER DETAILS
              </Text>

              <Text style={styles.orderCustomer}>
                {order.shipping_name || 'Customer'}
              </Text>

              <Text style={styles.orderDetail}>
                Phone: {order.shipping_phone || 'Not provided'}
              </Text>

              <Text style={styles.orderDetail}>
                Address: {order.shipping_address || 'Not provided'}
              </Text>

              <View style={styles.orderDivider} />

              {/* PURCHASED ITEMS */}

              <Text style={styles.orderSectionLabel}>
                PURCHASED ITEMS
              </Text>

              {items.length === 0 ? (
                <Text style={styles.orderDetail}>
                  No item details were returned.
                </Text>
              ) : (
                items.map((item, index) => (
                  <View
                    key={`${item.product_id || index}-${index}`}
                    style={styles.orderItem}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.orderItemName}>
                        {item.product_name || 'Product'}
                      </Text>

                      <Text style={styles.orderDetail}>
                        Quantity: {item.quantity}
                      </Text>

                      <Text style={styles.orderDetail}>
                        Unit price: ₱{Number(item.unit_price || 0)
                          .toLocaleString('en-PH', {
                            minimumFractionDigits: 2
                          })}
                      </Text>
                    </View>

                    <Text style={styles.orderItemPrice}>
                      ₱{(
                        Number(item.unit_price || 0) *
                        Number(item.quantity || 0)
                      ).toLocaleString('en-PH', {
                        minimumFractionDigits: 2
                      })}
                    </Text>
                  </View>
                ))
              )}

              <View style={styles.orderDivider} />

              {/* PAYMENT AND TOTAL */}

              <View style={styles.orderPaymentRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderSectionLabel}>
                    PAYMENT METHOD
                  </Text>

                  <Text style={styles.orderPayment}>
                    {order.payment_method || 'Not specified'}
                  </Text>

                  <Text style={styles.orderDetail}>
                    Payment status: {String(
                      order.payment_status || 'unknown'
                    ).toUpperCase()}
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.orderSectionLabel}>
                    ORDER TOTAL
                  </Text>

                  <Text style={styles.orderTotal}>
                    ₱{Number(order.total || 0).toLocaleString('en-PH', {
                      minimumFractionDigits: 2
                    })}
                  </Text>
                </View>
              </View>

              {order.notes ? (
                <View style={styles.orderNotes}>
                  <Text style={styles.orderSectionLabel}>
                    CUSTOMER NOTES
                  </Text>
                  <Text style={styles.orderDetail}>{order.notes}</Text>
                </View>
              ) : null}

              {/* SELLER ACTIONS */}

              {nextAction && (
                <TouchableOpacity
                  style={styles.orderActionButton}
                  onPress={() =>
                    updateOrderStatus(order, nextAction.status)
                  }
                >
                  <Text style={styles.orderActionButtonText}>
                    {nextAction.label}
                  </Text>
                </TouchableOpacity>
              )}

              {['pending', 'accepted', 'packed'].includes(order.status) && (
                <TouchableOpacity
                  style={styles.cancelOrderButton}
                  onPress={() =>
                    updateOrderStatus(order, 'cancelled')
                  }
                >
                  <Text style={styles.cancelOrderButtonText}>
                    CANCEL ORDER
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {/* ================================================= */}
        {/* ADD PRODUCT */}
        {/* ================================================= */}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ADD NEW PRODUCT</Text>
        </View>

        <View style={styles.panel}>
          <Field
            label="Product name"
            value={form.name}
            onChangeText={v => setForm(prev => ({ ...prev, name: v }))}
          />

          <Field
            label="Category"
            value={form.category}
            onChangeText={v => setForm(prev => ({ ...prev, category: v }))}
          />

          <Field
            label="Price (PHP)"
            value={form.price}
            onChangeText={v => setForm(prev => ({ ...prev, price: v }))}
            keyboardType="decimal-pad"
          />

          <Field
            label="Stock quantity"
            value={form.stock}
            onChangeText={v => setForm(prev => ({ ...prev, stock: v }))}
            keyboardType="number-pad"
          />

          <Field
            label="Description"
            value={form.description}
            onChangeText={v => setForm(prev => ({ ...prev, description: v }))}
            multiline
          />

          {/* PRODUCT IMAGE GALLERY */}

          <Text style={styles.fieldLabel}>
            PRODUCT PHOTOS ({selectedImages.length}/5)
          </Text>

          <Text style={styles.imageHint}>
            Select up to 5 photos from your device.
            JPG, PNG or WEBP. Maximum 5 MB each.
          </Text>

          <View style={styles.imageGrid}>
            {selectedImages.map((image, index) => (
              <View key={image.uri + index} style={styles.imagePreview}>
                <Image
                  source={{ uri: image.uri }}
                  style={styles.previewImage}
                />

                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => removeImage(index)}
                >
                  <Text style={styles.removeImageText}>×</Text>
                </TouchableOpacity>

                {index === 0 && (
                  <View style={styles.mainImageBadge}>
                    <Text style={styles.mainImageText}>MAIN</Text>
                  </View>
                )}
              </View>
            ))}

            {selectedImages.length < MAX_IMAGES && (
              <TouchableOpacity
                style={styles.addImageButton}
                onPress={pickImages}
                disabled={busy}
              >
                <Text style={styles.addImagePlus}>+</Text>
                <Text style={styles.addImageText}>ADD PHOTO</Text>
              </TouchableOpacity>
            )}
          </View>

          <ActionButton
            title={
              uploadingImages ? 'UPLOADING PHOTOS...' :
              busy ? 'PLEASE WAIT...' : 'PUBLISH PRODUCT'
            }
            onPress={publishProduct}
            disabled={busy || uploadingImages}
          />

          {uploadingImages && (
            <View style={styles.uploadStatus}>
              <ActivityIndicator color={COLORS.gold} />
              <Text style={styles.uploadStatusText}>
                Uploading your product photos...
              </Text>
            </View>
          )}
        </View>

        {/* ================================================= */}
        {/* PRODUCT LIST */}
        {/* ================================================= */}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>YOUR PRODUCTS</Text>

          <TouchableOpacity onPress={loadProducts}>
            <Text style={styles.refresh}>REFRESH ↻</Text>
          </TouchableOpacity>
        </View>

        {/* ACTIVE / ARCHIVED TABS */}

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[
              styles.tab,
              productTab === 'active' && styles.activeTab
            ]}
            onPress={() => setProductTab('active')}
          >
            <Text style={[
              styles.tabText,
              productTab === 'active' && styles.activeTabText
            ]}>
              ACTIVE ({activeProducts.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tab,
              productTab === 'archived' && styles.activeTab
            ]}
            onPress={() => setProductTab('archived')}
          >
            <Text style={[
              styles.tabText,
              productTab === 'archived' && styles.activeTabText
            ]}>
              ARCHIVED ({archivedProducts.length})
            </Text>
          </TouchableOpacity>
        </View>

        <Field
          label="Search products"
          value={search}
          onChangeText={setSearch}
          placeholder="Search by product name..."
        />

        {displayedProducts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {productTab === 'archived'
                ? 'NO ARCHIVED PRODUCTS'
                : 'NO PRODUCTS FOUND'}
            </Text>

            <Text style={styles.muted}>
              {productTab === 'archived'
                ? 'Products you archive will appear here.'
                : 'Your published products will appear here.'}
            </Text>
          </View>
        ) : (
          displayedProducts.map(product => {
            const isArchived = !!product.archived_at;

            return (
              <View key={product.id} style={styles.productCard}>
                {(product.images?.[0] || product.image_url) ? (
                  <Image
                    source={{
                      uri: product.images?.[0] || product.image_url
                    }}
                    style={styles.productThumbnail}
                  />
                ) : (
                  <View style={styles.productThumbnailPlaceholder}>
                    <Text style={{ color: COLORS.muted }}>NO IMAGE</Text>
                  </View>
                )}

                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{product.name}</Text>
                  <Text style={styles.productCategory}>
                    {product.category}
                  </Text>

                  <Text style={styles.productPrice}>
                    ₱{Number(product.price).toLocaleString('en-PH')}
                  </Text>

                  <Text style={styles.productStock}>
                    Stock: {product.stock}
                  </Text>

                  <Text
                    style={{
                      color: isArchived
                        ? COLORS.gold
                        : product.active ? COLORS.green : COLORS.red,
                      fontWeight: '800',
                      marginTop: 7
                    }}
                  >
                    {isArchived
                      ? 'ARCHIVED'
                      : product.active ? 'ACTIVE' : 'INACTIVE'}
                  </Text>

                  {/* PRODUCT ACTIONS */}

                  {isArchived ? (
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={styles.restoreButton}
                        onPress={() => restoreProduct(product)}
                      >
                        <Text style={styles.restoreButtonText}>RESTORE</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => permanentlyDeleteProduct(product)}
                      >
                        <Text style={styles.deleteButtonText}>DELETE</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={styles.statusButton}
                        onPress={() => toggleProduct(product)}
                      >
                        <Text style={styles.statusButtonText}>
                          {product.active ? 'DEACTIVATE' : 'ACTIVATE'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.archiveButton}
                        onPress={() => archiveProduct(product)}
                      >
                        <Text style={styles.archiveButtonText}>ARCHIVE</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}

        <Text style={styles.footer}>
          STORQUE INDUSTRIES · SELLER PORTAL
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ======================================================
// STYLES
// ======================================================

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background
  },

  centerScreen: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    padding: 25,
    alignItems: 'center'
  },

  authContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 25
  },

  brandBlock: {
    alignItems: 'center',
    marginBottom: 35
  },

  logo: {
    fontSize: 39,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: 4
  },

  brandSub: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 7,
    marginTop: 3
  },

  goldLine: {
    height: 3,
    width: 65,
    backgroundColor: COLORS.gold,
    marginVertical: 17
  },

  centerLabel: {
    color: COLORS.red,
    fontWeight: '900',
    letterSpacing: 3
  },

  screenTitle: {
    color: COLORS.white,
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 12
  },

  description: {
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 23
  },

  smallText: {
    color: COLORS.gold,
    textAlign: 'center',
    marginVertical: 18,
    lineHeight: 22
  },

  fieldContainer: {
    marginBottom: 13
  },

  fieldLabel: {
    color: COLORS.gold,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 7,
    letterSpacing: 1
  },

  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 14,
    color: COLORS.white,
    fontSize: 15
  },

  multiline: {
    minHeight: 85,
    textAlignVertical: 'top'
  },

  button: {
    backgroundColor: COLORS.red,
    padding: 16,
    borderRadius: 10,
    marginVertical: 7
  },

  buttonText: {
    color: COLORS.white,
    textAlign: 'center',
    fontWeight: '900',
    letterSpacing: 1
  },

  secondaryButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.gold
  },

  secondaryText: {
    color: COLORS.gold
  },

  footer: {
    color: '#66666D',
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 35,
    marginBottom: 15
  },

  pendingIcon: {
    backgroundColor: COLORS.surface,
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 25,
    borderWidth: 1,
    borderColor: COLORS.gold
  },

  header: {
    backgroundColor: COLORS.surface,
    padding: 20,
    paddingTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 2,
    borderBottomColor: COLORS.red
  },

  headerBrand: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 1
  },

  headerSubtitle: {
    color: COLORS.gold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 5
  },

  logout: {
    color: COLORS.red,
    fontWeight: '900',
    fontSize: 11
  },

  dashboard: {
    padding: 18,
    paddingBottom: 40
  },

  welcome: {
    color: COLORS.white,
    fontSize: 25,
    fontWeight: '900'
  },

  muted: {
    color: COLORS.muted,
    marginTop: 5
  },

  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 22
  },

  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 13,
    borderWidth: 1,
    borderColor: COLORS.border
  },

  statNumber: {
    color: COLORS.gold,
    fontSize: 25,
    fontWeight: '900'
  },

  statLabel: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: '800',
    marginTop: 7
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 13
  },

  sectionTitle: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1
  },

  refresh: {
    color: COLORS.gold,
    fontWeight: '900'
  },

  panel: {
    backgroundColor: COLORS.surface,
    padding: 15,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border
  },

  tabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 5,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border
  },

  tab: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 7,
    alignItems: 'center'
  },

  activeTab: {
    backgroundColor: COLORS.red
  },

  tabText: {
    color: COLORS.muted,
    fontWeight: '900',
    fontSize: 11
  },

  activeTabText: {
    color: COLORS.white
  },

  productCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start'
  },

  productInfo: {
    flex: 1
  },

  productName: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '900'
  },

  productCategory: {
    color: COLORS.muted,
    marginTop: 4
  },

  productPrice: {
    color: COLORS.gold,
    fontWeight: '900',
    fontSize: 17,
    marginTop: 8
  },

  productStock: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 4
  },

  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10
  },

  statusButton: {
    backgroundColor: COLORS.surface2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.red,
    padding: 9
  },

  statusButtonText: {
    color: COLORS.red,
    fontSize: 10,
    fontWeight: '900'
  },

  archiveButton: {
    backgroundColor: COLORS.surface2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.gold,
    padding: 9
  },

  archiveButtonText: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '900'
  },

  restoreButton: {
    backgroundColor: COLORS.surface2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.green,
    padding: 9
  },

  restoreButtonText: {
    color: COLORS.green,
    fontSize: 10,
    fontWeight: '900'
  },

  deleteButton: {
    backgroundColor: COLORS.surface2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.red,
    padding: 9
  },

  deleteButtonText: {
    color: COLORS.red,
    fontSize: 10,
    fontWeight: '900'
  },

  empty: {
    backgroundColor: COLORS.surface,
    padding: 25,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8
  },

  emptyTitle: {
    color: COLORS.gold,
    fontWeight: '900',
    marginBottom: 8
  },

  imageHint: {
    color: COLORS.muted,
    fontSize: 12,
    marginBottom: 12,
    lineHeight: 18
  },

  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18
  },

  imagePreview: {
    width: 95,
    height: 95,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: COLORS.surface2
  },

  previewImage: {
    width: '100%',
    height: '100%'
  },

  removeImageButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: COLORS.red,
    width: 25,
    height: 25,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },

  removeImageText: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 23
  },

  mainImageBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.gold,
    paddingVertical: 3
  },

  mainImageText: {
    color: COLORS.background,
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '900'
  },

  addImageButton: {
    width: 95,
    height: 95,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface2
  },

  addImagePlus: {
    color: COLORS.gold,
    fontSize: 32,
    fontWeight: '300'
  },

  addImageText: {
    color: COLORS.gold,
    fontSize: 9,
    fontWeight: '900',
    marginTop: 3
  },

  productThumbnail: {
    width: 75,
    height: 75,
    borderRadius: 9,
    marginRight: 12,
    backgroundColor: COLORS.surface2
  },

  productThumbnailPlaceholder: {
    width: 75,
    height: 75,
    borderRadius: 9,
    marginRight: 12,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center'
  },

  uploadStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 10
  },

  uploadStatusText: {
    color: COLORS.gold,
    fontSize: 12
  },

  // ====================================================
  // ORDER STYLES
  // ====================================================

  orderStats: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 15
  },

  orderStat: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12
  },

  orderStatNumber: {
    color: COLORS.gold,
    fontSize: 23,
    fontWeight: '900'
  },

  orderStatLabel: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: '900',
    marginTop: 5
  },

  orderTabsScroll: {
    marginBottom: 12
  },

  orderTabs: {
    flexDirection: 'row',
    gap: 7
  },

  orderTab: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 13
  },

  orderTabActive: {
    backgroundColor: COLORS.red,
    borderColor: COLORS.red
  },

  orderTabText: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '900'
  },

  orderTabTextActive: {
    color: COLORS.white
  },

  orderCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 13,
    padding: 14,
    marginBottom: 12
  },

  orderTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10
  },

  orderNumber: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '900'
  },

  orderDate: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 5
  },

  orderStatusBadge: {
    backgroundColor: COLORS.surface2,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 7
  },

  orderStatusText: {
    fontSize: 9,
    fontWeight: '900'
  },

  orderDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 13
  },

  orderSectionLabel: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 7
  },

  orderCustomer: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 5
  },

  orderDetail: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 19
  },

  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border
  },

  orderItemName: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 3
  },

  orderItemPrice: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '900',
    marginLeft: 10
  },

  orderPaymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },

  orderPayment: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 5
  },

  orderTotal: {
    color: COLORS.gold,
    fontSize: 18,
    fontWeight: '900'
  },

  orderNotes: {
    backgroundColor: COLORS.surface2,
    padding: 11,
    borderRadius: 8,
    marginTop: 12
  },

  orderActionButton: {
    backgroundColor: COLORS.green,
    padding: 14,
    borderRadius: 9,
    alignItems: 'center',
    marginTop: 15
  },

  orderActionButtonText: {
    color: COLORS.background,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1
  },

  cancelOrderButton: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.red,
    padding: 12,
    borderRadius: 9,
    alignItems: 'center',
    marginTop: 8
  },

  cancelOrderButtonText: {
    color: COLORS.red,
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 1
  }
});
