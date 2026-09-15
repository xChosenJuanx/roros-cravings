const products=[
['Hungarian Sausage Rice',120,'assets/hungarian.png'],['Samgyupsal Platter',160,'assets/samgyup.png'],['Soy Garlic Chicken',100,'assets/soy-garlic.png'],['Shawarma Rice',110,'assets/shawarma.png'],['Donkatsu',110,'assets/donkatsu.png'],['Bibimbap',170,'assets/bibimbap.png'],['Gochujang Glazed Chicken',100,'assets/gochujang.png'],["Chick 'N Fries",110,'assets/chick-fries.png']];
const cart={};const peso=n=>'₱'+n.toLocaleString('en-PH');
const menu=document.querySelector('#menu'),count=document.querySelector('#count'),total=document.querySelector('#total'),grand=document.querySelector('#grand'),cartItems=document.querySelector('#cartItems'),cartDialog=document.querySelector('#cartDialog');
products.forEach((p,i)=>menu.insertAdjacentHTML('beforeend',`<article class="card"><img src="${p[2]}" alt="${p[0]}"><div class="cardBody"><h3>${p[0]}</h3><div class="price">${peso(p[1])}</div><button class="add" onclick="add(${i})">+ Add to Cart</button></div></article>`));
function add(i){cart[i]=(cart[i]||0)+1;update()}function change(i,d){cart[i]=(cart[i]||0)+d;if(cart[i]<=0)delete cart[i];update();renderCart()}
function totals(){let q=0,t=0;Object.entries(cart).forEach(([i,n])=>{q+=n;t+=products[i][1]*n});return[q,t]}
function update(){const[q,t]=totals();count.textContent=q;total.textContent=peso(t);grand.textContent=peso(t)}
function renderCart(){cartItems.innerHTML='';if(!Object.keys(cart).length)cartItems.innerHTML='<p>Your cart is empty.</p>';Object.entries(cart).forEach(([i,n])=>{const p=products[i];cartItems.insertAdjacentHTML('beforeend',`<div class="cartRow"><div><strong>${p[0]}</strong><br><small>${peso(p[1])} each</small></div><div class="qty"><button onclick="change(${i},-1)">−</button><b>${n}</b><button onclick="change(${i},1)">+</button></div></div>`)});update()}
document.querySelector('#cartBtn').onclick=()=>{renderCart();cartDialog.showModal()};
document.querySelector('#checkout').onsubmit=e=>{e.preventDefault();if(!Object.keys(cart).length)return alert('Please add an item first.');const f=new FormData(e.target),[,t]=totals();let lines=["Roro's Cravings – New Order",''];Object.entries(cart).forEach(([i,n])=>lines.push(`${products[i][0]} x${n} — ${peso(products[i][1]*n)}`));lines.push('',`TOTAL: ${peso(t)}`,'',`Name: ${f.get('name')}`,`Complete Address: ${f.get('address')}`,`Contact Number: ${f.get('contact')}`,'','Please confirm my order.');document.querySelector('#summary').value=lines.join('\n');document.querySelector('#summaryWrap').hidden=false};
document.querySelector('#copyBtn').onclick=async()=>{
  await navigator.clipboard.writeText(document.querySelector('#summary').value);
  document.querySelector('#copyBtn').textContent='✓ Copied! Opening Messenger...';
  setTimeout(()=>{
    window.open('https://m.me/RorosCravingsDigos','_blank');
  },500);
}
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
