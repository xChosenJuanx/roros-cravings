const firebaseConfig = {
  apiKey: 'AIzaSyDNjVx_pn_evmMKbRTu77ShNHxpzLznkW8',
  authDomain: 'roros-cravings.firebaseapp.com',
  projectId: 'roros-cravings',
  storageBucket: 'roros-cravings.firebasestorage.app',
  messagingSenderId: '846240897530',
  appId: '1:846240897530:web:7168b0d74208efd5a7ec43'
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();
const ADMIN_EMAIL = 'solidtagasogid26@gmail.com';
const BUSINESS_PHONE = '09456988833';
const STATUSES = ['Pending', 'Confirmed', 'Preparing', 'Out for Delivery', 'Completed', 'Cancelled'];
const ORDER_TABS = ['Pending', 'Confirmed', 'Preparing', 'Out for Delivery', 'Completed', 'Cancelled'];
const nativePlugins = window.Capacitor?.Plugins || {};
const FirebaseAuthentication = nativePlugins.FirebaseAuthentication;
const PushNotifications = nativePlugins.PushNotifications;
let currentUser = null;
let pushStartedForUid = null;
let cachedOrders = [];
let currentOrderFilter = 'Pending';
let deliveryLocation = null;
let currentChatOrderId = null;
let unsubscribeChat = null;
let unsubscribeChatOrder = null;
let currentMenuCategory = 'Mains';
let unsubscribeConversationOrders = null;
let conversationMessageListeners = new Map();
let conversationSummaries = new Map();
let storeStatus = 'Available';
let unsubscribeStoreStatus = null;
let unsubscribeAdminOrders = null;
let adminOrdersRefreshTimer = null;

const fallbackProducts = [
  { id: 'hungarian', name: 'Hungarian Sausage Rice', price: 120, image: 'assets/hungarian.png', available: true, category: 'Mains' },
  { id: 'samgyup', name: 'Samgyupsal Platter', price: 160, image: 'assets/samgyup.png', available: true, category: 'Mains' },
  { id: 'soy-garlic', name: 'Soy Garlic Chicken', price: 110, image: 'assets/soy-garlic.png', available: true, category: 'Mains' },
  { id: 'shawarma', name: 'Shawarma Rice', price: 110, image: 'assets/shawarma.png', available: true, category: 'Mains' },
  { id: 'donkatsu', name: 'Donkatsu', price: 110, image: 'assets/donkatsu.png', available: true, category: 'Mains' },
  { id: 'bibimbap', name: 'Bibimbap', price: 170, image: 'assets/bibimbap.png', available: true, category: 'Mains' },
  { id: 'gochujang', name: 'Gochujang Glazed Chicken', price: 110, image: 'assets/gochujang.png', available: true, category: 'Mains' },
  { id: 'chick-fries', name: "Chick 'N Fries", price: 110, image: 'assets/chick-fries.png', available: true, category: 'Mains' }
];

const DIGOS_DELIVERY_FEE = 35;
let products = [];
const cart = {};

const $ = selector => document.querySelector(selector);
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH');
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
const safeImage = value => /^(https:\/\/|assets\/)[^"'<>]+$/i.test(value || '') ? value : 'assets/logo.png';
const timestampText = value => value?.toDate ? value.toDate().toLocaleString('en-PH') : 'Just now';

function dateFromTimestamp(value) {
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function etaText(order) {
  const eta = dateFromTimestamp(order?.estimatedCompletionAt);
  if (!eta || ['Completed', 'Cancelled'].includes(order?.status)) return '';
  return `Estimated ready/delivery: ${eta.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
}

function remainingEtaMinutes(order) {
  const eta = dateFromTimestamp(order?.estimatedCompletionAt);
  return eta ? Math.max(5, Math.round((eta.getTime() - Date.now()) / 60000)) : 30;
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 2800);
}

const STORE_STATUS_DETAILS = {
  Available: { message: 'We are accepting orders.', className: 'available' },
  Busy: { message: 'We are busy right now. Orders may take a little longer.', className: 'busy' },
  Closed: { message: 'We are currently closed and not accepting orders.', className: 'closed' }
};

function applyStoreStatus(status) {
  storeStatus = STORE_STATUS_DETAILS[status] ? status : 'Available';
  const details = STORE_STATUS_DETAILS[storeStatus];
  const banner = $('#storeStatusBanner');
  banner.className = `storeStatusBanner ${details.className}`;
  $('#storeStatusText').textContent = storeStatus;
  $('#storeStatusMessage').textContent = details.message;
  $('#adminStoreStatus').value = storeStatus;
  const closed = storeStatus === 'Closed';
  $('#placeOrderBtn').disabled = closed;
  $('#placeOrderBtn').textContent = closed ? 'Store is Closed' : 'Place Order';
  document.querySelectorAll('.add').forEach(button => {
    button.disabled = closed;
    button.textContent = closed ? 'Store Closed' : '+ Add to Cart';
  });
}

function startStoreStatusListener() {
  if (unsubscribeStoreStatus) return;
  unsubscribeStoreStatus = db.collection('settings').doc('store').onSnapshot(doc => {
    applyStoreStatus(doc.exists ? doc.data().status : 'Available');
  }, error => {
    console.error('Store status listener failed', error);
    applyStoreStatus('Available');
  });
}

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === id));
  $('#cartBtn').hidden = id !== 'shopView';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function isAdminUser(user = auth.currentUser) {
  return user?.email?.toLowerCase() === ADMIN_EMAIL;
}

function chatReadKey(orderId) {
  return `roros-chat-read:${auth.currentUser?.uid || 'guest'}:${orderId}`;
}

function messageMillis(message) {
  return message?.createdAt?.toMillis ? message.createdAt.toMillis() : 0;
}

function markConversationRead(orderId, millis = Date.now()) {
  localStorage.setItem(chatReadKey(orderId), String(millis));
  const summary = conversationSummaries.get(orderId);
  if (summary) summary.unread = 0;
  renderConversationHub();
}

function stopConversationHub() {
  if (unsubscribeConversationOrders) unsubscribeConversationOrders();
  unsubscribeConversationOrders = null;
  conversationMessageListeners.forEach(unsubscribe => unsubscribe());
  conversationMessageListeners.clear();
  conversationSummaries.clear();
  $('#messageBadge').hidden = true;
}

function startConversationHub(user) {
  stopConversationHub();
  if (!user) return;
  const admin = isAdminUser(user);
  let query = db.collection('orders').orderBy('createdAt', 'desc').limit(admin ? 100 : 50);
  if (!admin) query = db.collection('orders').where('userId', '==', user.uid).limit(50);
  unsubscribeConversationOrders = query.onSnapshot(snapshot => {
    const liveIds = new Set(snapshot.docs.map(doc => doc.id));
    conversationMessageListeners.forEach((unsubscribe, orderId) => {
      if (!liveIds.has(orderId)) { unsubscribe(); conversationMessageListeners.delete(orderId); conversationSummaries.delete(orderId); }
    });
    snapshot.docs.forEach(orderDoc => {
      const orderId = orderDoc.id;
      const order = { id: orderId, ...orderDoc.data() };
      const existing = conversationSummaries.get(orderId) || {};
      conversationSummaries.set(orderId, { ...existing, order });
      if (conversationMessageListeners.has(orderId)) return;
      const unsubscribe = orderDoc.ref.collection('messages').orderBy('createdAt', 'desc').limit(50)
        .onSnapshot(messageSnapshot => {
          const messages = messageSnapshot.docs.map(doc => doc.data());
          const lastMessage = messages[0] || null;
          const lastRead = Number(localStorage.getItem(chatReadKey(orderId)) || 0);
          const unread = messages.filter(message => message.senderId !== user.uid && messageMillis(message) > lastRead).length;
          conversationSummaries.set(orderId, { order, lastMessage, unread, hasMessages: !messageSnapshot.empty });
          renderConversationHub();
        }, error => console.debug(`Conversation ${orderId} unavailable`, error));
      conversationMessageListeners.set(orderId, unsubscribe);
    });
    renderConversationHub();
  }, error => {
    console.error('Conversation list failed', error);
    $('#conversationList').innerHTML = '<p class="error">Unable to load messages right now.</p>';
  });
}

function renderConversationHub() {
  const user = auth.currentUser;
  if (!user) return;
  const admin = isAdminUser(user);
  let conversations = [...conversationSummaries.values()].filter(item => item.order);
  if (admin) conversations = conversations.filter(item => item.hasMessages);
  conversations.sort((a, b) => (messageMillis(b.lastMessage) || b.order.createdAt?.toMillis?.() || 0) - (messageMillis(a.lastMessage) || a.order.createdAt?.toMillis?.() || 0));
  const totalUnread = conversations.reduce((sum, item) => sum + Number(item.unread || 0), 0);
  const badge = $('#messageBadge');
  badge.textContent = totalUnread > 99 ? '99+' : String(totalUnread);
  badge.hidden = totalUnread === 0;
  $('#conversationList').innerHTML = conversations.length ? conversations.map(({ order, lastMessage, unread }) => `
    <button class="conversationItem" data-open-conversation="${escapeHtml(order.id)}">
      <span class="conversationAvatar">💬</span>
      <span class="conversationBody"><strong>${admin ? escapeHtml(order.customerName || 'Customer') : "Roro's Cravings"}</strong><small>Order ${escapeHtml(order.orderId || order.id)} · ${escapeHtml(order.status || '')}</small><span>${lastMessage ? escapeHtml(lastMessage.text) : 'Start a conversation about this order.'}</span></span>
      ${unread ? `<b class="conversationUnread">${unread > 99 ? '99+' : unread}</b>` : ''}
    </button>`).join('') : `<div class="emptyConversation"><b>No conversations yet</b><p>${admin ? 'Customer messages will appear here.' : 'Place an order first, then you can message us here about your concern.'}</p></div>`;
  document.querySelectorAll('[data-open-conversation]').forEach(button => button.addEventListener('click', () => {
    $('#conversationDialog').close();
    openOrderChat(button.dataset.openConversation);
  }));
}

$('#messagesBtn').addEventListener('click', () => {
  if (!auth.currentUser) {
    $('#customerDialog').showModal();
    return toast('Please sign in to view your messages.');
  }
  renderConversationHub();
  $('#conversationDialog').showModal();
});
$('.closeConversations').addEventListener('click', () => $('#conversationDialog').close());

document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => showView(tab.dataset.view)));
document.querySelectorAll('.adminTab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.adminTab').forEach(t => t.classList.toggle('active', t === tab));
  document.querySelectorAll('.adminPanel').forEach(p => p.classList.toggle('active', p.id === tab.dataset.admin));
}));

async function loadProducts() {
  try {
    const snap = await db.collection('products').get();
    products = snap.empty ? fallbackProducts : snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error(error);
    products = fallbackProducts;
    toast('Using offline menu. Check your connection.');
  }
  products.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  renderMenu();
  if (auth.currentUser) renderAdminProducts();
}

function renderMenu() {
  const available = products.filter(p => p.available !== false && (p.category || 'Mains') === currentMenuCategory);
  $('#menu').innerHTML = available.length ? available.map(p => `
    <article class="card">
      <img src="${escapeHtml(safeImage(p.image))}" alt="${escapeHtml(p.name)}" onerror="this.src='assets/logo.png'">
      <div class="cardBody"><h3>${escapeHtml(p.name)}</h3><div class="price">${peso(p.price)}</div>
      <button class="add" data-add="${escapeHtml(p.id)}" ${storeStatus === 'Closed' ? 'disabled' : ''}>${storeStatus === 'Closed' ? 'Store Closed' : '+ Add to Cart'}</button></div>
    </article>`).join('') : '<p>No available products right now.</p>';
  document.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => add(btn.dataset.add)));
}
document.querySelectorAll('[data-menu-category]').forEach(button => button.addEventListener('click', () => {
  currentMenuCategory = button.dataset.menuCategory;
  document.querySelectorAll('[data-menu-category]').forEach(item => item.classList.toggle('active', item === button));
  renderMenu();
}));

function getProduct(id) { return products.find(p => p.id === id); }
function getDeliveryFee() { return DIGOS_DELIVERY_FEE; }

function add(id) {
  if (storeStatus === 'Closed') return toast('The store is currently closed.');
  cart[id] = (cart[id] || 0) + 1;
  updateTotals();
  toast('Added to cart');
}

function change(id, amount) {
  cart[id] = (cart[id] || 0) + amount;
  if (cart[id] <= 0) delete cart[id];
  updateTotals();
  renderCart();
}

function totals() {
  let quantity = 0;
  let subtotal = 0;
  Object.entries(cart).forEach(([id, qty]) => {
    const product = getProduct(id);
    if (product) { quantity += qty; subtotal += Number(product.price) * qty; }
  });
  return { quantity, subtotal, delivery: subtotal ? getDeliveryFee() : 0 };
}

function updateTotals() {
  const t = totals();
  $('#count').textContent = t.quantity;
  $('#total').textContent = peso(t.subtotal);
  $('#subtotalText').textContent = peso(t.subtotal);
  $('#deliveryText').textContent = peso(t.delivery);
  $('#grand').textContent = peso(t.subtotal + t.delivery);
}

function renderCart() {
  const rows = Object.entries(cart).map(([id, qty]) => {
    const p = getProduct(id);
    if (!p) return '';
    return `<div class="cartRow"><div><strong>${escapeHtml(p.name)}</strong><br><small>${peso(p.price)} each</small></div>
      <div class="qty"><button data-change="${escapeHtml(id)}" data-delta="-1">−</button><b>${qty}</b><button data-change="${escapeHtml(id)}" data-delta="1">+</button></div></div>`;
  }).join('');
  $('#cartItems').innerHTML = rows || '<p>Your cart is empty.</p>';
  document.querySelectorAll('[data-change]').forEach(btn => btn.addEventListener('click', () => change(btn.dataset.change, Number(btn.dataset.delta))));
  updateTotals();
}

$('#cartBtn').addEventListener('click', () => { renderCart(); $('#cartDialog').showModal(); });
$('.closeDialog').addEventListener('click', () => $('#cartDialog').close());
$('#paymentMethod').addEventListener('change', e => { $('#gcashInfo').hidden = e.target.value !== 'GCash'; });

$('#shareLocationBtn').addEventListener('click', () => {
  const button = $('#shareLocationBtn');
  const status = $('#locationStatus');
  if (!navigator.geolocation) {
    status.textContent = 'Location is not supported on this device.';
    return;
  }
  button.disabled = true;
  button.textContent = 'Getting location…';
  status.textContent = 'Please allow location access.';
  navigator.geolocation.getCurrentPosition(position => {
    deliveryLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: Math.round(position.coords.accuracy)
    };
    button.textContent = '✅ Delivery Location Shared';
    status.textContent = `Location saved (accuracy: about ${deliveryLocation.accuracy} meters).`;
    button.disabled = false;
  }, error => {
    console.error(error);
    deliveryLocation = null;
    button.textContent = '📍 Try Sharing Location Again';
    status.textContent = 'Location not shared. Turn on GPS and allow permission, or provide a detailed address.';
    button.disabled = false;
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
});

$('#customerOpen').addEventListener('click', () => $('#customerDialog').showModal());
$('.closeCustomer').addEventListener('click', () => $('#customerDialog').close());
$('#customerLogoutBtn').addEventListener('click', async () => {
  await auth.signOut();
  if (FirebaseAuthentication) await FirebaseAuthentication.signOut().catch(() => {});
});

$('#googleLoginBtn').addEventListener('click', async () => {
  const button = $('#googleLoginBtn');
  $('#customerLoginError').hidden = true;
  button.disabled = true;
  button.textContent = 'Signing in…';
  try {
    let credential;
    if (FirebaseAuthentication) {
      const result = await FirebaseAuthentication.signInWithGoogle();
      const idToken = result.credential?.idToken;
      const accessToken = result.credential?.accessToken;
      if (!idToken) throw new Error('Google did not return a sign-in token.');
      credential = firebase.auth.GoogleAuthProvider.credential(idToken, accessToken || null);
      await auth.signInWithCredential(credential);
    } else {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
    }
    $('#customerDialog').close();
  } catch (error) {
    console.error(error);
    $('#customerLoginError').textContent = error.message?.replace('Firebase: ', '') || 'Google sign-in failed.';
    $('#customerLoginError').hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = 'G  Continue with Google';
  }
});

async function registerPushFor(user) {
  if (!PushNotifications || !user || pushStartedForUid === user.uid) return;
  pushStartedForUid = user.uid;
  try {
    await PushNotifications.createChannel({id:'roros_orders',name:"Roro's Cravings Alerts",description:'New orders, chats, and order status updates',importance:5,visibility:1,vibration:true}).catch(()=>{});
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'prompt') permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') return;
    await PushNotifications.removeAllListeners();
    await PushNotifications.addListener('registration', async token => {
      const tokenId = token.value.replace(/[^A-Za-z0-9_-]/g, '_');
      await db.collection('deviceTokens').doc(tokenId).set({
        token: token.value,
        uid: user.uid,
        email: user.email || '',
        role: user.email?.toLowerCase() === ADMIN_EMAIL ? 'admin' : 'customer',
        platform: 'android',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });
    await PushNotifications.addListener('registrationError', error => console.error('Push registration failed', error));
    await PushNotifications.addListener('pushNotificationActionPerformed', () => {
      if (user.email?.toLowerCase() === ADMIN_EMAIL) showView('adminView');
      else showView('trackView');
    });
    await PushNotifications.register();
  } catch (error) {
    console.error('Push setup failed', error);
  }
}

function makeOrderId() {
  return 'RC-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

$('#checkout').addEventListener('submit', async event => {
  event.preventDefault();
  if (storeStatus === 'Closed') return toast('The store is currently closed and cannot accept orders.');
  const t = totals();
  if (!t.quantity) return toast('Please add an item first.');
  if (!auth.currentUser || auth.currentUser.email?.toLowerCase() === ADMIN_EMAIL) {
    $('#cartDialog').close();
    $('#customerDialog').showModal();
    return toast('Please sign in with Google before ordering.');
  }

  const form = new FormData(event.target);
  const orderId = makeOrderId();
  const items = Object.entries(cart).map(([id, quantity]) => {
    const p = getProduct(id);
    return { productId: id, name: p.name, price: Number(p.price), quantity, lineTotal: Number(p.price) * quantity };
  });
  const order = {
    orderId,
    userId: auth.currentUser.uid,
    customerEmail: auth.currentUser.email || '',
    customerName: String(form.get('name')).trim(),
    address: String(form.get('address')).trim(),
    contact: String(form.get('contact')).trim(),
    paymentMethod: form.get('payment'),
    notes: String(form.get('notes') || '').trim(),
    deliveryArea: 'Digos City',
    deliveryLocation: deliveryLocation ? { ...deliveryLocation } : null,
    items,
    subtotal: t.subtotal,
    deliveryFee: t.delivery,
    total: t.subtotal + t.delivery,
    status: 'Pending',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  const button = $('#placeOrderBtn');
  button.disabled = true;
  button.textContent = 'Submitting…';
  try {
    const batch = db.batch();
    batch.set(db.collection('orders').doc(orderId), order);
    batch.set(db.collection('tracking').doc(orderId), {
      orderId,
      status: 'Pending',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await batch.commit();
    const summary = [`Roro's Cravings – Order ${orderId}`, ...items.map(i => `${i.name} x${i.quantity} — ${peso(i.lineTotal)}`), `TOTAL: ${peso(order.total)}`, `Payment: ${order.paymentMethod}`, `Name: ${order.customerName}`, `Address: ${order.address}`, ...(order.deliveryLocation ? [`Location: https://www.google.com/maps?q=${order.deliveryLocation.latitude},${order.deliveryLocation.longitude}`] : []), `Contact: ${order.contact}`].join('\n');
    $('#orderSuccess').innerHTML = `<h3>✅ Order submitted!</h3><p>Your Order ID:</p><div class="orderId">${orderId}</div><p>Save this ID to track your order.</p><div class="buttonStack"><button id="copyOrderId" class="secondary">Copy Order ID</button><a class="primary linkButton" href="https://m.me/RorosCravingsDigos" target="_blank" rel="noopener">Open Messenger</a></div>`;
    $('#orderSuccess').hidden = false;
    event.target.hidden = true;
    navigator.clipboard?.writeText(summary).catch(() => {});
    $('#copyOrderId').addEventListener('click', () => navigator.clipboard.writeText(orderId).then(() => toast('Order ID copied')));
    Object.keys(cart).forEach(key => delete cart[key]);
    deliveryLocation = null;
    updateTotals();
  } catch (error) {
    console.error(error);
    toast('Order failed. Check your internet and try again.');
  } finally {
    button.disabled = false;
    button.textContent = 'Place Order';
  }
});

$('#trackForm').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('#trackId').value.trim().toUpperCase();
  const result = $('#trackResult');
  result.hidden = false;
  result.innerHTML = '<p class="loading">Checking order…</p>';
  try {
    const doc = await db.collection('tracking').doc(id).get();
    if (!doc.exists) { result.innerHTML = '<p class="error">Order ID not found. Please check the ID and try again.</p>'; return; }
    const data = doc.data();
    const step = STATUSES.indexOf(data.status);
    result.innerHTML = `<h3>Order ${escapeHtml(id)}</h3><div class="statusBadge">${escapeHtml(data.status)}</div>
      ${etaText(data) ? `<p class="chatEta">⏱ ${escapeHtml(etaText(data))}</p>` : ''}
      <div class="timeline">${STATUSES.slice(0, 5).map((s, i) => `<div class="timelineStep ${i <= step && step < 5 ? 'done' : ''}"><span></span>${s}</div>`).join('')}</div>
      <p class="muted">Last updated: ${escapeHtml(timestampText(data.updatedAt))}</p>`;
  } catch (error) {
    console.error(error);
    result.innerHTML = '<p class="error">Unable to check right now. Please try again.</p>';
  }
});

function closeOrderChat() {
  if (currentChatOrderId) markConversationRead(currentChatOrderId);
  if (unsubscribeChat) unsubscribeChat();
  if (unsubscribeChatOrder) unsubscribeChatOrder();
  unsubscribeChat = null;
  unsubscribeChatOrder = null;
  currentChatOrderId = null;
  $('#chatDialog').close();
}

async function openOrderChat(orderId) {
  if (!auth.currentUser) {
    $('#customerDialog').showModal();
    return toast('Please sign in before opening chat.');
  }
  if (unsubscribeChat) unsubscribeChat();
  if (unsubscribeChatOrder) unsubscribeChatOrder();
  currentChatOrderId = orderId;
  $('#chatOrderId').textContent = orderId;
  $('#chatOrderTracker').innerHTML = '<p class="loading">Loading order status…</p>';
  $('#chatMessages').innerHTML = '<p class="loading">Loading messages…</p>';
  $('#chatDialog').showModal();
  unsubscribeChatOrder = db.collection('orders').doc(orderId).onSnapshot(doc => {
    if (!doc.exists) {
      $('#chatOrderTracker').innerHTML = '<p class="error">Order details are no longer available.</p>';
      return;
    }
    renderChatOrderTracker({ id: doc.id, ...doc.data() });
  }, error => {
    console.error(error);
    $('#chatOrderTracker').innerHTML = '<p class="error">Unable to load order status.</p>';
  });
  unsubscribeChat = db.collection('orders').doc(orderId).collection('messages')
    .orderBy('createdAt', 'asc').limit(100)
    .onSnapshot(snapshot => {
      const box = $('#chatMessages');
      box.innerHTML = snapshot.empty ? '<p class="emptyChat">No messages yet. Start the conversation.</p>' : snapshot.docs.map(doc => {
        const message = doc.data();
        const mine = message.senderId === auth.currentUser?.uid;
        return `<div class="chatBubble ${mine ? 'mine' : 'theirs'}"><b>${escapeHtml(message.senderName || (message.senderRole === 'admin' ? "Roro's Cravings" : 'Customer'))}</b><p>${escapeHtml(message.text)}</p><small>${escapeHtml(timestampText(message.createdAt))}</small></div>`;
      }).join('');
      box.scrollTop = box.scrollHeight;
      const latest = snapshot.docs[snapshot.docs.length - 1]?.data();
      markConversationRead(orderId, Math.max(Date.now(), messageMillis(latest)));
    }, error => {
      console.error(error);
      $('#chatMessages').innerHTML = '<p class="error">Chat could not load. Please try again.</p>';
    });
}

$('.closeChat').addEventListener('click', closeOrderChat);
$('#chatDialog').addEventListener('close', () => {
  if (currentChatOrderId) markConversationRead(currentChatOrderId);
  if (unsubscribeChat) unsubscribeChat();
  if (unsubscribeChatOrder) unsubscribeChatOrder();
  unsubscribeChat = null;
  unsubscribeChatOrder = null;
  currentChatOrderId = null;
});

function renderChatOrderTracker(order) {
  const isAdmin = isAdminUser();
  const mainStatuses = STATUSES.slice(0, 5);
  const currentStep = mainStatuses.indexOf(order.status);
  const phone = isAdmin ? String(order.contact || '').replace(/[^+\d]/g, '') : BUSINESS_PHONE;
  const callLabel = isAdmin ? '📞 Call Customer' : "📞 Call Roro's Cravings";
  const callTarget = isAdmin ? 'Customer' : "Roro's Cravings";
  const itemSummary = (order.items || []).map(item => `${escapeHtml(item.name)} ×${Number(item.quantity || 0)}`).join(' · ');
  const progress = order.status === 'Cancelled'
    ? '<div class="cancelledTracker">This order has been cancelled.</div>'
    : `<div class="chatStatusSteps">${mainStatuses.map((status, index) => `<div class="chatStatusStep ${index < currentStep ? 'done' : ''} ${index === currentStep ? 'current' : ''}"><span></span>${escapeHtml(status)}</div>`).join('')}</div>`;
  $('#chatOrderTracker').innerHTML = `
    <div class="chatTrackerHead"><strong>Order ${escapeHtml(order.orderId || order.id)}</strong><span class="statusBadge">${escapeHtml(order.status || 'Pending')}</span></div>
    ${etaText(order) ? `<div class="chatEta">⏱ ${escapeHtml(etaText(order))}</div>` : ''}
    ${progress}
    <div class="chatOrderSummary">${itemSummary || 'Order items unavailable'}<br><b>Total: ${peso(order.total)}</b></div>
    ${phone ? `<div class="chatActions"><a class="callButton" href="tel:${escapeHtml(phone)}" data-call-target="${escapeHtml(callTarget)}">${escapeHtml(callLabel)}</a></div>` : ''}`;
  const callButton = $('#chatOrderTracker .callButton');
  if (callButton) callButton.addEventListener('click', event => {
    if (!confirm(`Call ${callButton.dataset.callTarget} now?`)) event.preventDefault();
  });
}
$('#chatForm').addEventListener('submit', async event => {
  event.preventDefault();
  const text = $('#chatInput').value.trim();
  const user = auth.currentUser;
  if (!text || !currentChatOrderId || !user) return;
  const button = event.target.querySelector('button');
  button.disabled = true;
  try {
    await db.collection('orders').doc(currentChatOrderId).collection('messages').add({
      text,
      senderId: user.uid,
      senderName: user.email?.toLowerCase() === ADMIN_EMAIL ? "Roro's Cravings" : (user.displayName || 'Customer'),
      senderRole: user.email?.toLowerCase() === ADMIN_EMAIL ? 'admin' : 'customer',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    $('#chatInput').value = '';
  } catch (error) {
    console.error(error);
    toast('Unable to send message.');
  } finally {
    button.disabled = false;
    $('#chatInput').focus();
  }
});

$('#adminOpen').addEventListener('click', () => auth.currentUser ? showView('adminView') : $('#loginDialog').showModal());
$('.closeLogin').addEventListener('click', () => $('#loginDialog').close());
$('#loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(event.target);
  $('#loginError').hidden = true;
  try {
    const credential = await auth.signInWithEmailAndPassword(data.get('email'), data.get('password'));
    if (credential.user.email.toLowerCase() !== ADMIN_EMAIL) { await auth.signOut(); throw new Error('Not an authorized admin account.'); }
    $('#loginDialog').close();
  } catch (error) {
    $('#loginError').textContent = error.message.replace('Firebase: ', '');
    $('#loginError').hidden = false;
  }
});

auth.onAuthStateChanged(async user => {
  currentUser = user;
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL;
  $('#customerSignedOut').hidden = Boolean(user);
  $('#customerSignedIn').hidden = !user;
  $('#customerOpen').textContent = user ? (isAdmin ? 'Admin' : (user.displayName?.split(' ')[0] || 'Account')) : 'Sign in';
  if (user) {
    $('#customerName').textContent = user.displayName || (isAdmin ? 'Administrator' : 'Customer');
    $('#customerEmail').textContent = user.email || '';
    await db.collection('users').doc(user.uid).set({
      displayName: user.displayName || '',
      email: user.email || '',
      photoURL: user.photoURL || '',
      role: isAdmin ? 'admin' : 'customer',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(console.error);
    registerPushFor(user);
    startConversationHub(user);
  } else {
    pushStartedForUid = null;
    stopConversationHub();
  }
  if (isAdmin) {
    $('#adminEmail').textContent = user.email;
    showView('adminView');
    startAdminOrderUpdates();
    loadProducts();
  } else if ($('#adminView').classList.contains('active')) {
    stopAdminOrderUpdates();
    showView('shopView');
  } else {
    stopAdminOrderUpdates();
  }
});

$('#logoutBtn').addEventListener('click', () => auth.signOut());
$('#refreshOrders').addEventListener('click', () => loadOrders(false));
$('#adminStoreStatus').addEventListener('change', async event => {
  const nextStatus = event.target.value;
  event.target.disabled = true;
  try {
    await db.collection('settings').doc('store').set({
      status: nextStatus,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: auth.currentUser?.email || ''
    }, { merge: true });
    toast(`Store is now ${nextStatus}`);
  } catch (error) {
    console.error(error);
    event.target.value = storeStatus;
    toast('Unable to update store status.');
  } finally {
    event.target.disabled = false;
  }
});

function renderOrderCategories() {
  const filters = $('#orderStatusFilters');
  filters.innerHTML = ORDER_TABS.map(status => {
    const count = cachedOrders.filter(order => order.status === status).length;
    return `<button class="orderFilter ${currentOrderFilter === status ? 'active' : ''}" data-order-filter="${escapeHtml(status)}"><b>${escapeHtml(status.toUpperCase())}</b><span>${count}</span></button>`;
  }).join('');
  document.querySelectorAll('[data-order-filter]').forEach(button => button.addEventListener('click', () => {
    currentOrderFilter = button.dataset.orderFilter;
    renderOrders();
  }));
}

function renderOrders() {
  renderOrderCategories();
  const visibleOrders = cachedOrders.filter(order => order.status === currentOrderFilter);
  const completedOrders = cachedOrders.filter(order => order.status === 'Completed');
  const completedSales = completedOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const pendingCount = cachedOrders.filter(order => order.status === 'Pending').length;
  $('#pendingCount').textContent = `${pendingCount} Pending`;
  $('#categorySummary').innerHTML = currentOrderFilter === 'Completed'
    ? `<div><small>COMPLETED ORDERS</small><strong>${completedOrders.length}</strong></div><div><small>TOTAL COMPLETED SALES</small><strong>${peso(completedSales)}</strong></div>`
    : `<strong>${visibleOrders.length} ${escapeHtml(currentOrderFilter)} Orders</strong>`;

  $('#ordersList').innerHTML = visibleOrders.length ? visibleOrders.map(order => `
    <article class="orderCard">
      <div class="orderHead"><div><b>${escapeHtml(order.orderId || order.id)}</b><small>${escapeHtml(timestampText(order.createdAt))}</small></div><span class="statusBadge">${escapeHtml(order.status)}</span></div>
      <p><b>${escapeHtml(order.customerName)}</b> · ${escapeHtml(order.contact)}<br>${escapeHtml(order.address)}<br>Digos City · ${escapeHtml(order.paymentMethod)}</p>
      ${order.status === 'Out for Delivery'
        ? (order.deliveryLocation?.latitude && order.deliveryLocation?.longitude
          ? `<a class="mapButton trackerButton" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.deliveryLocation.latitude)},${encodeURIComponent(order.deliveryLocation.longitude)}" target="_blank" rel="noopener">🧭 NAVIGATE TO CUSTOMER LOCATION</a>`
          : '<p class="locationMissing">⚠️ Customer did not share a GPS pin. Use the complete written address.</p>')
        : ''}
      <div class="orderItems">${(order.items || []).map(i => `<span>${escapeHtml(i.name)} ×${i.quantity}</span>`).join('')}</div>
      ${order.notes ? `<p class="notes">Note: ${escapeHtml(order.notes)}</p>` : ''}
      <div class="orderTotal">Total: ${peso(order.total)}</div>
      ${etaText(order) ? `<p class="adminEta">⏱ ${escapeHtml(etaText(order))}</p>` : ''}
      <label>Update status<select class="statusSelect" data-order="${escapeHtml(order.id)}">${STATUSES.map(s => `<option ${s === order.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      ${['Confirmed', 'Preparing', 'Out for Delivery'].includes(order.status) ? `<button class="secondary updateEtaBtn" data-eta-order="${escapeHtml(order.id)}" data-eta-minutes="${remainingEtaMinutes(order)}">⏱ Update Estimated Time</button>` : ''}
      <button class="secondary orderChatBtn" data-chat-order="${escapeHtml(order.id)}">💬 Chat with Customer</button>
      ${['Completed', 'Cancelled'].includes(order.status) ? `<button class="danger deleteOrderBtn" data-delete-order="${escapeHtml(order.id)}">🗑 Delete ${escapeHtml(order.status)} Order</button>` : ''}
    </article>`).join('') : `<p class="emptyCategory">No ${escapeHtml(currentOrderFilter.toLowerCase())} orders.</p>`;
  document.querySelectorAll('.statusSelect').forEach(select => select.addEventListener('change', () => handleStatusChange(select)));
  document.querySelectorAll('[data-eta-order]').forEach(button => button.addEventListener('click', () => updateOrderEstimate(button.dataset.etaOrder, Number(button.dataset.etaMinutes || 30))));
  document.querySelectorAll('[data-delete-order]').forEach(button => button.addEventListener('click', () => deleteCompletedOrder(button.dataset.deleteOrder)));
  document.querySelectorAll('[data-chat-order]').forEach(button => button.addEventListener('click', () => openOrderChat(button.dataset.chatOrder)));
}

async function loadOrders(showLoading = true) {
  if (showLoading) $('#ordersList').innerHTML = '<p class="loading">Loading orders…</p>';
  try {
    const snap = await db.collection('orders').orderBy('createdAt', 'desc').limit(200).get();
    cachedOrders = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderOrders();
  } catch (error) {
    console.error(error);
    $('#ordersList').innerHTML = `<p class="error">Unable to load orders: ${escapeHtml(error.message)}</p>`;
  }
}

function stopAdminOrderUpdates() {
  if (unsubscribeAdminOrders) unsubscribeAdminOrders();
  unsubscribeAdminOrders = null;
  if (adminOrdersRefreshTimer) clearInterval(adminOrdersRefreshTimer);
  adminOrdersRefreshTimer = null;
}

function startAdminOrderUpdates() {
  stopAdminOrderUpdates();
  $('#ordersList').innerHTML = '<p class="loading">Connecting to live orders…</p>';
  unsubscribeAdminOrders = db.collection('orders').orderBy('createdAt', 'desc').limit(200)
    .onSnapshot(snapshot => {
      cachedOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderOrders();
    }, error => {
      console.error('Live orders failed', error);
      loadOrders(false);
    });
  adminOrdersRefreshTimer = setInterval(() => {
    if (isAdminUser()) loadOrders(false);
  }, 2 * 60 * 1000);
}

async function handleStatusChange(select) {
  let etaMinutes = null;
  if (select.value === 'Confirmed') {
    const answer = prompt('Estimated preparation/delivery time in minutes:', '30');
    if (answer === null) return renderOrders();
    etaMinutes = Number(answer);
    if (!Number.isFinite(etaMinutes) || etaMinutes < 5 || etaMinutes > 240) {
      toast('Enter an estimated time from 5 to 240 minutes.');
      return renderOrders();
    }
  }
  await updateOrderStatus(select.dataset.order, select.value, etaMinutes);
}

async function updateOrderStatus(orderId, status, etaMinutes = null) {
  try {
    const batch = db.batch();
    const update = { status, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (etaMinutes) {
      update.estimatedMinutes = etaMinutes;
      update.estimatedCompletionAt = firebase.firestore.Timestamp.fromMillis(Date.now() + etaMinutes * 60000);
    } else if (['Completed', 'Cancelled'].includes(status)) {
      update.estimatedMinutes = firebase.firestore.FieldValue.delete();
      update.estimatedCompletionAt = firebase.firestore.FieldValue.delete();
    }
    batch.update(db.collection('orders').doc(orderId), update);
    batch.set(db.collection('tracking').doc(orderId), { orderId, ...update }, { merge: true });
    await batch.commit();
    toast(`Order marked ${status}`);
    loadOrders(false);
  } catch (error) { console.error(error); toast('Status update failed.'); }
}

async function updateOrderEstimate(orderId, suggestedMinutes = 30) {
  const answer = prompt('New estimated time from now, in minutes:', String(suggestedMinutes));
  if (answer === null) return;
  const minutes = Number(answer);
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 240) return toast('Enter an estimated time from 5 to 240 minutes.');
  try {
    const update = {
      estimatedMinutes: minutes,
      estimatedCompletionAt: firebase.firestore.Timestamp.fromMillis(Date.now() + minutes * 60000),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    const batch = db.batch();
    batch.update(db.collection('orders').doc(orderId), update);
    batch.set(db.collection('tracking').doc(orderId), update, { merge: true });
    await batch.commit();
    toast('Estimated time updated.');
  } catch (error) {
    console.error(error);
    toast('Unable to update estimated time.');
  }
}

async function deleteCompletedOrder(orderId) {
  if (!confirm(`Permanently delete this closed order ${orderId}? This cannot be undone.`)) return;
  try {
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists || !['Completed', 'Cancelled'].includes(orderDoc.data().status)) {
      toast('Only completed or cancelled orders can be deleted.');
      return;
    }
    const batch = db.batch();
    batch.delete(orderRef);
    batch.delete(db.collection('tracking').doc(orderId));
    await batch.commit();
    toast('Order deleted.');
    loadOrders(false);
  } catch (error) {
    console.error(error);
    toast('Unable to delete order.');
  }
}

function renderAdminProducts() {
  $('#adminProducts').innerHTML = products.map(p => `<article class="productAdmin"><img src="${escapeHtml(safeImage(p.image))}" onerror="this.src='assets/logo.png'" alt=""><div><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.category || 'Mains')} · ${peso(p.price)} · ${p.available === false ? 'Unavailable' : 'Available'}</small></div><button data-edit-product="${escapeHtml(p.id)}">Edit</button><button class="danger" data-delete-product="${escapeHtml(p.id)}">Delete</button></article>`).join('');
  document.querySelectorAll('[data-edit-product]').forEach(btn => btn.addEventListener('click', () => editProduct(btn.dataset.editProduct)));
  document.querySelectorAll('[data-delete-product]').forEach(btn => btn.addEventListener('click', () => deleteProduct(btn.dataset.deleteProduct)));
}

function editProduct(id) {
  const p = getProduct(id);
  const f = $('#productForm').elements;
  f.id.value = p.id; f.name.value = p.name; f.price.value = p.price; f.category.value = p.category || 'Mains';
  f.currentImage.value = p.image || ''; f.available.checked = p.available !== false;
  $('#productImagePreview').src = safeImage(p.image); $('#productForm').scrollIntoView({ behavior: 'smooth' });
}
function clearProductForm() {
  $('#productForm').reset(); const f = $('#productForm').elements;
  f.id.value = ''; f.currentImage.value = ''; f.category.value = 'Mains'; f.available.checked = true;
  $('#productImagePreview').src = 'assets/logo.png';
}
$('#productImageFile').addEventListener('change', event => {
  const file = event.target.files?.[0]; if (!file) return;
  if (!file.type.startsWith('image/')) { event.target.value = ''; return toast('Please choose an image file.'); }
  if (file.size > 5 * 1024 * 1024) { event.target.value = ''; return toast('Image must be 5 MB or smaller.'); }
  $('#productImagePreview').src = URL.createObjectURL(file);
});
$('#cancelEdit').addEventListener('click', clearProductForm);

$('#productForm').addEventListener('submit', async event => {
  event.preventDefault(); const data = new FormData(event.target);
  const id = data.get('id') || db.collection('products').doc().id;
  const file = $('#productImageFile').files?.[0]; const saveButton = event.target.querySelector('button[type="submit"]');
  saveButton.disabled = true; saveButton.textContent = file ? 'Uploading image…' : 'Saving…';
  try {
    let image = String(data.get('currentImage') || '').trim();
    if (file) {
      const extension = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase();
      const imageRef = storage.ref().child(`products/${id}-${Date.now()}.${extension}`);
      await imageRef.put(file, { contentType: file.type }); image = await imageRef.getDownloadURL();
    }
    if (!image) throw new Error('Please choose a product image from the gallery.');
    await db.collection('products').doc(id).set({name:String(data.get('name')).trim(),price:Number(data.get('price')),category:String(data.get('category')||'Mains'),image,available:data.get('available')==='on',updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    toast('Product saved'); clearProductForm(); await loadProducts();
  } catch (error) { console.error(error); toast(error.message || 'Unable to save product.'); }
  finally { saveButton.disabled=false; saveButton.textContent='Save Product'; }
});

async function deleteProduct(id) {
  if (!confirm('Delete this product from the menu?')) return;
  try { await db.collection('products').doc(id).delete(); toast('Product deleted'); await loadProducts(); }
  catch (error) { console.error(error); toast('Unable to delete product.'); }
}

loadProducts();
updateTotals();
startStoreStatusListener();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
