import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { initializeFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyABS_RwxXguaFCZ_GL6RZVPNL-kQknDA2k",
  authDomain: "feeds-23adf.firebaseapp.com",
  projectId: "feeds-23adf",
  storageBucket: "feeds-23adf.firebasestorage.app",
  messagingSenderId: "931523195597",
  appId: "1:931523195597:web:9924233f8ddbef67a5af84"
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true
});
let chartInstance = null;
let editingId = null;
let allFeedsData = [];
let currentChartDays = 7;
const DAILY_GOAL = 700; // Change this to your daily target
let timerInterval = null;
let mostRecentFeedTime = null;

// Preset Users & Auth Logic
const PRESET_USERS = {
  'nihar':   { name: 'Nihar',   pass: 'Hyder@123' },
  'narmada': { name: 'Narmada', pass: 'Hyder@1234' },
  'guest':   { name: 'Guest',   pass: 'Guest@123' }
};

let currentUser = localStorage.getItem('feedUser') || null;
const loginOverlay = document.getElementById('login-overlay');
const userBtn = document.getElementById('user-btn');
const loginUserEl = document.getElementById('login-user');
const loginPassEl = document.getElementById('login-pass');
const loginErrorEl = document.getElementById('login-error');

const updateAuthUI = () => {
  if (currentUser) {
    loginOverlay.style.display = 'none';
    userBtn.innerText = `👤 ${currentUser}`;
  } else {
    loginOverlay.style.display = 'flex';
    userBtn.innerText = '👤 --';
  }
};
updateAuthUI();

const handleLogin = () => {
  const rawUser = loginUserEl.value.trim().toLowerCase();
  const rawPass = loginPassEl.value;
  const matched = PRESET_USERS[rawUser];

  if (matched && matched.pass === rawPass) {
    currentUser = matched.name;
    localStorage.setItem('feedUser', currentUser);
    loginUserEl.value = '';
    loginPassEl.value = '';
    loginErrorEl.innerText = '';
    updateAuthUI();
  } else {
    loginErrorEl.innerText = 'Invalid user ID or password';
  }
};

document.getElementById('login-btn').addEventListener('click', handleLogin);
loginPassEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleLogin();
});

userBtn.addEventListener('click', () => {
  if (confirm(`Signed in as ${currentUser}. Switch user / log out?`)) {
    currentUser = null;
    localStorage.removeItem('feedUser');
    updateAuthUI();
  }
});

// Theme Toggle Logic
const themeBtn = document.getElementById('theme-btn');
const initTheme = () => {
  const saved = localStorage.getItem('theme');
  
  // Only activate dark mode if the user explicitly saved it previously
  if (saved === 'dark') {
    document.body.classList.add('dark-mode');
    themeBtn.innerText = '☀️';
  } else {
    document.body.classList.remove('dark-mode');
    themeBtn.innerText = '🌙';
  }
};
initTheme();

themeBtn.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  themeBtn.innerText = isDark ? '☀️' : '🌙';
  updateChart(); // Redraw chart to update colors
});

const setTimeInputToNow = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('feed-time').value = now.toISOString().slice(0, 16);
};
setTimeInputToNow();

// Timer Function
const updateTimeSinceLastFeed = () => {
  const el = document.getElementById('last-feed-info');
  if (!mostRecentFeedTime) {
    el.innerText = 'No feeds yet';
    return;
  }
  const diffMs = new Date() - new Date(mostRecentFeedTime);
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  el.innerText = `Last fed: ${diffHrs > 0 ? diffHrs + 'h ' : ''}${diffMins}m ago`;
};

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

    const metaParts = [];
    if (data.addedBy) metaParts.push(`Added by ${data.addedBy}`);
    if (data.editedBy) metaParts.push(`Edited by ${data.editedBy}`);
    const metaHtml = metaParts.length > 0 ? `<div class="log-meta">${metaParts.join(' • ')}</div>` : '';

    const div = document.createElement('div');
    div.className = 'log-item';
    div.innerHTML = `
      <div>
        <div class="log-time">${feedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} at ${feedDate.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'})}</div>
        <div class="log-amount">${data.amount} ml</div>
        ${metaHtml}
      </div>
      <button class="edit-btn" data-id="${docId}" data-time="${data.timestamp}" data-amount="${data.amount}">Edit</button>
    `;
    logsContainer.appendChild(div);
  });

  if (snapshot.empty) logsContainer.innerHTML = '<p style="color: var(--ios-text-muted);">No feeds yet.</p>';
  
  // Update Today Total & Progress Bar
  document.getElementById('today-total').innerText = `${todayTotal} ml`;
  const progressPercent = Math.min((todayTotal / DAILY_GOAL) * 100, 100);
  document.getElementById('progress-fill').style.width = `${progressPercent}%`;

  // Start/Update Timer
  if (allFeedsData.length > 0) {
    mostRecentFeedTime = allFeedsData[0].timestamp; // Firebase orders by timestamp desc
    updateTimeSinceLastFeed();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimeSinceLastFeed, 60000);
  }

  updateChart();
});

// Handle Edit
document.getElementById('logs-container').addEventListener('click', (e) => {
  if (e.target.classList.contains('edit-btn')) {
    const id = e.target.getAttribute('data-id');
    const time = e.target.getAttribute('data-time');
    const amount = e.target.getAttribute('data-amount');
    
    const d = new Date(time);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    document.getElementById('feed-time').value = d.toISOString().slice(0, 16);
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
  if (!currentUser) {
    updateAuthUI();
    return;
  }

  const time = document.getElementById('feed-time').value;
  const amount = Number(document.getElementById('feed-amount').value);

  if (!time || isNaN(amount)) return alert('Enter valid time and amount');

  const btn = document.getElementById('add-btn');
  btn.innerText = 'Saving...';

  try {
    if (amount === 0) {
      if (editingId) await deleteDoc(doc(db, 'feeds', editingId));
      else alert("Amount must be greater than 0");
    } else if (editingId) {
      await updateDoc(doc(db, 'feeds', editingId), {
        timestamp: new Date(time).toISOString(),
        amount: amount,
        editedBy: currentUser
      });
    } else {
      await addDoc(collection(db, 'feeds'), {
        timestamp: new Date(time).toISOString(),
        amount: amount,
        addedBy: currentUser
      });
    }

    editingId = null;
    btn.innerText = 'Add Feed';
    btn.style.background = '';
    btn.style.boxShadow = '';
    document.getElementById('feed-amount').value = '';
    setTimeInputToNow();

  } catch (error) {
    console.error("Error: ", error);
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
  
  for (let i = currentChartDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('en-US'); 
    const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); 
    dailyMap[key] = { label, amount: 0 };
  }

  allFeedsData.forEach(f => {
    const fd = new Date(f.timestamp);
    const key = fd.toLocaleDateString('en-US');
    if (dailyMap[key] !== undefined) dailyMap[key].amount += f.amount;
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

  // Detect Active Theme for Chart Colors
  const isDarkMode = document.body.classList.contains('dark-mode');
  const chartTextColor = isDarkMode ? 'rgba(235, 235, 245, 0.6)' : '#8E8E93';
  const barColor = isDarkMode ? '#FF9500' : '#007AFF';
  const lineColor = isDarkMode ? '#FFFFFF' : '#FF9500';

  if (chartInstance) chartInstance.destroy();
  
  chartInstance = new Chart(ctx, {
    data: {
      labels: labels,
      datasets: [
        { type: 'line', label: 'Average', data: lineData, borderColor: lineColor, borderWidth: 2, borderDash: [5, 5], pointRadius: 0, fill: false, order: 1 },
        { type: 'bar', label: 'Daily Total (ml)', data: barData, backgroundColor: barColor, borderRadius: 6, order: 2 }
      ]
    },
    options: { 
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: chartTextColor } },
        y: { beginAtZero: true, grid: { display: false }, border: { display: false }, ticks: { color: chartTextColor } }
      }
    }
  });
}