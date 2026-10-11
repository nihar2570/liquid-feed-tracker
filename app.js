import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyABS_RwxXguaFCZ_GL6RZVPNL-kQknDA2k", 
  authDomain: "feeds-23adf.firebaseapp.com", 
  projectId: "feeds-23adf", 
  storageBucket: "feeds-23adf.firebasestorage.app", 
  messagingSenderId: "931523195597", 
  appId: "1:931523195597:web:9924233f8ddbef67a5af84", 
  measurementId: "G-B8GDCY6FJT" 
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let chartInstance = null;
let editingId = null; // Tracks the ID of the log being edited

// Pre-fill datetime input with current local time
const setTimeInputToNow = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('feed-time').value = now.toISOString().slice(0, 16);
};
setTimeInputToNow();

// Listen for Feed Updates
const q = query(collection(db, 'feeds'), orderBy('timestamp', 'desc'));
onSnapshot(q, (snapshot) => {
  const logsContainer = document.getElementById('logs-container');
  logsContainer.innerHTML = '';
  let todayTotal = 0;
  const todayStr = new Date().toLocaleDateString();
  const feedsData = [];

  snapshot.forEach((firebaseDoc) => {
    const data = firebaseDoc.data();
    const docId = firebaseDoc.id; // Get the unique document ID
    feedsData.push(data);
    
    const feedDate = new Date(data.timestamp);
    if (feedDate.toLocaleDateString() === todayStr) {
      todayTotal += Number(data.amount);
    }

    const div = document.createElement('div');
    div.className = 'log-item';
    div.innerHTML = `
      <div>
        <div class="log-time">${feedDate.toLocaleDateString()} ${feedDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
        <div class="log-amount">${data.amount} ml</div>
      </div>
      <button class="edit-btn" data-id="${docId}" data-time="${data.timestamp}" data-amount="${data.amount}">Edit</button>
    `;
    logsContainer.appendChild(div);
  });

  if (snapshot.empty) logsContainer.innerHTML = '<p style="color: gray;">No feeds yet.</p>';
  document.getElementById('today-total').innerText = `${todayTotal} ml`;
  
  updateChart(feedsData);
});

// Handle Edit Button Clicks (Event Delegation)
document.getElementById('logs-container').addEventListener('click', (e) => {
  if (e.target.classList.contains('edit-btn')) {
    const id = e.target.getAttribute('data-id');
    const time = e.target.getAttribute('data-time');
    const amount = e.target.getAttribute('data-amount');
    
    // Populate the form inputs
    document.getElementById('feed-time').value = new Date(time).toISOString().slice(0, 16);
    document.getElementById('feed-amount').value = amount;
    
    // Set edit state and update UI
    editingId = id;
    const btn = document.getElementById('add-btn');
    btn.innerText = 'Update Feed';
    btn.style.background = 'linear-gradient(135deg, #34C759 0%, #28a745 100%)'; // iOS Green
    btn.style.boxShadow = '0 6px 16px rgba(52, 199, 89, 0.3)';
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

// Add or Update Feed
document.getElementById('add-btn').addEventListener('click', async () => {
  const time = document.getElementById('feed-time').value;
  const amount = document.getElementById('feed-amount').value;

  if (!time || !amount) return alert('Enter time and amount');

  const btn = document.getElementById('add-btn');
  btn.innerText = 'Saving...';

  try {
    if (editingId) {
      // Update existing document
      const docRef = doc(db, 'feeds', editingId);
      await updateDoc(docRef, {
        timestamp: new Date(time).toISOString(),
        amount: Number(amount)
      });
      
      // Reset Edit State
      editingId = null;
      btn.innerText = 'Add Feed';
      btn.style.background = ''; // Resets to default CSS blue
      btn.style.boxShadow = '';
    } else {
      // Create new document
      await addDoc(collection(db, 'feeds'), {
        timestamp: new Date(time).toISOString(),
        amount: Number(amount)
      });
      btn.innerText = 'Add Feed';
    }

    document.getElementById('feed-amount').value = '';
    setTimeInputToNow();
  } catch (error) {
    console.error("Error saving document: ", error);
    alert("Failed to save. Check console.");
    btn.innerText = editingId ? 'Update Feed' : 'Add Feed';
  }
});

// Update Trends Chart
function updateChart(feeds) {
  const ctx = document.getElementById('trendsChart');
  if (!ctx) return;

  const dailyTotals = {};
  feeds.forEach(f => {
    const date = new Date(f.timestamp).toLocaleDateString();
    dailyTotals[date] = (dailyTotals[date] || 0) + f.amount;
  });

  const labels = Object.keys(dailyTotals).slice(0, 7).reverse();
  const data = Object.values(dailyTotals).slice(0, 7).reverse();

  if (chartInstance) chartInstance.destroy();
  
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Daily Total (ml)',
        data: data,
        backgroundColor: '#007AFF',
        borderRadius: 4
      }]
    },
    options: { responsive: true }
  });
}