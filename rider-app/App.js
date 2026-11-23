
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ======================================================
// STORQUE INDUSTRIES — RIDER DELIVERY APP
// ======================================================

// Physical Android phone: use your computer's LAN IP.
// Android emulator: use http://10.0.2.2:4000/api
const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  "http://192.168.254.104:4000/api";

// ======================================================
// API HELPER
// ======================================================

async function apiRequest(path, options = {}, token = null) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text || "Invalid server response." };
  }

  if (!response.ok) {
    throw new Error(
      data.message || data.error || `Request failed (${response.status})`
    );
  }

  return data;
}

// ======================================================
// HELPERS
// ======================================================

const STATUS_INFO = {
  ready_for_pickup: {
    label: "Ready for pickup",
    color: "#D97706",
    background: "#FEF3C7",
    description: "Collect this order from the seller.",
  },
  picked_up: {
    label: "Picked up",
    color: "#2563EB",
    background: "#DBEAFE",
    description: "The package has been collected.",
  },
  in_transit: {
    label: "In transit",
    color: "#7C3AED",
    background: "#EDE9FE",
    description: "Deliver the package to the customer.",
  },
  delivered: {
    label: "Delivered",
    color: "#15803D",
    background: "#DCFCE7",
    description: "This order has been completed.",
  },
};

const NEXT_STATUS = {
  ready_for_pickup: "picked_up",
  picked_up: "in_transit",
  in_transit: "delivered",
};

const NEXT_ACTION = {
  ready_for_pickup: "Confirm pickup",
  picked_up: "Start delivery",
  in_transit: "Mark as delivered",
};

function getStatus(status) {
  return (
    STATUS_INFO[status] || {
      label: String(status || "Unknown").replace(/_/g, " "),
      color: "#64748B",
      background: "#F1F5F9",
      description: "Delivery status",
    }
  );
}

function formatOrderId(id) {
  if (!id) return "ORDER";
  return `#${String(id).slice(0, 8).toUpperCase()}`;
}

// ======================================================
// MAIN APP
// ======================================================

export default function App() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);

  const [screen, setScreen] = useState("login");
  const [authMode, setAuthMode] = useState("login");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const [error, setError] = useState("");

  // ----------------------------------------------------
  // AUTHENTICATION
  // ----------------------------------------------------

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Missing information", "Enter your email and password.");
      return;
    }

    if (authMode === "register" && !name.trim()) {
      Alert.alert("Missing information", "Enter your full name.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const endpoint =
        authMode === "login" ? "/auth/login" : "/auth/register";

      const body =
        authMode === "login"
          ? {
              email: email.trim(),
              password,
              role: "rider",
            }
          : {
              name: name.trim(),
              email: email.trim(),
              password,
              role: "rider",
            };

      const result = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!result.token) {
        throw new Error(
          result.message ||
            "Your account is not ready. Check your registration or approval status."
        );
      }

      setToken(result.token);
      setUser(result.user || { name: name.trim(), email: email.trim() });
      setPassword("");
      setScreen("home");
    } catch (err) {
      setError(err.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          setToken(null);
          setUser(null);
          setDeliveries([]);
          setSearch("");
          setFilter("all");
          setScreen("login");
          setAuthMode("login");
          setEmail("");
          setPassword("");
          setName("");
        },
      },
    ]);
  };

  // ----------------------------------------------------
  // LOAD DELIVERIES
  // ----------------------------------------------------

  const loadDeliveries = useCallback(
    async (showLoader = true) => {
      if (!token) return;

      if (showLoader) setLoading(true);

      setError("");

      try {
        const result = await apiRequest(
          "/rider/deliveries",
          { method: "GET" },
          token
        );

        setDeliveries(
          Array.isArray(result.deliveries) ? result.deliveries : []
        );
      } catch (err) {
        setError(err.message || "Unable to load deliveries.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (token) {
      setScreen("home");
      loadDeliveries();
    }
  }, [token, loadDeliveries]);

  const refreshDeliveries = () => {
    setRefreshing(true);
    loadDeliveries(false);
  };

  // ----------------------------------------------------
  // UPDATE DELIVERY STATUS
  // ----------------------------------------------------

  const updateDeliveryStatus = async (delivery) => {
    const nextStatus = NEXT_STATUS[delivery.status];

    if (!nextStatus) return;

    const action = NEXT_ACTION[delivery.status];

    Alert.alert(
      action,
      `Update ${formatOrderId(delivery.id)} to "${getStatus(nextStatus).label}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            try {
              setUpdatingId(delivery.id);
              setError("");

              await apiRequest(
                `/rider/deliveries/${delivery.id}/status`,
                {
                  method: "PATCH",
                  body: JSON.stringify({ status: nextStatus }),
                },
                token
              );

              await loadDeliveries(false);

              Alert.alert(
                "Status updated",
                `${formatOrderId(delivery.id)} is now ${getStatus(nextStatus).label}.`
              );
            } catch (err) {
              Alert.alert(
                "Update failed",
                err.message || "Could not update delivery status."
              );
            } finally {
              setUpdatingId(null);
            }
          },
        },
      ]
    );
  };

  // ----------------------------------------------------
  // FILTER AND SEARCH
  // ----------------------------------------------------

  const filteredDeliveries = useMemo(() => {
    return deliveries.filter((delivery) => {
      const matchesFilter =
        filter === "all" || delivery.status === filter;

      const query = search.trim().toLowerCase();

      const matchesSearch =
        !query ||
        String(delivery.id || "").toLowerCase().includes(query) ||
        String(delivery.shipping_name || "").toLowerCase().includes(query) ||
        String(delivery.shipping_address || "").toLowerCase().includes(query) ||
        String(delivery.shipping_phone || "").toLowerCase().includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [deliveries, filter, search]);

  const activeCount = deliveries.filter(
    (item) => item.status !== "delivered"
  ).length;

  const completedCount = deliveries.filter(
    (item) => item.status === "delivered"
  ).length;

  const readyCount = deliveries.filter(
    (item) => item.status === "ready_for_pickup"
  ).length;

  // ====================================================
  // LOGIN / REGISTRATION SCREEN
  // ====================================================

  if (!token) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#111111" />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.authKeyboard}
        >
          <ScrollView
            contentContainerStyle={styles.authContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.logoCircle}>
              <Text style={styles.logoLetter}>S</Text>
            </View>

            <Text style={styles.brand}>STORQUE</Text>
            <Text style={styles.brandSubtitle}>INDUSTRIES</Text>

            <View style={styles.authCard}>
              <Text style={styles.authTitle}>
                {authMode === "login" ? "Rider Login" : "Rider Registration"}
              </Text>

              <Text style={styles.authSubtitle}>
                {authMode === "login"
                  ? "Sign in to manage your deliveries."
                  : "Create your rider account."}
              </Text>

              {authMode === "register" && (
                <>
                  <Text style={styles.inputLabel}>FULL NAME</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Your full name"
                    placeholderTextColor="#9CA3AF"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />
                </>
              )}

              <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
              <TextInput
                style={styles.input}
                placeholder="rider@example.com"
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.inputLabel}>PASSWORD</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor="#9CA3AF"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  loading && styles.disabledButton,
                ]}
                onPress={handleAuth}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#111111" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {authMode === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.authSwitch}
                onPress={() => {
                  setAuthMode(
                    authMode === "login" ? "register" : "login"
                  );
                  setError("");
                }}
              >
                <Text style={styles.authSwitchText}>
                  {authMode === "login"
                    ? "New rider? Create an account"
                    : "Already registered? Sign in"}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.footerText}>
              STORQUE INDUSTRIES DELIVERY NETWORK
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ====================================================
  // DELIVERY DASHBOARD
  // ====================================================

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#111111" />

      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerBrand}>STORQUE</Text>
          <Text style={styles.headerSubtitle}>RIDER DELIVERY</Text>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutText}>SIGN OUT</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshDeliveries}
            tintColor="#EAB308"
            colors={["#EAB308"]}
          />
        }
      >
        {/* WELCOME */}
        <View style={styles.welcomeSection}>
          <Text style={styles.greeting}>WELCOME BACK,</Text>
          <Text style={styles.riderName}>
            {user?.name || user?.email || "Rider"}
          </Text>
          <Text style={styles.welcomeDescription}>
            Here's your delivery overview.
          </Text>
        </View>

        {/* STATISTICS */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{activeCount}</Text>
            <Text style={styles.statLabel}>ACTIVE</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{readyCount}</Text>
            <Text style={styles.statLabel}>FOR PICKUP</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{completedCount}</Text>
            <Text style={styles.statLabel}>COMPLETED</Text>
          </View>
        </View>

        {/* DELIVERY SECTION */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>My Deliveries</Text>
            <Text style={styles.sectionSubtitle}>
              Manage your assigned orders
            </Text>
          </View>

          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => loadDeliveries()}
          >
            <Text style={styles.refreshButtonText}>REFRESH</Text>
          </TouchableOpacity>
        </View>

        {/* SEARCH */}
        <TextInput
          style={styles.searchInput}
          placeholder="Search order, customer, address..."
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
        />

        {/* FILTERS */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterContainer}
        >
          {[
            { key: "all", label: "All" },
            { key: "ready_for_pickup", label: "For Pickup" },
            { key: "picked_up", label: "Picked Up" },
            { key: "in_transit", label: "In Transit" },
            { key: "delivered", label: "Delivered" },
          ].map((item) => (
            <TouchableOpacity
              key={item.key}
              onPress={() => setFilter(item.key)}
              style={[
                styles.filterButton,
                filter === item.key && styles.activeFilterButton,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === item.key && styles.activeFilterText,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ERROR */}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => loadDeliveries()}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* LOADING */}
        {loading && deliveries.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#EAB308" />
            <Text style={styles.loadingText}>Loading deliveries...</Text>
          </View>
        ) : null}

        {/* EMPTY STATE */}
        {!loading && filteredDeliveries.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>No deliveries found</Text>
            <Text style={styles.emptyDescription}>
              {search
                ? "Try a different search term."
                : "New delivery assignments will appear here."}
            </Text>
            <TouchableOpacity
              style={styles.emptyRefreshButton}
              onPress={() => loadDeliveries()}
            >
              <Text style={styles.emptyRefreshText}>CHECK AGAIN</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* DELIVERY CARDS */}
        {filteredDeliveries.map((delivery) => {
          const status = getStatus(delivery.status);
          const nextStatus = NEXT_STATUS[delivery.status];
          const isUpdating = updatingId === delivery.id;

          return (
            <View key={String(delivery.id)} style={styles.deliveryCard}>
              <View style={styles.deliveryTop}>
                <View>
                  <Text style={styles.orderLabel}>ORDER</Text>
                  <Text style={styles.orderId}>
                    {formatOrderId(delivery.id)}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: status.background },
                  ]}
                >
                  <Text style={[styles.statusText, { color: status.color }]}>
                    {status.label}
                  </Text>
                </View>
              </View>

              <View style={styles.cardDivider} />

              {/* CUSTOMER */}
              <Text style={styles.detailLabel}>CUSTOMER</Text>
              <Text style={styles.detailValue}>
                {delivery.shipping_name || "Customer"}
              </Text>

              {/* PHONE */}
              <Text style={styles.detailLabel}>CONTACT NUMBER</Text>
              <Text style={styles.detailValue}>
                {delivery.shipping_phone || "No phone number provided"}
              </Text>

              {/* ADDRESS */}
              <Text style={styles.detailLabel}>DELIVERY ADDRESS</Text>
              <Text style={styles.addressValue}>
                {delivery.shipping_address || "No address provided"}
              </Text>

              {/* PROGRESS */}
              <View style={styles.progressSection}>
                <Text style={styles.progressTitle}>DELIVERY PROGRESS</Text>

                <View style={styles.progressRow}>
                  {["ready_for_pickup", "picked_up", "in_transit", "delivered"].map(
                    (step, index) => {
                      const steps = [
                        "ready_for_pickup",
                        "picked_up",
                        "in_transit",
                        "delivered",
                      ];

                      const currentIndex = steps.indexOf(delivery.status);
                      const completed = index <= currentIndex;

                      return (
                        <React.Fragment key={step}>
                          <View
                            style={[
                              styles.progressDot,
                              completed && styles.progressDotActive,
                            ]}
                          />
                          {index < 3 && (
                            <View
                              style={[
                                styles.progressLine,
                                index < currentIndex &&
                                  styles.progressLineActive,
                              ]}
                            />
                          )}
                        </React.Fragment>
                      );
                    }
                  )}
                </View>

                <View style={styles.progressLabels}>
                  <Text style={styles.progressLabel}>Pickup</Text>
                  <Text style={styles.progressLabel}>Collected</Text>
                  <Text style={styles.progressLabel}>Transit</Text>
                  <Text style={styles.progressLabel}>Done</Text>
                </View>
              </View>

              {/* ACTION */}
              {nextStatus ? (
                <TouchableOpacity
                  style={[
                    styles.deliveryAction,
                    isUpdating && styles.disabledButton,
                  ]}
                  disabled={isUpdating}
                  onPress={() => updateDeliveryStatus(delivery)}
                >
                  {isUpdating ? (
                    <ActivityIndicator color="#111111" />
                  ) : (
                    <Text style={styles.deliveryActionText}>
                      {NEXT_ACTION[delivery.status].toUpperCase()}
                    </Text>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={styles.completedBanner}>
                  <Text style={styles.completedBannerText}>
                    ✓ DELIVERY COMPLETED
                  </Text>
                </View>
              )}
            </View>
          );
        })}

        <Text style={styles.bottomNote}>
          STORQUE INDUSTRIES • DELIVERY NETWORK
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ======================================================
// STYLES
// ======================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F5F7",
  },

  authContainer: {
    flex: 1,
    backgroundColor: "#111111",
  },

  authKeyboard: {
    flex: 1,
  },

  authContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },

  logoCircle: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: "#EAB308",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 14,
  },

  logoLetter: {
    color: "#111111",
    fontSize: 42,
    fontWeight: "900",
  },

  brand: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 5,
  },

  brandSubtitle: {
    color: "#EAB308",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 5,
    marginTop: 3,
    marginBottom: 35,
  },

  authCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 24,
  },

  authTitle: {
    color: "#111827",
    fontSize: 25,
    fontWeight: "900",
  },

  authSubtitle: {
    color: "#6B7280",
    fontSize: 13,
    marginTop: 7,
    marginBottom: 25,
  },

  inputLabel: {
    color: "#374151",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 13,
  },

  input: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 14,
    color: "#111827",
    fontSize: 14,
  },

  primaryButton: {
    backgroundColor: "#EAB308",
    borderRadius: 12,
    padding: 17,
    alignItems: "center",
    marginTop: 25,
  },

  primaryButtonText: {
    color: "#111111",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
  },

  disabledButton: {
    opacity: 0.55,
  },

  authSwitch: {
    marginTop: 20,
    alignItems: "center",
  },

  authSwitchText: {
    color: "#A16207",
    fontWeight: "700",
    fontSize: 13,
  },

  footerText: {
    color: "#737373",
    textAlign: "center",
    fontSize: 9,
    letterSpacing: 2,
    marginTop: 30,
  },

  header: {
    backgroundColor: "#111111",
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 17,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  headerBrand: {
    color: "#EAB308",
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: 3,
  },

  headerSubtitle: {
    color: "#D1D5DB",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: 3,
  },

  logoutButton: {
    borderColor: "#525252",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },

  logoutText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },

  scrollContent: {
    padding: 17,
    paddingBottom: 35,
  },

  welcomeSection: {
    marginTop: 8,
    marginBottom: 20,
  },

  greeting: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
  },

  riderName: {
    color: "#111827",
    fontSize: 25,
    fontWeight: "900",
    marginTop: 5,
  },

  welcomeDescription: {
    color: "#6B7280",
    fontSize: 13,
    marginTop: 5,
  },

  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 28,
  },

  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    paddingVertical: 17,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  statNumber: {
    color: "#111827",
    fontSize: 25,
    fontWeight: "900",
  },

  statLabel: {
    color: "#6B7280",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginTop: 5,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },

  sectionTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "900",
  },

  sectionSubtitle: {
    color: "#6B7280",
    fontSize: 12,
    marginTop: 4,
  },

  refreshButton: {
    backgroundColor: "#111111",
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },

  refreshButtonText: {
    color: "#EAB308",
    fontSize: 10,
    fontWeight: "900",
  },

  searchInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 13,
    color: "#111827",
  },

  filterScroll: {
    marginTop: 13,
    marginBottom: 17,
  },

  filterContainer: {
    gap: 8,
  },

  filterButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
  },

  activeFilterButton: {
    backgroundColor: "#111111",
    borderColor: "#111111",
  },

  filterText: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "700",
  },

  activeFilterText: {
    color: "#EAB308",
  },

  loadingContainer: {
    alignItems: "center",
    padding: 40,
  },

  loadingText: {
    color: "#6B7280",
    marginTop: 12,
    fontSize: 12,
  },

  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    padding: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  emptyIcon: {
    fontSize: 38,
    marginBottom: 12,
  },

  emptyTitle: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900",
  },

  emptyDescription: {
    color: "#6B7280",
    fontSize: 12,
    textAlign: "center",
    marginTop: 7,
  },

  emptyRefreshButton: {
    backgroundColor: "#111111",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 9,
    marginTop: 18,
  },

  emptyRefreshText: {
    color: "#EAB308",
    fontSize: 10,
    fontWeight: "900",
  },

  deliveryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    padding: 17,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  deliveryTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  orderLabel: {
    color: "#9CA3AF",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  orderId: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
  },

  statusText: {
    fontSize: 10,
    fontWeight: "900",
  },

  cardDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 17,
  },

  detailLabel: {
    color: "#9CA3AF",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 5,
  },

  detailValue: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
  },

  addressValue: {
    color: "#374151",
    fontSize: 13,
    lineHeight: 20,
  },

  progressSection: {
    backgroundColor: "#F9FAFB",
    padding: 13,
    borderRadius: 12,
    marginTop: 20,
  },

  progressTitle: {
    color: "#6B7280",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 15,
  },

  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 3,
  },

  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#D1D5DB",
  },

  progressDotActive: {
    backgroundColor: "#EAB308",
  },

  progressLine: {
    flex: 1,
    height: 3,
    backgroundColor: "#D1D5DB",
  },

  progressLineActive: {
    backgroundColor: "#EAB308",
  },

  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 9,
  },

  progressLabel: {
    color: "#6B7280",
    fontSize: 8,
    fontWeight: "700",
  },

  deliveryAction: {
    backgroundColor: "#EAB308",
    padding: 15,
    borderRadius: 11,
    alignItems: "center",
    marginTop: 17,
  },

  deliveryActionText: {
    color: "#111111",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },

  completedBanner: {
    backgroundColor: "#DCFCE7",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 17,
  },

  completedBannerText: {
    color: "#15803D",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },

  errorBox: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: 10,
    padding: 13,
    marginVertical: 12,
  },

  errorText: {
    color: "#B91C1C",
    fontSize: 12,
    fontWeight: "600",
  },

  retryText: {
    color: "#991B1B",
    fontWeight: "900",
    fontSize: 12,
    marginTop: 8,
  },

  bottomNote: {
    color: "#9CA3AF",
    fontSize: 9,
    textAlign: "center",
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 10,
  },
});
