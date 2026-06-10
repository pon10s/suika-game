// ローカル保存(localStorage)。今はベストスコアのみ
const STORAGE_KEY_BEST = "suika.best";

function loadBest() {
  const value = parseInt(localStorage.getItem(STORAGE_KEY_BEST), 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function saveBest(score) {
  localStorage.setItem(STORAGE_KEY_BEST, String(score));
}
