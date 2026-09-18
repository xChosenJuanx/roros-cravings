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
const ADMIN_EMAIL = 'solidtagasogid26@gmail.com';
const STATUSES = ['Pending', 'Confirmed', 'Preparing', 'Out for Delivery', 'Completed', 'Cancelled'];
const nativePlugins = window.Capacitor?.Plugins || {};
const FirebaseAuthentication = nativePlugins.FirebaseAuthentication;
const PushNotifications = nativePlugins.PushNotifications;
let currentUser = null;
let pushStartedForUid = null;
let cachedOrders = [];
let currentOrderFilter = 'Pending';
let deliveryLocation = null;

const fallbackProducts = [
  { id: 'hungarian', name: 'Hungarian Sausage Rice', price: 120, image: 'assets/hungarian.png', available: true },
  { id: 'samgyup', name: 'Samgyupsal Platter', price: 160, image: 'assets/samgyup.png', available: true },
  { id: 'soy-garlic', name: 'Soy Garlic Chicken', price: 110, image: 'assets/soy-garlic.png', available: true },
  { id: 'shawarma', name: 'Shawarma Rice', price: 110, image: 'assets/shawarma.png', available: true },
  { id: 'donkatsu', name: 'Donkatsu', price: 110, image: 'assets/donkatsu.png', available: true },
  { id: 'bibimbap', name: 'Bibimbap', price: 170, image: 'assets/bibimbap.png', available: true },
  { id: 'gochujang', name: 'Gochujang Glazed Chicken', price: 110, image: 'assets/gochujang.png', available: true },
  { id: 'chick-fries', name: "Chick 'N Fries", price: 110, image: 'assets/chick-fries.png', available: true }
];

const DIGOS_DELIVERY_FEE = 35;
let products = [];
const cart = {};

const $ = selector => document.querySelector(selector);
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH');
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
const safeImage = value => /^(https:\/\/|assets\/)[^"'<>]+$/i.test(value || '') ? value : 'assets/logo.png';
const timestampText = value => value?.toDate ? value.toDate().toLocaleString('en-PH') : 'Just now';

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 2800);
}

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === id));
  $('#cartBtn').hidden = id !== 'shopView';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

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
  const available = products.filter(p => p.available !== false);
  $('#menu').innerHTML = available.length ? available.map(p => `
    <article class="card">
      <img src="${escapeHtml(safeImage(p.image))}" alt="${escapeHtml(p.name)}" onerror="this.src='assets/logo.png'">
      <div class="cardBody"><h3>${escapeHtml(p.name)}</h3><div class="price">${peso(p.price)}</div>
      <button class="add" data-add="${escapeHtml(p.id)}">+ Add to Cart</button></div>
    </article>`).join('') : '<p>No available products right now.</p>';
  document.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => add(btn.dataset.add)));
}

function getProduct(id) { return products.find(p => p.id === id); }
function getDeliveryFee() { return DIGOS_DELIVERY_FEE; }

function add(id) {
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
      <div class="timeline">${STATUSES.slice(0, 5).map((s, i) => `<div class="timelineStep ${i <= step && step < 5 ? 'done' : ''}"><span></span>${s}</div>`).join('')}</div>
      <p class="muted">Last updated: ${escapeHtml(timestampText(data.updatedAt))}</p>`;
  } catch (error) {
    console.error(error);
    result.innerHTML = '<p class="error">Unable to check right now. Please try again.</p>';
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
  } else {
    pushStartedForUid = null;
  }
  if (isAdmin) {
    $('#adminEmail').textContent = user.email;
    showView('adminView');
    loadOrders();
    loadProducts();
  } else if ($('#adminView').classList.contains('active')) {
    showView('shopView');
  }
});

$('#logoutBtn').addEventListener('click', () => auth.signOut());
$('#refreshOrders').addEventListener('click', loadOrders);

function renderOrderCategories() {
  const filters = $('#orderStatusFilters');
  filters.innerHTML = STATUSES.map(status => {
    const count = cachedOrders.filter(order => order.status === status).length;
    return `<button class="orderFilter ${currentOrderFilter === status ? 'active' : ''}" data-order-filter="${escapeHtml(status)}">${escapeHtml(status)} <span>${count}</span></button>`;
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
    ? `<strong>${completedOrders.length} Completed Orders</strong><strong>Total Sales: ${peso(completedSales)}</strong>`
    : `<strong>${visibleOrders.length} ${escapeHtml(currentOrderFilter)} Orders</strong>`;

  $('#ordersList').innerHTML = visibleOrders.length ? visibleOrders.map(order => `
    <article class="orderCard">
      <div class="orderHead"><div><b>${escapeHtml(order.orderId || order.id)}</b><small>${escapeHtml(timestampText(order.createdAt))}</small></div><span class="statusBadge">${escapeHtml(order.status)}</span></div>
      <p><b>${escapeHtml(order.customerName)}</b> · ${escapeHtml(order.contact)}<br>${escapeHtml(order.address)}<br>Digos City · ${escapeHtml(order.paymentMethod)}</p>
      ${order.deliveryLocation?.latitude && order.deliveryLocation?.longitude ? `<a class="mapButton" href="https://www.google.com/maps?q=${encodeURIComponent(order.deliveryLocation.latitude)},${encodeURIComponent(order.deliveryLocation.longitude)}" target="_blank" rel="noopener">📍 Open Customer Location</a>` : '<p class="locationMissing">No GPS pin shared — use the written address.</p>'}
      <div class="orderItems">${(order.items || []).map(i => `<span>${escapeHtml(i.name)} ×${i.quantity}</span>`).join('')}</div>
      ${order.notes ? `<p class="notes">Note: ${escapeHtml(order.notes)}</p>` : ''}
      <div class="orderTotal">Total: ${peso(order.total)}</div>
      <label>Update status<select class="statusSelect" data-order="${escapeHtml(order.id)}">${STATUSES.map(s => `<option ${s === order.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      ${order.status === 'Completed' ? `<button class="danger deleteOrderBtn" data-delete-order="${escapeHtml(order.id)}">🗑 Delete Completed Order</button>` : ''}
    </article>`).join('') : `<p class="emptyCategory">No ${escapeHtml(currentOrderFilter.toLowerCase())} orders.</p>`;
  document.querySelectorAll('.statusSelect').forEach(select => select.addEventListener('change', () => updateOrderStatus(select.dataset.order, select.value)));
  document.querySelectorAll('[data-delete-order]').forEach(button => button.addEventListener('click', () => deleteCompletedOrder(button.dataset.deleteOrder)));
}

async function loadOrders() {
  $('#ordersList').innerHTML = '<p class="loading">Loading orders…</p>';
  try {
    const snap = await db.collection('orders').orderBy('createdAt', 'desc').limit(200).get();
    cachedOrders = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderOrders();
  } catch (error) {
    console.error(error);
    $('#ordersList').innerHTML = `<p class="error">Unable to load orders: ${escapeHtml(error.message)}</p>`;
  }
}

async function updateOrderStatus(orderId, status) {
  try {
    const batch = db.batch();
    const update = { status, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    batch.update(db.collection('orders').doc(orderId), update);
    batch.set(db.collection('tracking').doc(orderId), { orderId, ...update }, { merge: true });
    await batch.commit();
    toast(`Order marked ${status}`);
    loadOrders();
  } catch (error) { console.error(error); toast('Status update failed.'); }
}

async function deleteCompletedOrder(orderId) {
  if (!confirm(`Permanently delete completed order ${orderId}? This cannot be undone.`)) return;
  try {
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists || orderDoc.data().status !== 'Completed') {
      toast('Only completed orders can be deleted.');
      return;
    }
    const batch = db.batch();
    batch.delete(orderRef);
    batch.delete(db.collection('tracking').doc(orderId));
    await batch.commit();
    toast('Completed order deleted.');
    loadOrders();
  } catch (error) {
    console.error(error);
    toast('Unable to delete order.');
  }
}

function renderAdminProducts() {
  $('#adminProducts').innerHTML = products.map(p => `<article class="productAdmin"><img src="${escapeHtml(safeImage(p.image))}" onerror="this.src='assets/logo.png'" alt=""><div><b>${escapeHtml(p.name)}</b><small>${peso(p.price)} · ${p.available === false ? 'Unavailable' : 'Available'}</small></div><button data-edit-product="${escapeHtml(p.id)}">Edit</button><button class="danger" data-delete-product="${escapeHtml(p.id)}">Delete</button></article>`).join('');
  document.querySelectorAll('[data-edit-product]').forEach(btn => btn.addEventListener('click', () => editProduct(btn.dataset.editProduct)));
  document.querySelectorAll('[data-delete-product]').forEach(btn => btn.addEventListener('click', () => deleteProduct(btn.dataset.deleteProduct)));
}

function editProduct(id) {
  const p = getProduct(id);
  const f = $('#productForm').elements;
  f.id.value = p.id; f.name.value = p.name; f.price.value = p.price; f.image.value = p.image; f.available.checked = p.available !== false;
  $('#productForm').scrollIntoView({ behavior: 'smooth' });
}

function clearProductForm() { $('#productForm').reset(); $('#productForm').elements.id.value = ''; $('#productForm').elements.available.checked = true; }
$('#cancelEdit').addEventListener('click', clearProductForm);

$('#productForm').addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(event.target);
  const id = data.get('id') || db.collection('products').doc().id;
  try {
    await db.collection('products').doc(id).set({ name: String(data.get('name')).trim(), price: Number(data.get('price')), image: String(data.get('image')).trim(), available: data.get('available') === 'on', updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    toast('Product saved'); clearProductForm(); await loadProducts();
  } catch (error) { console.error(error); toast('Unable to save product.'); }
});

async function deleteProduct(id) {
  if (!confirm('Delete this product from the menu?')) return;
  try { await db.collection('products').doc(id).delete(); toast('Product deleted'); await loadProducts(); }
  catch (error) { console.error(error); toast('Unable to delete product.'); }
}

loadProducts();
updateTotals();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
