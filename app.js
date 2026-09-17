const products = [
  ['Hungarian Sausage Rice', 120, 'assets/hungarian.png'],
  ['Samgyupsal Platter', 160, 'assets/samgyup.png'],
  ['Soy Garlic Chicken', 110, 'assets/soy-garlic.png'],
  ['Shawarma Rice', 110, 'assets/shawarma.png'],
  ['Donkatsu', 110, 'assets/donkatsu.png'],
  ['Bibimbap', 170, 'assets/bibimbap.png'],
  ['Gochujang Glazed Chicken', 110, 'assets/gochujang.png'],
  ["Chick 'N Fries", 110, 'assets/chick-fries.png']
];

// DELIVERY FEES PER AREA
const deliveryFees = {
  'Digos City': 35,
  'Hagonoy': 45,
  'Padada': 45,
  'Kiblawan': 60
};

const cart = {};

const peso = n => '₱' + n.toLocaleString('en-PH');

const menu = document.querySelector('#menu');
const count = document.querySelector('#count');
const total = document.querySelector('#total');
const grand = document.querySelector('#grand');
const cartItems = document.querySelector('#cartItems');
const cartDialog = document.querySelector('#cartDialog');
const deliveryArea = document.querySelector('#deliveryArea');


// DISPLAY MENU
products.forEach((p, i) => {
  menu.insertAdjacentHTML(
    'beforeend',
    `<article class="card">
      <img src="${p[2]}" alt="${p[0]}">

      <div class="cardBody">
        <h3>${p[0]}</h3>

        <div class="price">
          ${peso(p[1])}
        </div>

        <button class="add" onclick="add(${i})">
          + Add to Cart
        </button>
      </div>
    </article>`
  );
});


// GET SELECTED DELIVERY FEE
function getDeliveryFee() {
  const area = deliveryArea.value;

  if (!area) {
    return 0;
  }

  return deliveryFees[area] || 0;
}


// ADD ITEM
function add(i) {

  if (!deliveryArea.value) {
    alert('Please select your delivery area first.');

    deliveryArea.focus();

    deliveryArea.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });

    return;
  }

  cart[i] = (cart[i] || 0) + 1;

  update();
}


// CHANGE QUANTITY
function change(i, d) {

  cart[i] = (cart[i] || 0) + d;

  if (cart[i] <= 0) {
    delete cart[i];
  }

  update();
  renderCart();
}


// CALCULATE CART TOTALS
function totals() {

  let q = 0;
  let subtotal = 0;

  Object.entries(cart).forEach(([i, n]) => {
    q += n;
    subtotal += products[i][1] * n;
  });

  return [q, subtotal];
}


// UPDATE CART DISPLAY
function update() {

  const [q, subtotal] = totals();
  const deliveryFee = getDeliveryFee();

  count.textContent = q;

  // Bottom cart button shows food subtotal
  total.textContent = peso(subtotal);

  // Checkout total includes delivery
  const finalTotal =
    subtotal > 0
      ? subtotal + deliveryFee
      : 0;

  grand.textContent = peso(finalTotal);
}


// RENDER CART
function renderCart() {

  cartItems.innerHTML = '';

  if (!Object.keys(cart).length) {
    cartItems.innerHTML =
      '<p>Your cart is empty.</p>';
  }

  Object.entries(cart).forEach(([i, n]) => {

    const p = products[i];

    cartItems.insertAdjacentHTML(
      'beforeend',
      `<div class="cartRow">

        <div>
          <strong>${p[0]}</strong>
          <br>
          <small>${peso(p[1])} each</small>
        </div>

        <div class="qty">
          <button onclick="change(${i},-1)">−</button>
          <b>${n}</b>
          <button onclick="change(${i},1)">+</button>
        </div>

      </div>`
    );
  });

  update();
}


// UPDATE TOTAL IF CUSTOMER CHANGES AREA
deliveryArea.addEventListener('change', () => {

  update();

  // Hide old summary because delivery fee may have changed
  document.querySelector('#summaryWrap').hidden = true;

});


// OPEN CART
document.querySelector('#cartBtn').onclick = () => {

  renderCart();

  cartDialog.showModal();
};


// GENERATE ORDER SUMMARY
document.querySelector('#checkout').onsubmit = e => {

  e.preventDefault();

  if (!deliveryArea.value) {

    cartDialog.close();

    alert('Please select your delivery area first.');

    deliveryArea.focus();

    deliveryArea.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });

    return;
  }

  if (!Object.keys(cart).length) {
    return alert('Please add an item first.');
  }

  const f = new FormData(e.target);

  const [, subtotal] = totals();

  const area = deliveryArea.value;
  const deliveryFee = getDeliveryFee();
  const finalTotal = subtotal + deliveryFee;

  let lines = [
    "Roro's Cravings – New Order",
    '',
    `Delivery Area: ${area}`,
    ''
  ];


  // ORDER ITEMS
  Object.entries(cart).forEach(([i, n]) => {

    lines.push(
      `${products[i][0]} x${n} — ${peso(products[i][1] * n)}`
    );

  });


  // TOTALS + CUSTOMER DETAILS
  lines.push(
    '',
    `SUBTOTAL: ${peso(subtotal)}`,
    `DELIVERY FEE: ${peso(deliveryFee)}`,
    `TOTAL: ${peso(finalTotal)}`,
    '',
    `Name: ${f.get('name')}`,
    `Complete Address: ${f.get('address')}`,
    `Contact Number: ${f.get('contact')}`,
    '',
    'Please confirm my order.'
  );


  document.querySelector('#summary').value =
    lines.join('\n');

  document.querySelector('#summaryWrap').hidden =
    false;
};


// COPY SUMMARY + OPEN MESSENGER
document.querySelector('#copyBtn').onclick = async () => {

  await navigator.clipboard.writeText(
    document.querySelector('#summary').value
  );

  document.querySelector('#copyBtn').textContent =
    '✓ Copied! Send Order via Messenger...';

  window.location.href =
    'https://m.me/RorosCravingsDigos';
};


// SERVICE WORKER
if ('serviceWorker' in navigator) {

  navigator.serviceWorker.register('sw.js');

}
