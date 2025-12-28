import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { ShoppingBag, X, Upload, ShieldCheck, Check, Loader2, Trash2, Plus, Package, LogOut, User, History } from 'lucide-react';
import './index.css';


// --- CONFIGURATION ---
const SELLER_EMAIL = 'shukriraja10@gmail.com';

function App() {
  // --- STATE ---
  const [view, setView] = useState('shop'); // 'shop', 'cart', 'admin', 'customer_orders'
  const [products, setProducts] = useState([]);
  const [session, setSession] = useState(null);

  // Cart with Local Storage
  const [cart, setCart] = useState(() => {
    const savedCart = localStorage.getItem('purpleCart');
    return savedCart ? JSON.parse(savedCart) : [];
  });

  // Toggle for the zoomed-in QR view (MOVED UP)
  const [isQRExpanded, setIsQRExpanded] = useState(false);

  const [orders, setOrders] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [soldCounts, setSoldCounts] = useState({});
  const [loading, setLoading] = useState(true);

  const [fileName, setFileName] = useState("");
  // Admin State
  const [adminTab, setAdminTab] = useState('orders');
  const [newProduct, setNewProduct] = useState({ name: '', price: '', desc: '' });
  const [isAdding, setIsAdding] = useState(false);

  // Shop/Customer State
  const [customerDetails, setCustomerDetails] = useState({ email: '', address: '', phone: '' });
  const [notification, setNotification] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [uploading, setUploading] = useState(false);

  // --- INIT ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        setCustomerDetails(prev => ({ ...prev, email: session.user.email }));
        fetchMyOrders(session.user.email);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        setCustomerDetails(prev => ({ ...prev, email: session.user.email }));
        fetchMyOrders(session.user.email);
      } else {
        setMyOrders([]);
      }
    });

    const initData = async () => {
      setLoading(true);
      await fetchProducts();
      await calculateSalesStats();
      setLoading(false);
    };
    initData();

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem('purpleCart', JSON.stringify(cart));
  }, [cart]);

  // --- AUTH ACTIONS ---
  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google' });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setView('shop');

    setNotification("Successfully logged out!");
    setTimeout(() => setNotification(null), 3000);
  };

  // --- DATA FETCHING ---
  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*').order('id', { ascending: false });
    if (data) setProducts(data);
  };

  const fetchOrders = async () => {
    const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (data) setOrders(data);
  };

  const fetchMyOrders = async (email) => {
    if (!email) return;
    const { data } = await supabase.from('orders').select('*').eq('customer_email', email).order('created_at', { ascending: false });
    if (data) setMyOrders(data);
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

  // --- ACTIONS ---
  const addToCart = (product, quantity = 1) => {
    const newItems = Array(quantity).fill(product);
    setCart([...cart, ...newItems]);
    setNotification(`${quantity}x ${product.name} added to bag!`);
    setTimeout(() => setNotification(null), 3000);
    setSelectedProduct(null);
  };

  const clearCart = () => {
    if (window.confirm("Are you sure you want to remove all items?")) setCart([]);
  };

  const getGroupedCart = () => {
    const grouped = {};
    cart.forEach(item => {
      if (!grouped[item.id]) grouped[item.id] = { ...item, quantity: 0 };
      grouped[item.id].quantity += 1;
    });
    return Object.values(grouped);
  };

  const handleOpenCart = () => {
    // NEW: Check if empty and show toast instead of alert
    if (cart.length === 0) {
      setNotification("Your cart is empty!");
      setTimeout(() => setNotification(null), 3000);
      return;
    }
    setView('cart');
  };
  // --- CHECKOUT ---
  const handleInputChange = (e) => setCustomerDetails({ ...customerDetails, [e.target.name]: e.target.value });

  const handleCheckout = async (e) => {
    e.preventDefault();
    const file = e.target.receipt.files[0];
    if (!file) return alert("Please upload receipt!");
    if (!customerDetails.email || !customerDetails.address) return alert("Fill all details!");

    setUploading(true);
    try {
      // 1. Upload Receipt
      const fileName = `${Date.now()}_${file.name}`;
      await supabase.storage.from('receipts').upload(fileName, file);
      const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(fileName);

      // 2. Create Order
      await supabase.from('orders').insert([{
        total: cart.reduce((sum, i) => sum + i.price, 0),
        items: cart,
        receipt_url: publicUrl,
        status: 'pending',
        customer_email: customerDetails.email,
        customer_address: customerDetails.address,
        customer_phone: customerDetails.phone
      }]);

      // 3. NEW: DEDUCT STOCK
      // We first calculate how many of each item is in the cart
      const quantities = {};
      cart.forEach(item => {
        quantities[item.id] = (quantities[item.id] || 0) + 1;
      });

      // Then we loop through and update the database for each product
      for (const [productId, count] of Object.entries(quantities)) {
        // Fetch current stock to be safe
        const { data: product } = await supabase.from('products').select('stock').eq('id', productId).single();
        if (product) {
          const newStock = Math.max(0, product.stock - count); // Ensure it doesn't go below 0
          await supabase.from('products').update({ stock: newStock }).eq('id', productId);
        }
      }

      // 4. Cleanup
      setNotification("Order sent! Stock updated.");
      setTimeout(() => setNotification(null), 3000);
      setCart([]);
      setCustomerDetails(prev => ({ ...prev, address: '', phone: '' }));
      setView('shop');

      // Refresh data so we see the new stock levels immediately
      fetchProducts();
      calculateSalesStats();
      if (session) fetchMyOrders(session.user.email);

    } catch (error) {
      alert(error.message);
    } finally {
      setUploading(false);
    }
  };

  // --- ADMIN ACTIONS ---
  const approveOrder = async (id) => {
    await supabase.from('orders').update({ status: 'approved' }).eq('id', id);
    fetchOrders(); calculateSalesStats();
  };
  const markDelivered = async (id) => {
    await supabase.from('orders').update({ status: 'delivered' }).eq('id', id);
    fetchOrders();
  };
  const handleAddProduct = async (e) => {
    e.preventDefault();
    const file = e.target.image.files[0];
    if (!file) return alert("Please upload a product image");
    setIsAdding(true);
    try {
      const fileName = `${Date.now()}_${file.name}`;
      await supabase.storage.from('products').upload(fileName, file);
      const { data: { publicUrl } } = supabase.storage.from('products').getPublicUrl(fileName);
      await supabase.from('products').insert([{ name: newProduct.name, price: parseFloat(newProduct.price), description: newProduct.desc, image_url: publicUrl }]);
      alert("Product Created!");
      setNewProduct({ name: '', price: '', desc: '' }); e.target.reset(); fetchProducts();
    } catch (error) { alert(error.message); } finally { setIsAdding(false); }
  };
  const deleteProduct = async (id) => {
    if (!window.confirm("Delete item?")) return;
    await supabase.from('products').delete().eq('id', id);
    fetchProducts();
  };

  // --- RENDER HELPERS ---
  // --- RENDER HELPERS ---
  const renderProductModal = () => {
    if (!selectedProduct) return null;
    return (
      <div className="modal-overlay" onClick={() => setSelectedProduct(null)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <button className="close-btn" onClick={() => setSelectedProduct(null)}><X size={20} /></button>
          <div className="modal-content-grid">
            <div className="modal-left" style={{ padding: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', background: '#f1f5f9' }}>
              <img src={selectedProduct.image_url} alt={selectedProduct.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div className="modal-right">
              <div>
                <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{selectedProduct.name}</h2>
                <span className="price" style={{ fontSize: '1.5rem' }}>RM{selectedProduct.price}</span>
                <p style={{ margin: '1.5rem 0', color: '#475569', lineHeight: '1.6' }}>{selectedProduct.description || "No description."}</p>

                {/* NEW: Stock Status in Modal */}
                <div style={{ marginBottom: '1rem' }}>
                  {selectedProduct.stock === 0 ? (
                    <span style={{ color: '#ef4444', fontWeight: 'bold', background: '#fee2e2', padding: '5px 10px', borderRadius: '4px' }}>Out of Stock</span>
                  ) : (
                    <span style={{ color: '#64748b', background: '#f1f5f9', padding: '5px 10px', borderRadius: '4px', fontSize: '0.9rem' }}>
                      Only {selectedProduct.stock} left in stock
                    </span>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 'auto' }}>
                <div className="qty-wrapper">
                  <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>Quantity:</span>
                  <div className="qty-control">
                    {/* Disable Minus if stock is 0 */}
                    <button onClick={() => setQty(q => Math.max(1, q - 1))} disabled={selectedProduct.stock === 0}>-</button>

                    <span>{selectedProduct.stock === 0 ? 0 : qty}</span>

                    {/* FIX: Prevent going above stock limit */}
                    <button
                      onClick={() => setQty(q => Math.min(selectedProduct.stock, q + 1))}
                      disabled={selectedProduct.stock === 0 || qty >= selectedProduct.stock}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* FIX: Disable Add to Cart if Out of Stock */}
                <button
                  onClick={() => addToCart(selectedProduct, qty)}
                  className="add-btn"
                  disabled={selectedProduct.stock === 0}
                  style={{
                    marginTop: '1rem',
                    padding: '1rem',
                    background: selectedProduct.stock === 0 ? '#cbd5e1' : '',
                    cursor: selectedProduct.stock === 0 ? 'not-allowed' : 'pointer'
                  }}
                >
                  {selectedProduct.stock === 0 ? 'Sold Out' : `Add To Cart - RM${(selectedProduct.price * qty).toFixed(2)}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderQRZoom = () => {
    if (!isQRExpanded) return null;
    return (
      <div className="modal-overlay" onClick={() => setIsQRExpanded(false)} style={{ zIndex: 2000 }}>
        <div className="modal" style={{ width: 'auto', height: 'auto', maxWidth: '90%', padding: '1.5rem', textAlign: 'center' }}>
          <h3 style={{ marginBottom: '1rem' }}>Scan to Pay</h3>
          {/* BIG IMAGE - Make sure /qr.jpg exists in public folder! */}
          <img
            src="/qr.jpg"
            alt="Big QR"
            style={{ width: '100%', maxWidth: '350px', height: 'auto', display: 'block', margin: '0 auto' }}
          />
          <p style={{ color: '#64748b', marginTop: '1rem' }}>Tap anywhere to close</p>
        </div>
      </div>
    );
  };

  // --- ADMIN: UPDATE STOCK ---
  const updateProductStock = async (productId, inputId) => {
    // 1. Grab the value from the specific input box
    const inputElement = document.getElementById(inputId);
    const newStock = parseInt(inputElement.value);

    // 2. Validation
    if (isNaN(newStock) || newStock < 0) {
      alert("Please enter a valid stock number");
      return;
    }

    try {
      // 3. Update Supabase
      const { error } = await supabase
        .from('products')
        .update({ stock: newStock })
        .eq('id', productId);

      if (error) throw error;

      // 4. Show Notification (Ensure this line runs!)
      setNotification(`Stock updated to ${newStock}!`);
      setTimeout(() => setNotification(null), 3000);

      // 5. Refresh Data
      await fetchProducts();

    } catch (error) {
      alert("Error updating stock: " + error.message);
    }
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0 }}>Your Cart</h2>
                {cart.length > 0 && <button onClick={clearCart} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.9rem', textDecoration: 'underline' }}>Clear All</button>}
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {getGroupedCart().map((item) => (
                  <div key={item.id} className="cart-item">
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>

                      {/* 1. Quantity Bubble */}
                      <span style={{ fontWeight: 'bold', background: '#e2e8f0', minWidth: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>
                        {item.quantity}
                      </span>

                      {/* 2. NEW: Product Image */}
                      <img
                        src={item.image_url}
                        alt={item.name}
                        style={{ width: '50px', height: '50px', borderRadius: '6px', objectFit: 'cover', border: '1px solid #e2e8f0' }}
                      />

                      {/* 3. Product Name */}
                      <span style={{ fontWeight: '500' }}>{item.name}</span>
                    </div>

                    {/* Price */}
                    <span style={{ fontWeight: '600' }}>RM{(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
                {cart.length === 0 && <p style={{ color: '#94a3b8', textAlign: 'center', marginTop: '2rem' }}>Your cart is empty.</p>}
              </div>
              <div className="total-row">Total: RM{cart.reduce((sum, i) => sum + i.price, 0).toFixed(2)}</div>
            </div>

            <div className="modal-right">
              {/* CHECK LOGIN STATUS */}
              {session ? (
                <form onSubmit={handleCheckout} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h3>Shipping Details</h3>
                  {/* LABEL: USERNAME */}
                  <label style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Name</label>
                  <input
                    name="username"
                    className="input-field"
                    placeholder="Name"
                    required
                    // NEW: Use full_name from Google metadata
                    value={session.user.user_metadata.full_name || session.user.email}
                    onChange={handleInputChange}

                    style={{ marginTop: '0.2rem' }}
                  />
                  <input name="phone" className="input-field" placeholder="Phone" onChange={handleInputChange} value={customerDetails.phone} required />
                  <textarea name="address" className="input-field" placeholder="Address" onChange={handleInputChange} value={customerDetails.address} required></textarea>

                  <div className="qr-container" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '1rem' }}>

                    {/* SMALL QR IMAGE - CLICK TO ZOOM */}
                    <img
                      src="/qr.jpg"
                      alt="Scan to pay"
                      className="qr-frame"
                      onClick={() => setIsQRExpanded(true)}
                      style={{
                        width: '80px',
                        height: '80px',
                        objectFit: 'contain',
                        margin: 0,
                        background: 'white',
                        cursor: 'zoom-in',
                        border: '1px solid #e2e8f0'
                      }}
                    />

                    <div><strong>Scan to Pay</strong><br /><span style={{ color: '#64748b', fontSize: '0.9rem' }}>Account Name: RAJA AHMAD SHUKRI BIN RAJA AHMAD KAHAR</span></div>
                  </div>

                  {/* CUSTOM FILE UPLOAD */}
                  <div className="file-upload-wrapper">
                    <label htmlFor="receipt-upload" className="file-upload-label">
                      <Upload size={18} />
                      {fileName ? fileName : "Upload Receipt"}
                    </label>
                    <input
                      id="receipt-upload"
                      type="file"
                      name="receipt"
                      accept="image/*"
                      required
                      onChange={(e) => setFileName(e.target.files[0]?.name || "")}
                      style={{ display: 'none' }} // Hide the ugly default input
                    />
                  </div>                  <button type="submit" className="checkout-btn" disabled={uploading}>{uploading ? 'Processing...' : 'Complete Order'} <Upload size={18} /></button>
                </form>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', gap: '1.5rem' }}>
                  <div style={{ background: '#f1f5f9', padding: '1.5rem', borderRadius: '50%' }}>
                    <User size={48} color="#94a3b8" />
                  </div>
                  <div>
                    <h3>Login Required</h3>
                    <p style={{ color: '#64748b', maxWidth: '250px', margin: '0.5rem auto' }}>
                      You must be logged in to place an order.
                    </p>
                  </div>
                  <button className="checkout-btn" onClick={handleGoogleLogin} style={{ background: 'white', color: '#1e293b', border: '1px solid #cbd5e1' }}>
                    <img src="https://www.google.com/favicon.ico" alt="G" style={{ width: '18px' }} />
                    Sign in with Google
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Render Zoom Helper inside Cart View or outside (if Cart is a modal, keep it outside) */}
        {renderQRZoom()}
      </div>
    );
  }

  // 2. CUSTOMER ORDERS VIEW
  if (view === 'customer_orders') {
    return (
      <div className="App">
        <nav className="navbar">
          <div
            className="logo"
            onClick={() => setView('shop')}
            style={{
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',  // Space between logo and text
              fontSize: '1.5rem',
              fontWeight: 'bold'
            }}
          >
            {/* LOGO IMAGE */}
            <img
              src={logo}
              alt="ShoShop Logo"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                objectFit: 'cover'
              }}
            />
            ShoShops
          </div>          <div className="nav-actions">
            <button className="icon-btn" onClick={() => setView('shop')}>Back to Shop</button>
          </div>
        </nav>
        <div className="container">
          <h2>My Order History</h2>
          <div className="orders-list">
            {myOrders.length === 0 && <p style={{ color: '#64748b' }}>You haven't placed any orders yet.</p>}
            {myOrders.map(order => (
              <div key={order.id} className={`order-card ${order.status}`} style={{ alignItems: 'center' }}>
                <div style={{ minWidth: '80px' }}>
                  <strong>#{order.id}</strong><br />
                  <span className={`status-badge ${order.status}`}>{order.status}</span>
                </div>
                <div style={{ flex: 1, margin: '0 1rem' }}>
                  <strong>Items:</strong> {order.items?.map(i => i.name).join(', ')}<br />
                  <span style={{ color: '#64748b', fontSize: '0.9rem' }}>Ordered on {new Date(order.created_at).toLocaleDateString()}</span>
                </div>
                <div style={{ fontWeight: 'bold', color: '#7c3aed' }}>RM{order.total}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 3. ADMIN VIEW
  if (view === 'admin') {
    if (!session || session.user.email !== SELLER_EMAIL) {
      return (
        <div className="modal-overlay">
          <div className="modal" style={{ height: 'auto', padding: '3rem', textAlign: 'center' }}>
            <ShieldCheck size={48} style={{ color: '#ef4444', margin: '0 auto 1rem' }} />
            <h2>Access Denied</h2>
            <p style={{ color: '#64748b' }}>You are logged in as <strong>{session?.user.email}</strong>, but you do not have permission to view the Seller Dashboard.</p>
            <button onClick={() => setView('shop')} className="add-btn" style={{ marginTop: '1rem' }}>Return to Shop</button>
          </div>
        </div>
      );
    }

    return (
      <div className="App">
        <nav className="navbar" style={{ background: '#1e293b', color: 'white' }}>

          {/* ADMIN LOGO SECTION */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: 'bold' }}>
            <img
              src={logo}
              alt="Logo"
              style={{ width: '35px', height: '35px', borderRadius: '6px' }}
            />
            Seller Dashboard
          </div>

          <div className="nav-actions">
            <span style={{ fontSize: '0.9rem', color: '#cbd5e1', alignSelf: 'center' }}>{session.user.email}</span>
            <button className="icon-btn" style={{ background: '#334155', color: 'white' }} onClick={() => setView('shop')}>Exit Admin</button>
          </div>
        </nav>
        <div className="container">
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
            <button onClick={() => setAdminTab('orders')} className={`icon-btn ${adminTab === 'orders' ? 'active-tab' : ''}`} style={{ flex: 1, justifyContent: 'center' }}>
              <Package size={18} /> Orders ({orders.length})
            </button>
            <button onClick={() => setAdminTab('products')} className={`icon-btn ${adminTab === 'products' ? 'active-tab' : ''}`} style={{ flex: 1, justifyContent: 'center' }}>
              <ShoppingBag size={18} /> Manage Products
            </button>
          </div>

          {adminTab === 'orders' && (
            <div className="orders-list">
              <button onClick={fetchOrders} className="icon-btn" style={{ marginBottom: '1rem' }}>Refresh List</button>
              {orders.map(order => (
                <div key={order.id} className={`order-card ${order.status}`}>
                  <div style={{ minWidth: '100px' }}><strong>#{order.id}</strong><br /><span className={`status-badge ${order.status}`}>{order.status}</span></div>
                  <div style={{ flex: 1, margin: '0 1.5rem' }}>
                    <div style={{ marginBottom: '8px' }}><strong>Items:</strong> {order.items?.map(i => i.name).join(', ')} <span style={{ marginLeft: '10px', color: '#7c3aed', fontWeight: 'bold' }}>(RM{order.total})</span></div>
                    {(order.customer_email) && <div style={{ background: '#f1f5f9', padding: '10px', borderRadius: '8px', fontSize: '0.85rem' }}>📧 {order.customer_email} • 📞 {order.customer_phone}<br />🏠 {order.customer_address}</div>}
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

          {adminTab === 'products' && (
            <div className="admin-products">
              <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                <h3>Add New Product</h3>
                <form onSubmit={handleAddProduct} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <input placeholder="Name" className="input-field" required value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} />
                  <input type="number" placeholder="Price (RM)" className="input-field" required value={newProduct.price} onChange={e => setNewProduct({ ...newProduct, price: e.target.value })} />
                  <input placeholder="Desc" className="input-field" style={{ gridColumn: 'span 2' }} required value={newProduct.desc} onChange={e => setNewProduct({ ...newProduct, desc: e.target.value })} />
                  <div style={{ gridColumn: 'span 2' }}><label>Image:</label><input type="file" name="image" accept="image/*" required style={{ width: '100%', marginTop: '5px' }} /></div>
                  <button type="submit" className="add-btn" style={{ gridColumn: 'span 2' }} disabled={isAdding}>{isAdding ? 'Uploading...' : 'Create'} <Plus size={18} /></button>
                </form>
              </div>
              <div className="product-list-admin">
                {products.map(p => (
                  <div key={p.id} className="cart-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

                    {/* Image & Name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <img src={p.image_url} alt={p.name} style={{ width: '50px', height: '50px', borderRadius: '4px', objectFit: 'cover' }} />
                      <div>
                        <strong>{p.name}</strong>
                        <div style={{ color: '#64748b', fontSize: '0.9rem' }}>RM{p.price.toFixed(2)}</div>
                      </div>
                    </div>

                    {/* Stock Control with SAVE BUTTON */}
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>

                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', marginBottom: '2px' }}>Stock</label>
                        <input
                          id={`stock-input-${p.id}`}
                          type="number"
                          defaultValue={p.stock}
                          className="input-field"
                          style={{ width: '60px', padding: '6px', textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                        />
                      </div>

                      {/* Blue Check Button */}
                      <button
                        onClick={() => updateProductStock(p.id, `stock-input-${p.id}`)}
                        className="icon-btn"
                        title="Save Stock"
                        style={{ background: '#dbeafe', color: '#2563eb', borderColor: '#bfdbfe', height: '38px', width: '38px', padding: 0, justifyContent: 'center' }}
                      >
                        <Check size={18} />
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={() => deleteProduct(p.id)}
                        className="icon-btn"
                        style={{ color: '#ef4444', borderColor: '#fee2e2', background: '#fef2f2', height: '38px', width: '38px', padding: 0, justifyContent: 'center' }}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* --- CRITICAL: NOTIFICATION TOAST ADDED HERE --- */}
        {notification && (
          <div className="notification-toast" style={{ background: '#22c55e' }}>
            <Check size={16} /> {notification}
          </div>
        )}

      </div>
    );
  }
  // --- MAIN SHOP VIEW ---
  return (
    <div className="App">
      <nav className="navbar">
        <div
          className="logo"
          onClick={() => setView('shop')}
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '1.5rem'
          }}
        >
          <img
            src="/shoshop.png"
            alt="ShoShop"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              objectFit: 'cover'
            }}
          />
          ShoShop
        </div>        <div className="nav-actions">
          {!session && (
            <button className="icon-btn" onClick={handleGoogleLogin}>
              <User size={18} /> Login
            </button>
          )}

          {session && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* 1. NEW: Show Google Display Name */}
              <span className="user-email" style={{ fontSize: '0.9rem', fontWeight: '600', color: '#475569', marginRight: '5px' }}>
                {/* Try to get full name, otherwise fallback to email */}
                {session.user.user_metadata.full_name || session.user.email}
              </span>

              {session.user.email === SELLER_EMAIL && (
                <button className="icon-btn" onClick={() => { setView('admin'); fetchOrders(); setAdminTab('orders'); }}>
                  <ShieldCheck size={18} />
                </button>
              )}

              <button className="icon-btn" onClick={() => setView('customer_orders')}>
                <History size={18} />
              </button>

              <button className="icon-btn" style={{ borderColor: '#ef4444', color: '#ef4444' }} onClick={handleLogout}>
                <LogOut size={18} />
              </button>
            </div>
          )}

          <button className="icon-btn" onClick={handleOpenCart}>
            <ShoppingBag size={18} /> <span>Cart ({cart.length})</span>
          </button>
        </div>
      </nav>
      <div className="container">
        {loading ? <div className="loading"><Loader2 className="spin" /> Loading...</div> : (
          <div className="product-grid">
            {products.map((product) => (
              <div key={product.id} className="card" onClick={() => { setSelectedProduct(product); setQty(1); }} style={{ cursor: 'pointer', opacity: product.stock === 0 ? 0.7 : 1 }}>

                <img src={product.image_url} alt={product.name} className="card-img" />

                <div className="card-body">
                  <h3>{product.name}</h3>

                  <div className="sales-info">
                    <span className="price">RM{product.price}</span>

                    {/* NEW: Stock Logic */}
                    {product.stock === 0 ? (
                      <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>Out of Stock</span>
                    ) : (
                      <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{product.stock} left</span>
                    )}
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); addToCart(product); }}
                    className="add-btn"
                    disabled={product.stock === 0} // <--- Disable if 0
                    style={{ background: product.stock === 0 ? '#cbd5e1' : '', cursor: product.stock === 0 ? 'not-allowed' : 'pointer' }}
                  >
                    {product.stock === 0 ? 'Sold Out' : 'Add to Cart'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {notification && <div className="notification-toast"><Check size={16} /> {notification}</div>}
      {renderProductModal()}

      {/* Zoom Helper Component rendered here as well */}
      {renderQRZoom()}
    </div>
  );
}

export default App;