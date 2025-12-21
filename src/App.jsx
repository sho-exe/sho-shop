import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { ShoppingBag, X, Upload, ShieldCheck, Check, Loader2, Trash2, Plus, Package } from 'lucide-react';
import './index.css';

function App() {
  // --- STATE ---
  const [view, setView] = useState('shop');
  const [products, setProducts] = useState([]);
  // Load cart from Local Storage on startup
  const [cart, setCart] = useState(() => {
    const savedCart = localStorage.getItem('purpleCart');
    return savedCart ? JSON.parse(savedCart) : [];
  }); const [orders, setOrders] = useState([]);
  const [soldCounts, setSoldCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);

  // NEW: Admin Tab State ('orders' or 'products')
  const [adminTab, setAdminTab] = useState('orders');

  // NEW: Add Product Form State
  const [newProduct, setNewProduct] = useState({ name: '', price: '', desc: '' });
  const [isAdding, setIsAdding] = useState(false);

  // Customer Form State
  const [customerDetails, setCustomerDetails] = useState({ email: '', address: '', phone: '' });
  const [notification, setNotification] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [uploading, setUploading] = useState(false);

  // --- INIT ---
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      await fetchProducts();
      await calculateSalesStats();
      setLoading(false);
    };
    initData();
  }, []);

  // --- SAVE CART TO LOCAL STORAGE ---
  useEffect(() => {
    localStorage.setItem('purpleCart', JSON.stringify(cart));
  }, [cart]);

  // --- DATA FETCHING ---
  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*').order('id', { ascending: false });
    if (data) setProducts(data);
  };

  const fetchOrders = async () => {
    const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (data) setOrders(data);
  };

  const calculateSalesStats = async () => {
    const { data } = await supabase.from('orders').select('items');
    if (data) {
      const counts = {};
      data.forEach(order => {
        if (Array.isArray(order.items)) {
          order.items.forEach(product => {
            counts[product.id] = (counts[product.id] || 0) + 1;
          });
        }
      });
      setSoldCounts(counts);
    }
  };

  // --- SHOP ACTIONS ---
  const addToCart = (product, quantity = 1) => {
    // Create an array of the product repeated 'quantity' times
    const newItems = Array(quantity).fill(product);
    setCart([...cart, ...newItems]);

    setNotification(`${quantity}x ${product.name} added to bag!`);
    setTimeout(() => setNotification(null), 3000);

    // Close modal after adding (Optional, keeps UI clean)
    setSelectedProduct(null);
  };

  const handleOpenCart = () => {
    if (cart.length === 0) return alert("Your cart is empty!");
    setView('cart');
  };

  // --- CHECKOUT LOGIC ---
  const handleInputChange = (e) => {
    setCustomerDetails({ ...customerDetails, [e.target.name]: e.target.value });
  };

  // Add this helper function inside App()
  const clearCart = () => {
    if (window.confirm("Are you sure you want to remove all items?")) {
      setCart([]); // Clear the state
    }
  };


  const getGroupedCart = () => {
    const grouped = {};
    cart.forEach(item => {
      if (!grouped[item.id]) {
        grouped[item.id] = { ...item, quantity: 0 };
      }
      grouped[item.id].quantity += 1;
    });
    return Object.values(grouped);
  };
  const handleCheckout = async (e) => {
    e.preventDefault();
    const file = e.target.receipt.files[0];
    if (!file) return alert("Please upload receipt!");
    if (!customerDetails.email || !customerDetails.address) return alert("Fill all details!");

    setUploading(true);
    try {
      const fileName = `${Date.now()}_${file.name}`;
      await supabase.storage.from('receipts').upload(fileName, file);
      const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(fileName);

      await supabase.from('orders').insert([{
        total: cart.reduce((sum, i) => sum + i.price, 0),
        items: cart,
        receipt_url: publicUrl,
        status: 'pending',
        customer_email: customerDetails.email,
        customer_address: customerDetails.address,
        customer_phone: customerDetails.phone
      }]);

      alert("Order sent!");
      setCart([]); setCustomerDetails({ email: '', address: '', phone: '' }); setView('shop');
      calculateSalesStats();
    } catch (error) { alert(error.message); }
    finally { setUploading(false); }
  };

  // --- ADMIN: ORDER ACTIONS ---
  const approveOrder = async (id) => {
    await supabase.from('orders').update({ status: 'approved' }).eq('id', id);
    fetchOrders(); calculateSalesStats();
  };
  const markDelivered = async (id) => {
    await supabase.from('orders').update({ status: 'delivered' }).eq('id', id);
    fetchOrders();
  };

  // --- ADMIN: PRODUCT ACTIONS (NEW) ---
  const handleAddProduct = async (e) => {
    e.preventDefault();
    const file = e.target.image.files[0];
    if (!file) return alert("Please upload a product image");

    setIsAdding(true);
    try {
      // 1. Upload Image to 'products' bucket
      const fileName = `${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('products').upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('products').getPublicUrl(fileName);

      // 2. Insert to Database
      const { error: dbError } = await supabase.from('products').insert([{
        name: newProduct.name,
        price: parseFloat(newProduct.price),
        description: newProduct.desc,
        image_url: publicUrl
      }]);
      if (dbError) throw dbError;

      alert("Product Created!");
      setNewProduct({ name: '', price: '', desc: '' }); // Reset form
      e.target.reset(); // Clear file input
      fetchProducts(); // Refresh list

    } catch (error) {
      alert("Error adding product: " + error.message);
    } finally {
      setIsAdding(false);
    }
  };

  const deleteProduct = async (id) => {
    if (!window.confirm("Are you sure you want to delete this item?")) return;

    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) alert("Error deleting");
    else fetchProducts();
  };

  // --- RENDER HELPERS ---
  const renderProductModal = () => {
    if (!selectedProduct) return null;

    return (
      <div className="modal-overlay" onClick={() => setSelectedProduct(null)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <button className="close-btn" onClick={() => setSelectedProduct(null)}><X size={20} /></button>

          <div className="modal-content-grid">
            {/* Left: Image */}
            <div className="modal-left" style={{ padding: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', background: '#f1f5f9' }}>
              <img src={selectedProduct.image_url} alt={selectedProduct.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>

            {/* Right: Info */}
            <div className="modal-right">
              <div>
                <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{selectedProduct.name}</h2>
                <span className="price" style={{ fontSize: '1.5rem' }}>RM{selectedProduct.price}</span>
                <p style={{ margin: '1.5rem 0', color: '#475569', lineHeight: '1.6' }}>{selectedProduct.description || "No description."}</p>
                {soldCounts[selectedProduct.id] > 0 && <span className="sold-badge">🔥 {soldCounts[selectedProduct.id]} Sold</span>}
              </div>

              {/* NEW: QUANTITY SELECTOR */}
              <div style={{ marginTop: 'auto' }}>
                <div className="qty-wrapper">
                  <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>Quantity:</span>
                  <div className="qty-control">
                    <button onClick={() => setQty(q => Math.max(1, q - 1))}>-</button>
                    <span>{qty}</span>
                    <button onClick={() => setQty(q => q + 1)}>+</button>
                  </div>
                </div>

                <button
                  onClick={() => addToCart(selectedProduct, qty)}
                  className="add-btn"
                  style={{ marginTop: '1rem', padding: '1rem' }}
                >
                  Add To Cart - RM{(selectedProduct.price * qty).toFixed(2)}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // --- VIEWS ---

  // 1. CART VIEW
  if (view === 'cart') {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <button className="close-btn" onClick={() => setView('shop')}><X size={20} /></button>
          <div className="modal-content-grid">
            <div className="modal-left" style={{ flexDirection: 'column', alignItems: 'stretch', padding: '2rem' }}>

              {/* UPDATED HEADER: "Your Cart" + "Clear All" Button */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0 }}>Your Cart</h2>
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.9rem', textDecoration: 'underline' }}
                  >
                    Clear All
                  </button>
                )}
              </div>

              <div style={{ flex: 1, overflowY: 'auto' }}>
                {getGroupedCart().map((item) => (
                  <div key={item.id} className="cart-item">
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <span style={{ fontWeight: 'bold', background: '#e2e8f0', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>
                        {item.quantity}
                      </span>
                      <span>{item.name}</span>
                    </div>
                    <span>RM{(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}

                {/* Message if empty */}
                {cart.length === 0 && (
                  <p style={{ color: '#94a3b8', textAlign: 'center', marginTop: '2rem' }}>
                    Your cart is empty.
                  </p>
                )}
              </div>

              <div className="total-row">
                Total: RM{cart.reduce((sum, i) => sum + i.price, 0).toFixed(2)}
              </div>
            </div>
            <div className="modal-right">
              <form onSubmit={handleCheckout} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3>Shipping Details</h3>
                <input name="email" className="input-field" placeholder="Email" onChange={handleInputChange} required />
                <input name="phone" className="input-field" placeholder="Phone" onChange={handleInputChange} required />
                <textarea name="address" className="input-field" placeholder="Address" onChange={handleInputChange} required></textarea>
                <div className="qr-container" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=PayToSeller" className="qr-frame" style={{ width: '80px', margin: 0 }} alt="QR" />
                  <div><strong>Scan to Pay</strong><br /><span style={{ color: '#64748b', fontSize: '0.9rem' }}>PurpleBank: 123-456</span></div>
                </div>
                <input type="file" name="receipt" accept="image/*" required style={{ width: '100%' }} />
                <button type="submit" className="checkout-btn" disabled={uploading}>{uploading ? 'Processing...' : 'Complete Order'} <Upload size={18} /></button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. ADMIN VIEW
  if (view === 'admin') {
    return (
      <div className="App">
        <nav className="navbar" style={{ background: '#1e293b', color: 'white' }}>
          <div className="logo" style={{ color: 'white' }}>Seller Dashboard</div>
          <button className="icon-btn" style={{ background: '#334155', color: 'white' }} onClick={() => setView('shop')}>Exit Admin</button>
        </nav>
        <div className="container">
          {/* Admin Tabs */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
            <button
              onClick={() => setAdminTab('orders')}
              className={`icon-btn ${adminTab === 'orders' ? 'active-tab' : ''}`}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <Package size={18} /> Orders ({orders.length})
            </button>
            <button
              onClick={() => setAdminTab('products')}
              className={`icon-btn ${adminTab === 'products' ? 'active-tab' : ''}`}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <ShoppingBag size={18} /> Manage Products ({products.length})
            </button>
          </div>

          {/* TAB 1: ORDERS */}
          {adminTab === 'orders' && (
            <div className="orders-list">
              <button onClick={fetchOrders} className="icon-btn" style={{ marginBottom: '1rem' }}>Refresh List</button>
              {orders.map(order => (
                <div key={order.id} className={`order-card ${order.status}`}>
                  <div style={{ minWidth: '100px' }}><strong>#{order.id}</strong><br /><span className={`status-badge ${order.status}`}>{order.status}</span></div>
                  <div style={{ flex: 1, margin: '0 1.5rem' }}>
                    <div style={{ marginBottom: '8px' }}><strong>Items:</strong> {order.items?.map(i => i.name).join(', ')} (RM{order.total})</div>
                    {(order.customer_email) && (
                      <div style={{ background: '#f1f5f9', padding: '10px', borderRadius: '8px', fontSize: '0.85rem' }}>
                        📧 {order.customer_email} • 📞 {order.customer_phone}<br />🏠 {order.customer_address}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
                    <a href={order.receipt_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.9rem', color: '#64748b', textDecoration: 'underline' }}>View Receipt</a>
                    {order.status === 'pending' && <button onClick={() => approveOrder(order.id)} className="approve-btn">Approve <Check size={14} /></button>}
                    {order.status === 'approved' && <button onClick={() => markDelivered(order.id)} className="deliver-btn">Ship <Upload size={14} style={{ transform: 'rotate(90deg)' }} /></button>}
                    {order.status === 'delivered' && <span style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: '5px' }}><Check size={14} /> Complete</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 2: PRODUCTS (MANAGE ITEMS) */}
          {adminTab === 'products' && (
            <div className="admin-products">
              {/* Add Product Form */}
              <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                <h3>Add New Product</h3>
                <form onSubmit={handleAddProduct} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <input
                    placeholder="Product Name" className="input-field" required
                    value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })}
                  />
                  <input
                    type="number" placeholder="Price (RM)" className="input-field" required
                    value={newProduct.price} onChange={e => setNewProduct({ ...newProduct, price: e.target.value })}
                  />
                  <input
                    placeholder="Description" className="input-field" style={{ gridColumn: 'span 2' }} required
                    value={newProduct.desc} onChange={e => setNewProduct({ ...newProduct, desc: e.target.value })}
                  />
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Product Image:</label>
                    <input type="file" name="image" accept="image/*" required style={{ width: '100%', marginTop: '5px' }} />
                  </div>
                  <button type="submit" className="add-btn" style={{ gridColumn: 'span 2' }} disabled={isAdding}>
                    {isAdding ? 'Uploading...' : 'Create Product'} <Plus size={18} style={{ verticalAlign: 'middle' }} />
                  </button>
                </form>
              </div>

              {/* Product List */}
              <div className="product-list-admin">
                {products.map(p => (
                  <div key={p.id} className="cart-item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <img src={p.image_url} alt="" style={{ width: '50px', height: '50px', borderRadius: '4px', objectFit: 'cover' }} />
                      <div>
                        <strong>{p.name}</strong>
                        <div style={{ color: '#64748b' }}>RM{p.price}</div>
                      </div>
                    </div>
                    <button onClick={() => deleteProduct(p.id)} className="icon-btn" style={{ color: '#ef4444', borderColor: '#fee2e2', background: '#fef2f2' }}>
                      <Trash2 size={16} /> Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 3. MAIN SHOP VIEW
  return (
    <div className="App">
      <nav className="navbar">
        <div className="logo">ShoShop</div>
        <div className="nav-actions">
          <button className="icon-btn" onClick={() => { setView('admin'); fetchOrders(); setAdminTab('orders'); }}>
            <ShieldCheck size={18} /> Seller
          </button>
          <button className="icon-btn" onClick={handleOpenCart}>
            <ShoppingBag size={18} /> <span>Cart ({cart.length})</span>
          </button>
        </div>
      </nav>

      <div className="container">
        {loading ? <div className="loading"><Loader2 className="spin" /> Loading...</div> : (
          <div className="product-grid">
            {products.map((product) => (
              <div key={product.id} className="card" onClick={() => { setSelectedProduct(product); setQty(1) }} style={{ cursor: 'pointer' }}>
                <img src={product.image_url} alt={product.name} className="card-img" />
                <div className="card-body">
                  <h3>{product.name}</h3>
                  <div className="sales-info">
                    <span className="price">RM{product.price}</span>
                    {soldCounts[product.id] > 0 && <span className="sold-badge">🔥 {soldCounts[product.id]} Sold</span>}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); addToCart(product); }} className="add-btn">Add to Cart</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {notification && <div className="notification-toast"><Check size={16} /> {notification}</div>}
      {renderProductModal()}
    </div>
  );
}

export default App;