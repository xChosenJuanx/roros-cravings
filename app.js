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
let initializedConversationMessages = new Set();
let hiddenConversationIds = new Set();
let unsubscribeHiddenConversations = null;
let storeStatus = 'Available';
let unsubscribeStoreStatus = null;
let unsubscribeAdminOrders = null;
let adminOrdersRefreshTimer = null;
let adminOrdersInitialized = false;
let currentSalesDate = '';
let midnightResetTimer = null;
let notificationSoundEnabled = localStorage.getItem('roros-notification-sound') !== 'off';
let notificationAudioContext = null;
let etaDialogResolver = null;
let editingOrder = null;

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

function philippineDateKey(value = new Date()) {
  const date = dateFromTimestamp(value) || value;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function completedDateKey(order) {
  return philippineDateKey(order.completedAt || order.updatedAt || order.createdAt || new Date());
}

function salesDateLabel(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-PH', {
    timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric'
  });
}

function etaText(order) {
  const eta = dateFromTimestamp(order?.estimatedCompletionAt);
  if (!eta || ['Completed', 'Cancelled'].includes(order?.status)) return '';
  return `Estimated ready/delivery: ${eta.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
}

function etaCountdownHtml(order, className = 'chatEta') {
  const eta = dateFromTimestamp(order?.estimatedCompletionAt);
  if (!eta || ['Completed', 'Cancelled'].includes(order?.status)) return '';
  return `<p class="${className} etaCountdown" data-eta-target="${eta.getTime()}">⏱ <span>Calculating…</span></p>`;
}

function updateEtaCountdowns() {
  document.querySelectorAll('.etaCountdown[data-eta-target]').forEach(element => {
    const remaining = Number(element.dataset.etaTarget) - Date.now();
    const output = element.querySelector('span');
    if (!output) return;
    if (remaining <= 0) {
      output.textContent = 'Finishing shortly…';
      return;
    }
    const totalSeconds = Math.ceil(remaining / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    output.textContent = `Estimated time remaining: ${hours ? `${hours}:` : ''}${String(minutes).padStart(hours ? 2 : 1, '0')}:${String(seconds).padStart(2, '0')}`;
  });
}

setInterval(updateEtaCountdowns, 1000);

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

function updateSoundToggle() {
  const button = $('#soundToggle');
  button.textContent = notificationSoundEnabled ? '🔊' : '🔇';
  button.classList.toggle('off', !notificationSoundEnabled);
  button.setAttribute('aria-label', notificationSoundEnabled ? 'Turn notification sound off' : 'Turn notification sound on');
  button.title = notificationSoundEnabled ? 'Notification sound on' : 'Notification sound off';
}

function getAudioContext() {
  if (!notificationAudioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) notificationAudioContext = new AudioContextClass();
  }
  return notificationAudioContext;
}

function playTone(context, frequency, start, duration, volume = 0.18, wave = 'sine') {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

async function playNotificationSound(type = 'chat') {
  if (!notificationSoundEnabled) return false;
  const context = getAudioContext();
  if (context?.state === 'suspended') {
    try { await context.resume(); } catch (error) { console.warn('Notification audio is waiting for user interaction.', error); }
  }
  if (context) {
    if (context.state !== 'running') return false;
    const now = context.currentTime + 0.02;
    if (type === 'order') {
      Array.from({ length: 125 }, (_, index) => index * 0.24).forEach((offset, index) => {
        playTone(context, index % 2 ? 1120 : 520, now + offset, 0.21, 0.72, 'square');
        playTone(context, index % 2 ? 560 : 780, now + offset, 0.21, 0.34, 'sawtooth');
      });
    } else {
      [0, 0.34, 0.68].forEach(offset => {
        playTone(context, 660, now + offset, 0.24, 0.30, 'square');
        playTone(context, 880, now + offset + 0.04, 0.24, 0.26, 'sine');
        playTone(context, 1100, now + offset + 0.08, 0.22, 0.22, 'triangle');
      });
    }
  }
  navigator.vibrate?.(type === 'order' ? Array.from({ length: 120 }, (_, index) => index % 2 ? 150 : 350) : [140, 80, 180]);
  return Boolean(context);
}

$('#soundToggle').addEventListener('click', async () => {
  notificationSoundEnabled = !notificationSoundEnabled;
  localStorage.setItem('roros-notification-sound', notificationSoundEnabled ? 'on' : 'off');
  updateSoundToggle();
  if (notificationSoundEnabled) {
    const ready = await playNotificationSound('chat');
    toast(ready ? 'Notification sound is on and ready.' : 'Tap Enable/Test Sound in the Admin Dashboard.');
  } else {
    toast('Notification sound is off.');
  }
});
document.addEventListener('pointerdown', () => {
  const context = notificationSoundEnabled && getAudioContext();
  if (context?.state === 'suspended') context.resume().catch(() => {});
});
updateSoundToggle();

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
  if (unsubscribeHiddenConversations) unsubscribeHiddenConversations();
  unsubscribeConversationOrders = null;
  unsubscribeHiddenConversations = null;
  conversationMessageListeners.forEach(unsubscribe => unsubscribe());
  conversationMessageListeners.clear();
  conversationSummaries.clear();
  initializedConversationMessages.clear();
  hiddenConversationIds.clear();
  $('#messageBadge').hidden = true;
}

function startConversationHub(user) {
  stopConversationHub();
  if (!user) return;
  const admin = isAdminUser(user);
  if (!admin) {
    unsubscribeHiddenConversations = db.collection('users').doc(user.uid).collection('hiddenConversations')
      .onSnapshot(snapshot => {
        hiddenConversationIds = new Set(snapshot.docs.map(doc => doc.id));
        renderConversationHub();
      }, error => console.debug('Hidden conversations unavailable', error));
  }
  let query = db.collection('orders').orderBy('createdAt', 'desc').limit(admin ? 100 : 50);
  if (!admin) query = db.collection('orders').where('userId', '==', user.uid).limit(50);
  unsubscribeConversationOrders = query.onSnapshot(snapshot => {
    const liveIds = new Set(snapshot.docs.map(doc => doc.id));
    conversationMessageListeners.forEach((unsubscribe, orderId) => {
      if (!liveIds.has(orderId)) { unsubscribe(); conversationMessageListeners.delete(orderId); conversationSummaries.delete(orderId); initializedConversationMessages.delete(orderId); }
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
          if (initializedConversationMessages.has(orderId)) {
            const hasIncomingMessage = messageSnapshot.docChanges().some(change => change.type === 'added' && change.doc.data().senderId !== user.uid);
            if (hasIncomingMessage) playNotificationSound('chat');
          } else {
            initializedConversationMessages.add(orderId);
          }
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
  let conversations = [...conversationSummaries.values()].filter(item => item.order && item.order.chatArchived !== true && !hiddenConversationIds.has(item.order.id));
  if (admin) conversations = conversations.filter(item => item.hasMessages);
  conversations.sort((a, b) => (messageMillis(b.lastMessage) || b.order.createdAt?.toMillis?.() || 0) - (messageMillis(a.lastMessage) || a.order.createdAt?.toMillis?.() || 0));
  const totalUnread = conversations.reduce((sum, item) => sum + Number(item.unread || 0), 0);
  const badge = $('#messageBadge');
  badge.textContent = totalUnread > 99 ? '99+' : String(totalUnread);
  badge.hidden = totalUnread === 0;
  $('#conversationList').innerHTML = conversations.length ? conversations.map(({ order, lastMessage, unread }) => {
    const closed = ['Completed', 'Cancelled'].includes(order.status);
    return `<div class="conversationItem">
      <button class="conversationOpen" data-open-conversation="${escapeHtml(order.id)}">
        <span class="conversationAvatar">💬</span>
        <span class="conversationBody"><strong>${admin ? escapeHtml(order.customerName || 'Customer') : "Roro's Cravings"}</strong><small>Order ${escapeHtml(order.orderId || order.id)} · ${escapeHtml(order.status || '')}</small><span>${lastMessage ? escapeHtml(lastMessage.text) : 'Start a conversation about this order.'}</span></span>
        ${unread ? `<b class="conversationUnread">${unread > 99 ? '99+' : unread}</b>` : ''}
      </button>
      ${closed ? `<button class="conversationDelete" data-delete-conversation="${escapeHtml(order.id)}" aria-label="Delete closed conversation" title="Delete conversation">🗑</button>` : ''}
    </div>`;
  }).join('') : `<div class="emptyConversation"><b>No conversations yet</b><p>${admin ? 'Customer messages will appear here.' : 'Place an order first, then you can message us here about your concern.'}</p></div>`;
  document.querySelectorAll('[data-open-conversation]').forEach(button => button.addEventListener('click', () => {
    $('#conversationDialog').close();
    openOrderChat(button.dataset.openConversation);
  }));
  document.querySelectorAll('[data-delete-conversation]').forEach(button => button.addEventListener('click', () => removeConversationFromInbox(button.dataset.deleteConversation)));
}

async function removeConversationFromInbox(orderId) {
  const order = conversationSummaries.get(orderId)?.order;
  if (!order || !['Completed', 'Cancelled'].includes(order.status)) return toast('Only completed or cancelled chats can be deleted.');
  const label = order.orderId || order.id;
  if (!confirm(`Delete conversation for order ${label}? The order record will remain.`)) return;
  if (isAdminUser()) return deleteCompletedOrderChat(orderId, true);
  try {
    await db.collection('users').doc(auth.currentUser.uid).collection('hiddenConversations').doc(orderId).set({
      hiddenAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    hiddenConversationIds.add(orderId);
    renderConversationHub();
    toast('Conversation removed from Messages.');
  } catch (error) {
    console.error(error);
    toast('Unable to remove this conversation.');
  }
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

document.querySelectorAll('.adminTab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.adminTab').forEach(t => t.classList.toggle('active', t === tab));
  document.querySelectorAll('.adminPanel').forEach(p => p.classList.toggle('active', p.id === tab.dataset.admin));
  if (tab.dataset.admin === 'salesPanel') renderDailySales();
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
  if (!$('#orderSuccess').hidden) resetCheckoutForNewOrder();
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

function resetCheckoutForNewOrder() {
  const checkout = $('#checkout');
  checkout.reset();
  checkout.hidden = false;
  $('#orderSuccess').hidden = true;
  $('#gcashInfo').hidden = true;
  deliveryLocation = null;
  $('#shareLocationBtn').disabled = false;
  $('#shareLocationBtn').textContent = '📍 Share My Delivery Location';
  $('#locationStatus').textContent = 'Optional but recommended for faster delivery.';
  $('#placeOrderBtn').disabled = storeStatus === 'Closed';
  $('#placeOrderBtn').textContent = storeStatus === 'Closed' ? 'Store is Closed' : 'Place Order';
}

$('#cartBtn').addEventListener('click', () => {
  if (!$('#orderSuccess').hidden && totals().quantity > 0) resetCheckoutForNewOrder();
  renderCart();
  $('#cartDialog').showModal();
});
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
      else {
        showView('shopView');
        renderConversationHub();
        if (!$('#conversationDialog').open) $('#conversationDialog').showModal();
      }
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
    Object.keys(cart).forEach(key => delete cart[key]);
    deliveryLocation = null;
    updateTotals();
    event.target.reset();
    $('#gcashInfo').hidden = true;
    $('#cartDialog').close();
    toast('Order submitted! Opening your order monitoring…');
    await openOrderChat(orderId);
  } catch (error) {
    console.error(error);
    toast('Order failed. Check your internet and try again.');
  } finally {
    button.disabled = false;
    button.textContent = 'Place Order';
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
    ${etaCountdownHtml(order)}
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
$('#testSoundBtn').addEventListener('click', async () => {
  notificationSoundEnabled = true;
  localStorage.setItem('roros-notification-sound', 'on');
  updateSoundToggle();
  const ready = await playNotificationSound('chat');
  toast(ready ? 'Sound is enabled. Keep this PWA open for live alerts.' : 'The browser blocked audio. Check the site sound permission.');
});
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
  const today = philippineDateKey();
  const filters = $('#orderStatusFilters');
  filters.innerHTML = ORDER_TABS.map(status => {
    const count = cachedOrders.filter(order => order.status === status && (status !== 'Completed' || completedDateKey(order) === today)).length;
    return `<button class="orderFilter ${currentOrderFilter === status ? 'active' : ''}" data-order-filter="${escapeHtml(status)}"><b>${escapeHtml(status.toUpperCase())}</b><span>${count}</span></button>`;
  }).join('');
  document.querySelectorAll('[data-order-filter]').forEach(button => button.addEventListener('click', () => {
    currentOrderFilter = button.dataset.orderFilter;
    renderOrders();
  }));
}

function renderOrders() {
  renderOrderCategories();
  const today = philippineDateKey();
  const visibleOrders = cachedOrders.filter(order => order.status === currentOrderFilter && (order.status !== 'Completed' || completedDateKey(order) === today));
  const completedOrders = cachedOrders.filter(order => order.status === 'Completed' && completedDateKey(order) === today);
  const completedSales = completedOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const pendingCount = cachedOrders.filter(order => order.status === 'Pending').length;
  $('#pendingCount').textContent = `${pendingCount} Pending`;
  $('#categorySummary').innerHTML = currentOrderFilter === 'Completed'
    ? `<div><small>COMPLETED TODAY</small><strong>${completedOrders.length}</strong></div><div><small>TODAY'S COMPLETED SALES</small><strong>${peso(completedSales)}</strong></div>`
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
      ${etaCountdownHtml(order, 'adminEta')}
      ${order.status === 'Pending' ? `<button class="secondary editOrderBtn" data-edit-order="${escapeHtml(order.id)}">✏️ Edit Pending Order</button>` : ''}
      <label>Update status<select class="statusSelect" data-order="${escapeHtml(order.id)}">${STATUSES.map(s => `<option ${s === order.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      ${['Confirmed', 'Preparing', 'Out for Delivery'].includes(order.status) ? `<button class="secondary updateEtaBtn" data-eta-order="${escapeHtml(order.id)}" data-eta-minutes="${remainingEtaMinutes(order)}">⏱ Update Estimated Time</button>` : ''}
      <button class="secondary orderChatBtn" data-chat-order="${escapeHtml(order.id)}">💬 Chat with Customer</button>
      ${order.status === 'Completed' && order.chatArchived !== true ? `<button class="danger deleteChatBtn" data-delete-chat="${escapeHtml(order.id)}">🗑 Delete Completed Order Chat</button>` : ''}
      ${['Completed', 'Cancelled'].includes(order.status) ? `<button class="danger deleteOrderBtn" data-delete-order="${escapeHtml(order.id)}">🗑 Delete ${escapeHtml(order.status)} Order</button>` : ''}
    </article>`).join('') : `<p class="emptyCategory">No ${escapeHtml(currentOrderFilter.toLowerCase())} orders.</p>`;
  document.querySelectorAll('.statusSelect').forEach(select => select.addEventListener('change', () => handleStatusChange(select)));
  document.querySelectorAll('[data-eta-order]').forEach(button => button.addEventListener('click', () => updateOrderEstimate(button.dataset.etaOrder, Number(button.dataset.etaMinutes || 30))));
  document.querySelectorAll('[data-delete-chat]').forEach(button => button.addEventListener('click', () => deleteCompletedOrderChat(button.dataset.deleteChat)));
  document.querySelectorAll('[data-delete-order]').forEach(button => button.addEventListener('click', () => deleteCompletedOrder(button.dataset.deleteOrder)));
  document.querySelectorAll('[data-chat-order]').forEach(button => button.addEventListener('click', () => openOrderChat(button.dataset.chatOrder)));
  document.querySelectorAll('[data-edit-order]').forEach(button => button.addEventListener('click', () => openOrderEditor(button.dataset.editOrder)));
  updateEtaCountdowns();
  renderDailySales();
}

function openOrderEditor(orderId) {
  const order = cachedOrders.find(item => item.id === orderId);
  if (!order || order.status !== 'Pending') return toast('Only pending orders can be edited.');
  editingOrder = {
    id: order.id,
    orderId: order.orderId || order.id,
    deliveryFee: Number(order.deliveryFee ?? DIGOS_DELIVERY_FEE),
    items: (order.items || []).map(item => ({
      productId: item.productId || '',
      name: item.name || 'Item',
      price: Number(item.price || 0),
      quantity: Number(item.quantity || 0)
    })).filter(item => item.quantity > 0)
  };
  $('#editOrderId').textContent = editingOrder.orderId;
  renderOrderEditor();
  $('#orderEditorDialog').showModal();
}

function renderOrderEditor() {
  if (!editingOrder) return;
  $('#editOrderItems').innerHTML = editingOrder.items.length ? editingOrder.items.map((item, index) => `
    <div class="editOrderRow">
      <div><strong>${escapeHtml(item.name)}</strong><small>${peso(item.price)} each</small></div>
      <div class="editOrderControls">
        <div class="qty"><button type="button" data-edit-index="${index}" data-edit-delta="-1">−</button><b>${item.quantity}</b><button type="button" data-edit-index="${index}" data-edit-delta="1">+</button></div>
        <button class="removeEditItem" type="button" data-remove-edit-item="${index}">Remove</button>
      </div>
    </div>`).join('') : '<p class="error">At least one item is required.</p>';
  const subtotal = editingOrder.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const delivery = subtotal ? editingOrder.deliveryFee : 0;
  $('#editOrderSubtotal').textContent = peso(subtotal);
  $('#editOrderDelivery').textContent = peso(delivery);
  $('#editOrderTotal').textContent = peso(subtotal + delivery);
  $('#saveOrderEdit').disabled = !editingOrder.items.length;
  document.querySelectorAll('[data-edit-index]').forEach(button => button.addEventListener('click', () => {
    const item = editingOrder.items[Number(button.dataset.editIndex)];
    item.quantity += Number(button.dataset.editDelta);
    if (item.quantity <= 0) editingOrder.items.splice(Number(button.dataset.editIndex), 1);
    renderOrderEditor();
  }));
  document.querySelectorAll('[data-remove-edit-item]').forEach(button => button.addEventListener('click', () => {
    editingOrder.items.splice(Number(button.dataset.removeEditItem), 1);
    renderOrderEditor();
  }));
}

function closeOrderEditor() {
  editingOrder = null;
  if ($('#orderEditorDialog').open) $('#orderEditorDialog').close();
}

$('#closeOrderEditor').addEventListener('click', closeOrderEditor);
$('#cancelOrderEdit').addEventListener('click', closeOrderEditor);
$('#orderEditorDialog').addEventListener('cancel', event => { event.preventDefault(); closeOrderEditor(); });
$('#saveOrderEdit').addEventListener('click', async () => {
  if (!editingOrder?.items.length) return toast('The order must have at least one item.');
  const button = $('#saveOrderEdit');
  button.disabled = true;
  try {
    const orderRef = db.collection('orders').doc(editingOrder.id);
    const latest = await orderRef.get();
    if (!latest.exists || latest.data().status !== 'Pending') throw new Error('This order is no longer pending.');
    const items = editingOrder.items.map(item => ({ ...item, lineTotal: item.price * item.quantity }));
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const deliveryFee = Number(editingOrder.deliveryFee || 0);
    const total = subtotal + deliveryFee;
    const summary = items.map(item => `${item.name} ×${item.quantity}`).join(', ');
    const batch = db.batch();
    batch.update(orderRef, {
      items, subtotal, deliveryFee, total,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastEditedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.set(orderRef.collection('messages').doc(), {
      text: `Your pending order was updated: ${summary}. New total: ${peso(total)}. Please review before confirmation.`,
      senderId: auth.currentUser.uid,
      senderName: "Roro's Cravings",
      senderRole: 'admin',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await batch.commit();
    closeOrderEditor();
    toast('Pending order updated. The customer was notified in chat.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Unable to update the order.');
    button.disabled = false;
  }
});

function renderDailySales() {
  const completed = cachedOrders.filter(order => order.status === 'Completed');
  const dates = [...new Set(completed.map(completedDateKey))].sort().reverse();
  const today = philippineDateKey();
  if (!currentSalesDate || !dates.includes(currentSalesDate)) currentSalesDate = dates[0] || today;
  const select = $('#salesDateSelect');
  select.innerHTML = (dates.length ? dates : [today]).map(date => `<option value="${date}" ${date === currentSalesDate ? 'selected' : ''}>${escapeHtml(salesDateLabel(date))}${date === today ? ' (Today)' : ''}</option>`).join('');
  select.onchange = () => { currentSalesDate = select.value; renderDailySales(); };
  const orders = completed.filter(order => completedDateKey(order) === currentSalesDate);
  const total = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  $('#dailySalesSummary').innerHTML = `<div><small>COMPLETED ORDERS</small><strong>${orders.length}</strong></div><div><small>DAILY SALES</small><strong>${peso(total)}</strong></div>`;
  $('#dailySalesOrders').innerHTML = orders.length ? orders.map(order => `<article class="orderCard salesRecord">
    <div class="orderHead"><div><b>${escapeHtml(order.orderId || order.id)}</b><small>${escapeHtml(timestampText(order.completedAt || order.updatedAt || order.createdAt))}</small></div><span class="statusBadge">Completed</span></div>
    <p><b>${escapeHtml(order.customerName)}</b> · ${escapeHtml(order.contact)}</p>
    <div class="orderItems">${(order.items || []).map(item => `<span>${escapeHtml(item.name)} ×${item.quantity}</span>`).join('')}</div>
    <div class="orderTotal">${peso(order.total)}</div>
    <button class="danger deleteOrderBtn" data-delete-sales-order="${escapeHtml(order.id)}">🗑 Delete Completed Order</button>
  </article>`).join('') : `<p class="emptyCategory">No completed sales for ${escapeHtml(salesDateLabel(currentSalesDate))}.</p>`;
  document.querySelectorAll('[data-delete-sales-order]').forEach(button => button.addEventListener('click', () => deleteCompletedOrder(button.dataset.deleteSalesOrder)));
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
  if (midnightResetTimer) clearTimeout(midnightResetTimer);
  midnightResetTimer = null;
  adminOrdersInitialized = false;
}

function startAdminOrderUpdates() {
  stopAdminOrderUpdates();
  $('#ordersList').innerHTML = '<p class="loading">Connecting to live orders…</p>';
  unsubscribeAdminOrders = db.collection('orders').orderBy('createdAt', 'desc').limit(200)
    .onSnapshot(snapshot => {
      if (adminOrdersInitialized) {
        const hasNewOrder = snapshot.docChanges().some(change => change.type === 'added' && change.doc.data().status === 'Pending');
        if (hasNewOrder) {
          currentOrderFilter = 'Pending';
          playNotificationSound('order');
          toast('New order received!');
        }
      } else {
        adminOrdersInitialized = true;
      }
      cachedOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderOrders();
    }, error => {
      console.error('Live orders failed', error);
      loadOrders(false);
    });
  adminOrdersRefreshTimer = setInterval(() => {
    if (isAdminUser()) loadOrders(false);
  }, 60 * 1000);
  scheduleMidnightReset();
}

function scheduleMidnightReset() {
  if (midnightResetTimer) clearTimeout(midnightResetTimer);
  const now = new Date();
  const manilaNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  const nextMidnight = new Date(manilaNow);
  nextMidnight.setHours(24, 0, 1, 0);
  midnightResetTimer = setTimeout(() => {
    currentSalesDate = philippineDateKey();
    renderOrders();
    scheduleMidnightReset();
  }, Math.max(1000, nextMidnight - manilaNow));
}

async function handleStatusChange(select) {
  let etaMinutes = null;
  if (select.value === 'Confirmed') {
    etaMinutes = await chooseEtaMinutes(30);
    if (etaMinutes === null) return renderOrders();
  }
  await updateOrderStatus(select.dataset.order, select.value, etaMinutes);
}

function chooseEtaMinutes(suggestedMinutes = 30) {
  const dialog = $('#etaDialog');
  const select = $('#etaMinutesSelect');
  const choices = [...select.options].map(option => Number(option.value));
  select.value = String(choices.reduce((closest, value) =>
    Math.abs(value - suggestedMinutes) < Math.abs(closest - suggestedMinutes) ? value : closest, choices[0]));
  dialog.showModal();
  return new Promise(resolve => { etaDialogResolver = resolve; });
}

function closeEtaDialog(value = null) {
  if ($('#etaDialog').open) $('#etaDialog').close();
  if (etaDialogResolver) {
    const resolve = etaDialogResolver;
    etaDialogResolver = null;
    resolve(value);
  }
}

$('#etaForm').addEventListener('submit', event => {
  event.preventDefault();
  closeEtaDialog(Number($('#etaMinutesSelect').value));
});
$('#closeEtaDialog').addEventListener('click', () => closeEtaDialog());
$('#cancelEtaDialog').addEventListener('click', () => closeEtaDialog());
$('#etaDialog').addEventListener('cancel', event => {
  event.preventDefault();
  closeEtaDialog();
});

async function updateOrderStatus(orderId, status, etaMinutes = null) {
  try {
    const batch = db.batch();
    const orderRef = db.collection('orders').doc(orderId);
    const update = { status, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (etaMinutes) {
      update.estimatedMinutes = etaMinutes;
      update.estimatedCompletionAt = firebase.firestore.Timestamp.fromMillis(Date.now() + etaMinutes * 60000);
    } else if (['Completed', 'Cancelled'].includes(status)) {
      update.estimatedMinutes = firebase.firestore.FieldValue.delete();
      update.estimatedCompletionAt = firebase.firestore.FieldValue.delete();
    }
    if (status === 'Completed') update.completedAt = firebase.firestore.FieldValue.serverTimestamp();
    const etaNotice = etaMinutes ? ` Estimated time: ${etaMinutes} minutes.` : '';
    const statusMessages = {
      Pending: 'Your order is pending and waiting for confirmation.',
      Confirmed: `Your order has been confirmed.${etaNotice}`,
      Preparing: 'Your order is now being prepared.',
      'Out for Delivery': 'Your order is now out for delivery.',
      Completed: 'Your order has been completed. Thank you for ordering!',
      Cancelled: 'Your order has been cancelled. Please message us if you need assistance.'
    };
    batch.update(orderRef, update);
    batch.set(db.collection('tracking').doc(orderId), { orderId, ...update }, { merge: true });
    batch.set(orderRef.collection('messages').doc(), {
      text: `Order update: ${statusMessages[status] || `Status changed to ${status}.`}`,
      senderId: auth.currentUser.uid,
      senderName: "Roro's Cravings",
      senderRole: 'admin',
      messageType: 'status-update',
      orderStatus: status,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await batch.commit();
    toast(`Order marked ${status}`);
    loadOrders(false);
  } catch (error) { console.error(error); toast('Status update failed.'); }
}

async function updateOrderEstimate(orderId, suggestedMinutes = 30) {
  const minutes = await chooseEtaMinutes(suggestedMinutes);
  if (minutes === null) return;
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
  const cachedOrder = cachedOrders.find(order => order.id === orderId);
  const orderType = cachedOrder?.status || 'closed';
  const salesWarning = orderType === 'Completed' ? ' It will also be removed from the daily sales record.' : '';
  if (!confirm(`Permanently delete ${orderType.toLowerCase()} order ${orderId}?${salesWarning} This cannot be undone.`)) return;
  try {
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists || !['Completed', 'Cancelled'].includes(orderDoc.data().status)) {
      toast('Only completed or cancelled orders can be deleted.');
      return;
    }
    while (true) {
      const messages = await orderRef.collection('messages').limit(400).get();
      if (messages.empty) break;
      const messageBatch = db.batch();
      messages.docs.forEach(message => messageBatch.delete(message.ref));
      await messageBatch.commit();
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

async function deleteCompletedOrderChat(orderId, confirmed = false) {
  if (!confirmed && !confirm(`Delete all chat messages for closed order ${orderId}? The order and its sales record will remain.`)) return;
  try {
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists || !['Completed', 'Cancelled'].includes(orderDoc.data().status)) return toast('Chat can only be deleted after the order is closed.');
    let deleted = 0;
    while (true) {
      const messages = await orderRef.collection('messages').limit(400).get();
      if (messages.empty) break;
      const batch = db.batch();
      messages.docs.forEach(message => batch.delete(message.ref));
      await batch.commit();
      deleted += messages.size;
    }
    await orderRef.update({
      chatArchived: true,
      chatArchivedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast(deleted ? 'Closed-order chat deleted. Order record kept.' : 'Chat archived. Order record kept.');
  } catch (error) {
    console.error(error);
    toast('Unable to delete this chat. Check the updated Firestore rules.');
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
