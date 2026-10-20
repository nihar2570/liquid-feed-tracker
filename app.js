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

// Feature #1: "Now" Button & Auto-Refresh on Wake
document.getElementById('now-btn').addEventListener('click', setTimeInputToNow);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !editingId) {
    setTimeInputToNow();
    refreshTimers();
  }
});

// Feature: Quick Clear (×) Button for Amount Input
const feedAmountInput = document.getElementById('feed-amount');
const clearAmountBtn = document.getElementById('clear-amount-btn');

const updateClearBtnVisibility = () => {
  if (clearAmountBtn) {
    clearAmountBtn.style.display = feedAmountInput.value ? 'flex' : 'none';
  }
};

feedAmountInput.addEventListener('input', updateClearBtnVisibility);
if (clearAmountBtn) {
  clearAmountBtn.addEventListener('click', () => {
    feedAmountInput.value = '';
    updateClearBtnVisibility();
    feedAmountInput.focus();
  });
}

// Feature #1: Quick-Tap ml Chips & Steppers
document.getElementById('quick-chips').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip-btn');
  if (!btn) return;
  const amountInput = document.getElementById('feed-amount');
  if (btn.hasAttribute('data-set')) {
    amountInput.value = btn.getAttribute('data-set');
  } else if (btn.hasAttribute('data-delta')) {
    const delta = Number(btn.getAttribute('data-delta'));
    const current = Number(amountInput.value) || 0;
    amountInput.value = Math.max(0, current + delta);
  }
  updateClearBtnVisibility();
});

// Day Elapsed & Timer Functions
const updateDayElapsed = () => {
  const el = document.getElementById('day-elapsed');
  if (!el) return;
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msElapsed = now - startOfDay;
  const msInDay = 24 * 60 * 60 * 1000;
  const dayPercent = Math.min(100, Math.max(0, Math.round((msElapsed / msInDay) * 100)));
  el.innerText = `(${dayPercent}% of day completed)`;
};
updateDayElapsed();

const refreshTimers = () => {
  updateTimeSinceLastFeed();
  updateDayElapsed();
};

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

const collapsedDays = new Set();

const getDayLabel = (feedDate) => {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (feedDate.toLocaleDateString() === today.toLocaleDateString()) return 'Today';
  if (feedDate.toLocaleDateString() === yesterday.toLocaleDateString()) return 'Yesterday';
  return feedDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

// Listen for Feed Updates
const q = query(collection(db, 'feeds'), orderBy('timestamp', 'desc'));
onSnapshot(q, (snapshot) => {
  const logsContainer = document.getElementById('logs-container');
  logsContainer.innerHTML = '';
  let todayTotal = 0;
  const todayStr = new Date().toLocaleDateString();
  allFeedsData = [];

  const dayGroups = new Map();

  snapshot.forEach((firebaseDoc) => {
    const data = firebaseDoc.data();
    const docId = firebaseDoc.id;
    allFeedsData.push({ id: docId, ...data });
    
    const feedDate = new Date(data.timestamp);
    const dayKey = feedDate.toLocaleDateString('en-US');
    const amountNum = Number(data.amount) || 0;

    if (feedDate.toLocaleDateString() === todayStr) {
      todayTotal += amountNum;
    }

    if (!dayGroups.has(dayKey)) {
      dayGroups.set(dayKey, {
        label: getDayLabel(feedDate),
        totalMl: 0,
        items: []
      });
    }
    const group = dayGroups.get(dayKey);
    group.totalMl += amountNum;
    group.items.push({ docId, data, feedDate });
  });

  if (snapshot.empty) {
    logsContainer.innerHTML = '<div class="ios-card"><p style="color: var(--ios-text-muted); margin: 0;">No feeds yet.</p></div>';
  } else {
    dayGroups.forEach((group, dayKey) => {
      const card = document.createElement('div');
      card.className = `ios-card day-group-card${collapsedDays.has(dayKey) ? ' collapsed' : ''}`;
      card.setAttribute('data-day', dayKey);

      const feedWord = group.items.length === 1 ? 'feed' : 'feeds';
      const itemsHtml = group.items.map(({ docId, data, feedDate }) => {
        const metaParts = [];
        if (data.addedBy) metaParts.push(`Added by ${data.addedBy}`);
        if (data.editedBy) metaParts.push(`Edited by ${data.editedBy}`);
        const metaHtml = metaParts.length > 0 ? `<div class="log-meta">${metaParts.join(' • ')}</div>` : '';

        return `
          <div class="log-item">
            <div>
              <div class="log-time">${feedDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
              <div class="log-amount">${data.amount} ml</div>
              ${metaHtml}
            </div>
            <button class="edit-btn" data-id="${docId}" data-time="${data.timestamp}" data-amount="${data.amount}">Edit</button>
          </div>
        `;
      }).join('');

      card.innerHTML = `
        <div class="day-header">
          <div class="day-title"><span class="day-chevron">▼</span> ${group.label}</div>
          <div class="day-summary">${group.totalMl} ml <span>• ${group.items.length} ${feedWord}</span></div>
        </div>
        <div class="day-logs">${itemsHtml}</div>
      `;
      logsContainer.appendChild(card);
    });
  }
  
  // Update Today Total & Progress Bar
  document.getElementById('today-total').innerText = `${todayTotal} ml`;
  const progressRatio = (todayTotal / DAILY_GOAL) * 100;
  const progressPercent = Math.min(progressRatio, 100);
  document.getElementById('progress-fill').style.width = `${progressPercent}%`;

  const percentEl = document.getElementById('progress-percent');
  const remainingEl = document.getElementById('progress-remaining');
  if (percentEl && remainingEl) {
    percentEl.innerText = `${Math.round(progressRatio)}%`;
    const remainingMl = DAILY_GOAL - todayTotal;
    if (remainingMl <= 0) {
      remainingEl.innerText = `Goal reached! 🎉 (+${Math.abs(remainingMl)} ml)`;
    } else {
      remainingEl.innerText = `${remainingMl} ml left`;
    }
  }

  // Start/Update Timer
  if (allFeedsData.length > 0) {
    mostRecentFeedTime = allFeedsData[0].timestamp; // Firebase orders by timestamp desc
  } else {
    mostRecentFeedTime = null;
  }
  refreshTimers();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(refreshTimers, 60000);

  updateChart();
});

// Feature #3: Helper to Reset Edit State
const exitEditMode = () => {
  editingId = null;
  const btn = document.getElementById('add-btn');
  btn.innerText = 'Add Feed';
  btn.style.background = '';
  btn.style.boxShadow = '';
  document.getElementById('edit-actions').style.display = 'none';
  document.getElementById('feed-amount').value = '';
  updateClearBtnVisibility();
  setTimeInputToNow();
};

document.getElementById('cancel-edit-btn').addEventListener('click', exitEditMode);

document.getElementById('delete-feed-btn').addEventListener('click', async () => {
  if (!editingId) return;
  if (!currentUser) {
    updateAuthUI();
    return;
  }
  if (!confirm('Delete this feed log?')) return;

  try {
    await deleteDoc(doc(db, 'feeds', editingId));
    exitEditMode();
  } catch (error) {
    console.error('Error deleting feed:', error);
  }
});

// Handle Edit & Day Group Collapse/Expand
document.getElementById('logs-container').addEventListener('click', (e) => {
  const dayHeader = e.target.closest('.day-header');
  if (dayHeader) {
    const card = dayHeader.closest('.day-group-card');
    const dayKey = card.getAttribute('data-day');
    card.classList.toggle('collapsed');
    if (card.classList.contains('collapsed')) {
      collapsedDays.add(dayKey);
    } else {
      collapsedDays.delete(dayKey);
    }
    return;
  }

  if (e.target.classList.contains('edit-btn')) {
    const id = e.target.getAttribute('data-id');
    const time = e.target.getAttribute('data-time');
    const amount = e.target.getAttribute('data-amount');
    
    const d = new Date(time);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    document.getElementById('feed-time').value = d.toISOString().slice(0, 16);
    document.getElementById('feed-amount').value = amount;
    updateClearBtnVisibility();
    
    editingId = id;
    const btn = document.getElementById('add-btn');
    btn.innerText = 'Update Feed';
    btn.style.background = 'linear-gradient(135deg, #34C759 0%, #28a745 100%)';
    btn.style.boxShadow = '0 6px 16px rgba(52, 199, 89, 0.3)';
    document.getElementById('edit-actions').style.display = 'flex';
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

    exitEditMode();

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

// Advanced Charting & Feature #5 Summary Stats
function updateChart() {
  const ctx = document.getElementById('trendsChart');
  if (!ctx) return;

  const today = new Date();
  const dailyMap = {};
  
  for (let i = currentChartDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('en-US'); 
    const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); 
    dailyMap[key] = { label, amount: 0, count: 0 };
  }

  allFeedsData.forEach(f => {
    const fd = new Date(f.timestamp);
    const key = fd.toLocaleDateString('en-US');
    if (dailyMap[key] !== undefined) {
      dailyMap[key].amount += Number(f.amount) || 0;
      dailyMap[key].count += 1;
    }
  });

  const labels = [];
  const barData = [];
  let totalForPeriod = 0;
  let totalFeedsForPeriod = 0;

  Object.values(dailyMap).forEach(day => {
    labels.push(day.label);
    barData.push(day.amount);
    totalForPeriod += day.amount;
    totalFeedsForPeriod += day.count;
  });

  const avg = Math.round(totalForPeriod / currentChartDays);
  const avgPerFeed = totalFeedsForPeriod > 0 ? Math.round(totalForPeriod / totalFeedsForPeriod) : 0;
  const feedsPerDay = (totalFeedsForPeriod / currentChartDays).toFixed(1);

  document.getElementById('stat-daily-avg').innerText = `${avg} ml`;
  document.getElementById('stat-feed-avg').innerText = `${avgPerFeed} ml`;
  document.getElementById('stat-feeds-day').innerText = feedsPerDay;

  if (allFeedsData.length === 0) return;

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