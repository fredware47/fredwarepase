// shared.js
// Configuración centralizada
const SUPABASE_URL = "https://abwcjcohomifcilquknf.supabase.co";
const SUPABASE_KEY = "sb_publishable_5M0b1VwXkV9nyJDUbnmDew_YLTFIlSw";
const ONESIGNAL_APP_ID = "391506e2-682c-4564-b726-9a9f366fdde8";

// Elementos comunes
let supabaseClient = null;
let audioContext = null;
let audioUnlocked = false;
let currentVolume = 0.8;
let isMuted = false;      // para silencio temporal en sala
let globalLogs = [];      // almacén local de logs

// Inicializar Supabase
function initSupabase() {
  if (!window.supabase) {
    console.warn("Supabase no cargado");
    return;
  }
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return supabaseClient;
}

// ======================== AUDIO ========================
function preloadAudio() {
  if (audioContext) return;
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  // Lo dejamos suspendido hasta que el usuario interactúe
}

function unlockAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume().then(() => {
      audioUnlocked = true;
      showToast("🔊 Audio activado", "success");
    });
  } else {
    audioUnlocked = true;
  }
}

function setVolume(value) {
  currentVolume = Math.min(1, Math.max(0, value));
}

function playBeep(frequency, duration, type = "sine", volume = currentVolume) {
  if (!audioContext || !audioUnlocked || isMuted) return;
  try {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = volume * 0.7;
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    osc.start();
    osc.stop(audioContext.currentTime + duration);
  } catch (e) {}
}

function playPlatoSound(tipo) {
  switch (tipo) {
    case "ENTRANTE": playBeep(880, 0.2, "sine"); break;
    case "SEGUNDO": playBeep(660, 0.25, "triangle"); break;
    case "PLATO DEL DIA": playBeep(523.25, 0.3, "square"); break;
    case "POSTRE": playBeep(1046.5, 0.2, "sine"); break;
    case "PARA LLEVAR": playBeep(440, 0.4, "sawtooth"); break;
    case "LISTO": playBeep(1318.52, 0.15, "sine"); break;
    default: playBeep(800, 0.2, "sine");
  }
}

function playAlarmaPanico() {
  if (!audioContext || !audioUnlocked || isMuted) return;
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(500, now);
  osc.frequency.linearRampToValueAtTime(950, now + 0.2);
  osc.frequency.linearRampToValueAtTime(500, now + 0.4);
  gain.gain.setValueAtTime(0.9, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
  osc.start();
  osc.stop(now + 0.5);
}

// ======================== TOAST ========================
function showToast(message, type = "info") {
  let toastContainer = document.getElementById("toast-container");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "toast-container";
    toastContainer.style.position = "fixed";
    toastContainer.style.bottom = "20px";
    toastContainer.style.left = "20px";
    toastContainer.style.right = "20px";
    toastContainer.style.zIndex = "9999";
    toastContainer.style.display = "flex";
    toastContainer.style.flexDirection = "column";
    toastContainer.style.gap = "10px";
    document.body.appendChild(toastContainer);
  }
  const toast = document.createElement("div");
  toast.style.background = type === "error" ? "#ef4444" : type === "success" ? "#10b981" : "#334155";
  toast.style.color = "white";
  toast.style.padding = "12px 20px";
  toast.style.borderRadius = "12px";
  toast.style.fontWeight = "bold";
  toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
  toast.style.backdropFilter = "blur(8px)";
  toast.style.fontSize = "14px";
  toast.innerText = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ======================== OFFLINE QUEUE (IndexedDB) ========================
const DB_NAME = "FredwareOffline";
const STORE_NAME = "pendingActions";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function addPendingAction(action) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.add(action);
  return new Promise((resolve) => { tx.oncomplete = resolve; });
}

async function getPendingActions() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const actions = await new Promise((resolve) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
  });
  return actions;
}

async function clearPendingActions() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.clear();
  return new Promise((resolve) => { tx.oncomplete = resolve; });
}

// Procesar cola cuando haya conexión
async function processOfflineQueue() {
  if (!supabaseClient) return;
  const actions = await getPendingActions();
  if (actions.length === 0) return;
  for (const action of actions) {
    try {
      if (action.type === "INSERT_PLATO") {
        const { error } = await supabaseClient.from("platos").insert([action.data]);
        if (!error) {
          // también enviar notificación push si aplica
          if (action.pushData) {
            sendPushNotification(action.pushData);
          }
        } else {
          // reintentar después
          return;
        }
      } else if (action.type === "DELETE_PLATO") {
        await supabaseClient.from("platos").delete().eq("id", action.id);
      }
    } catch (e) {}
  }
  await clearPendingActions();
  showToast("📡 Pedidos pendientes enviados", "success");
}

// ======================== PUSH NOTIFICATIONS (segmentadas) ========================
async function initOneSignal(tags = {}) {
  if (!window.OneSignalDeferred) return;
  window.OneSignalDeferred.push(async (OneSignal) => {
    await OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      allowLocalhostAsSecureOrigin: true,
    });
    // Registrar tags si se proporcionan
    if (Object.keys(tags).length > 0) {
      await OneSignal.User.addTags(tags);
    }
    // Solicitar permiso si no está concedido
    const permission = await OneSignal.Notifications.permission;
    if (!permission) {
      await OneSignal.Notifications.requestPermission();
    }
  });
}

async function sendPushNotification(details) {
  if (!window.OneSignalDeferred) return;
  window.OneSignalDeferred.push(async (OneSignal) => {
    try {
      const { zona, mesa, tipoPlato, emoji, nombreCamarero } = details;
      let filters = [];
      if (zona !== "SALA") {
        filters = [{ field: "tag", key: "zona", relation: "=", value: zona }];
      } else {
        filters = [{ field: "session_count", relation: ">", value: "0" }];
      }
      await OneSignal.Notifications.sendNotification({
        filters,
        contents: { es: `🏃‍♂️ ${nombreCamarero} -> ${emoji} Mesa ${mesa}: ${tipoPlato} listo!` },
        headings: { es: "Fredware Pase 🛎️" },
      });
    } catch (err) {
      console.error("Push error:", err);
    }
  });
}

// ======================== LOGGING ========================
async function addLog(entry) {
  const logEntry = { ...entry, timestamp: new Date().toISOString() };
  globalLogs.push(logEntry);
  if (supabaseClient) {
    try {
      await supabaseClient.from("logs").insert([logEntry]);
    } catch (e) {}
  }
  // mantener solo últimos 100 logs en memoria
  if (globalLogs.length > 100) globalLogs.shift();
}

// ======================== CONFIGURACIÓN DE PERSONAL (Supabase) ========================
let camarerosTurno = ["DANIELA", "CARLOS", "ELENA", "JAVI"];
const zonasMapeadas = ["BARRA", "SALON", "TERRAZA", "APOYO"];

async function loadPersonalConfig() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.from("config").select("value").eq("key", "personal").single();
  if (!error && data) {
    try {
      const parsed = JSON.parse(data.value);
      if (Array.isArray(parsed)) camarerosTurno = parsed;
    } catch(e) {}
  }
  // si no hay en Supabase, usar localStorage como fallback
  const local = localStorage.getItem("fredware_personal_servicio");
  if (local && (!data || error)) {
    try {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed)) camarerosTurno = parsed;
    } catch(e) {}
  }
}

async function savePersonalConfig(camareros) {
  if (!supabaseClient) return;
  try {
    await supabaseClient.from("config").upsert({ key: "personal", value: JSON.stringify(camareros) });
    localStorage.setItem("fredware_personal_servicio", JSON.stringify(camareros));
  } catch(e) {
    localStorage.setItem("fredware_personal_servicio", JSON.stringify(camareros));
  }
}

// Exportar funciones globales
window.Fredware = {
  initSupabase,
  preloadAudio,
  unlockAudio,
  setVolume,
  playPlatoSound,
  playAlarmaPanico,
  showToast,
  addPendingAction,
  processOfflineQueue,
  initOneSignal,
  sendPushNotification,
  addLog,
  loadPersonalConfig,
  savePersonalConfig,
  camarerosTurno,
  zonasMapeadas,
  supabaseClient: () => supabaseClient,
  get isAudioUnlocked() { return audioUnlocked; },
  setMuted: (muted) => { isMuted = muted; },
  get isMuted() { return isMuted; }
};

// Auto-inicializar Supabase y precargar audio
window.addEventListener("DOMContentLoaded", () => {
  initSupabase();
  preloadAudio();
  loadPersonalConfig();
  // Procesar cola offline al inicio
  window.Fredware.processOfflineQueue();
  // Escuchar cambios de conexión
  window.addEventListener("online", () => window.Fredware.processOfflineQueue());
});