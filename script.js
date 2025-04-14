function updateTimer() {
    const diff = expiration - Date.now();
    if (diff <= 0) return location.reload();
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
    document.getElementById('timer').textContent = m + 'm' + s + 's';
    setTimeout(updateTimer, 1000);
  }
  updateTimer();
  