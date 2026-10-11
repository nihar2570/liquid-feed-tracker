import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
let editingId = null;
let allFeedsData = [];
let currentChartDays = 7;

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
  allFeedsData = [];

  snapshot.forEach((firebaseDoc) => {
    const data = firebaseDoc.data();
    const docId = firebaseDoc.id;
    allFeedsData.push({ id: docId, ...data });
    
    const feedDate = new Date(data.timestamp);
    if (feedDate.toLocaleDateString() === todayStr) {
      todayTotal += Number(data.amount);
    }

    const div = document.createElement('div');
    div.className = 'log-item';
    div.innerHTML = `
      <div>
        <div class="log-time">${feedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} at ${feedDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
        <div class="log-amount">${data.amount} ml</div>
      </div>
      <button class="edit-btn" data-id="${docId}" data-time="${data.timestamp}" data-amount="${data.amount}">Edit</button>
    `;
    logsContainer.appendChild(div);
  });

  if (snapshot.empty) logsContainer.innerHTML = '<p style="color: gray;">No feeds yet.</p>';
  document.getElementById('today-total').innerText = `${todayTotal} ml`;
  
  updateChart();
});

// Handle Edit
document.getElementById('logs-container').addEventListener('click', (e) => {
  if (e.target.classList.contains('edit-btn')) {
    const id = e.target.getAttribute('data-id');
    const time = e.target.getAttribute('data-time');
    const amount = e.target.getAttribute('data-amount');
    
    document.getElementById('feed-time').value = new Date(time).toISOString().slice(0, 16);
    document.getElementById('feed-amount').value = amount;
    
    editingId = id;
    const btn = document.getElementById('add-btn');
    btn.innerText = 'Update Feed (Set 0 to Delete)';
    btn.style.background = 'linear-gradient(135deg, #34C759 0%, #28a745 100%)';
    btn.style.boxShadow = '0 6px 16px rgba(52, 199, 89, 0.3)';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

// Add, Update, or Delete Feed
document.getElementById('add-btn').addEventListener('click', async () => {
  const time = document.getElementById('feed-time').value;
  const amount = Number(document.getElementById('feed-amount').value);

  if (!time || isNaN(amount)) return alert('Enter valid time and amount');

  const btn = document.getElementById('add-btn');
  btn.innerText = 'Saving...';

  try {
    if (amount === 0) {
      if (editingId) {
        await deleteDoc(doc(db, 'feeds', editingId));
      } else {
        alert("Amount must be greater than 0");
      }
    } else if (editingId) {
      await updateDoc(doc(db, 'feeds', editingId), {
        timestamp: new Date(time).toISOString(),
        amount: amount
      });
    } else {
      await addDoc(collection(db, 'feeds'), {
        timestamp: new Date(time).toISOString(),
        amount: amount
      });
    }

    // Reset state
    editingId = null;
    btn.innerText = 'Add Feed';
    btn.style.background = '';
    btn.style.boxShadow = '';
    document.getElementById('feed-amount').value = '';
    setTimeInputToNow();

  } catch (error) {
    console.error("Error saving document: ", error);
    alert("Failed to save. Check console.");
    btn.innerText = editingId ? 'Update Feed' : 'Add Feed';
  }
});

// Timeframe Controls
document.getElementById('timeframe-controls').addEventListener('click', (e) => {
  if (e.target.classList.contains('segment-btn')) {
    document.querySelectorAll('.segment-btn').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
    currentChartDays = Number(e.target.getAttribute('data-days'));
    updateChart();
  }
});

// Advanced Charting
function updateChart() {
  const ctx = document.getElementById('trendsChart');
  if (!ctx || allFeedsData.length === 0) return;

  const today = new Date();
  const dailyMap = {};
  
  // Generate contiguous dates for the selected timeframe
  for (let i = currentChartDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('en-US'); 
    const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); 
    dailyMap[key] = { label, amount: 0 };
  }

  // Populate data
  allFeedsData.forEach(f => {
    const fd = new Date(f.timestamp);
    const key = fd.toLocaleDateString('en-US');
    if (dailyMap[key] !== undefined) {
      dailyMap[key].amount += f.amount;
    }
  });

  const labels = [];
  const barData = [];
  let totalForPeriod = 0;

  Object.values(dailyMap).forEach(day => {
    labels.push(day.label);
    barData.push(day.amount);
    totalForPeriod += day.amount;
  });

  const avg = Math.round(totalForPeriod / currentChartDays);
  const lineData = labels.map(() => avg);

  if (chartInstance) chartInstance.destroy();
  
  chartInstance = new Chart(ctx, {
    data: {
      labels: labels,
      datasets: [
        {
          type: 'line',
          label: 'Average',
          data: lineData,
          borderColor: '#FF9500', // iOS Orange for contrast
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false,
          order: 1
        },
        {
          type: 'bar',
          label: 'Daily Total (ml)',
          data: barData,
          backgroundColor: '#007AFF',
          borderRadius: 6,
          order: 2
        }
      ]
    },
    options: { 
      responsive: true,
      maintainAspectRatio: false, 
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
        }
      },
      scales: {
        x: { 
          grid: { display: false } 
        },
        y: { 
          beginAtZero: true,
          grid: { display: false },
          border: { display: false }
        }
      }
    }
  });
}