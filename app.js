const products = [
  ['Hungarian Sausage Rice', 120, 'assets/hungarian.png'],
  ['Samgyupsal Platter', 160, 'assets/samgyup.png'],
  ['Soy Garlic Chicken', 100, 'assets/soy-garlic.png'],
  ['Shawarma Rice', 110, 'assets/shawarma.png'],
  ['Donkatsu', 110, 'assets/donkatsu.png'],
  ['Bibimbap', 170, 'assets/bibimbap.png'],
  ['Gochujang Glazed Chicken', 100, 'assets/gochujang.png'],
  ["Chick 'N Fries", 110, 'assets/chick-fries.png']
];

const DELIVERY_FEE = 30;

const cart = {};
const peso = n => '₱' + n.toLocaleString('en-PH');

const menu = document.querySelector('#menu');
const count = document.querySelector('#count');
const total = document.querySelector('#total');
const grand = document.querySelector('#grand');
const cartItems = document.querySelector('#cartItems');
const cartDialog = document.querySelector('#cartDialog');

products.forEach((p, i) =>
  menu.insertAdjacentHTML(
    'beforeend',
    `<article class="card">
      <img src="${p[2]}" alt="${p[0]}">
      <div class="cardBody">
        <h3>${p[0]}</h3>
        <div class="price">${peso(p[1])}</div>
        <button class="add" onclick="add(${i})">+ Add to Cart</button>
      </div>
    </article>`
  )
);

function add(i) {
  cart[i] = (cart[i] || 0) + 1;
  update();
}

function change(i, d) {
  cart[i] = (cart[i] || 0) + d;

  if (cart[i] <= 0) {
    delete cart[i];
  }

  update();
  renderCart();
}

function totals() {
  let q = 0;
  let subtotal = 0;

  Object.entries(cart).forEach(([i, n]) => {
    q += n;
    subtotal += products[i][1] * n;
  });

  return [q, subtotal];
}

function update() {
  const [q, subtotal] = totals();

  count.textContent = q;
  total.textContent = peso(subtotal);

  const finalTotal = subtotal > 0
    ? subtotal + DELIVERY_FEE
    : 0;

  grand.textContent = peso(finalTotal);
}

function renderCart() {
  cartItems.innerHTML = '';

  if (!Object.keys(cart).length) {
    cartItems.innerHTML = '<p>Your cart is empty.</p>';
  }

  Object.entries(cart).forEach(([i, n]) => {
    const p = products[i];

    cartItems.insertAdjacentHTML(
      'beforeend',
      `<div class="cartRow">
        <div>
          <strong>${p[0]}</strong><br>
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

document.querySelector('#cartBtn').onclick = () => {
  renderCart();
  cartDialog.showModal();
};

document.querySelector('#checkout').onsubmit = e => {
  e.preventDefault();

  if (!Object.keys(cart).length) {
    return alert('Please add an item first.');
  }

  const f = new FormData(e.target);
  const [, subtotal] = totals();
  const finalTotal = subtotal + DELIVERY_FEE;

  let lines = [
    "Roro's Cravings – New Order",
    ''
  ];

  Object.entries(cart).forEach(([i, n]) => {
    lines.push(
      `${products[i][0]} x${n} — ${peso(products[i][1] * n)}`
    );
  });

  lines.push(
    '',
    `SUBTOTAL: ${peso(subtotal)}`,
    `DELIVERY FEE: ${peso(DELIVERY_FEE)}`,
    `TOTAL: ${peso(finalTotal)}`,
    '',
    `Name: ${f.get('name')}`,
    `Complete Address: ${f.get('address')}`,
    `Contact Number: ${f.get('contact')}`,
    '',
    'Please confirm my order.'
  );

  document.querySelector('#summary').value = lines.join('\n');
  document.querySelector('#summaryWrap').hidden = false;
};

document.querySelector('#copyBtn').onclick = async () => {
  await navigator.clipboard.writeText(
    document.querySelector('#summary').value
  );

  document.querySelector('#copyBtn').textContent =
    '✓ Copied! Send Order via Messenger...';

  window.location.href = 'https://m.me/RorosCravingsDigos';
};

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
