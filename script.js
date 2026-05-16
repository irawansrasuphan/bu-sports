/* =========================================================
   Sports Lending System - script.js (Complete Fixed Version)
========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// คีย์โครงการ Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDy5woHXjPdH7816Im7MloAlbLJIi4Bdk",
  authDomain: "bu-sports-lending.firebaseapp.com",
  databaseURL: "https://bu-sports-lending-default-rtdb.firebaseio.com",
  projectId: "bu-sports-lending",
  storageBucket: "bu-sports-lending.firebasestorage.app",
  messagingSenderId: "490655574322",
  appId: "1:490655574322:web:79e62b6b6d7c6d8368f2b",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/* ข้อมูลอุปกรณ์กีฬาเริ่มต้น */
let EQUIP = [
  { id: "football", name: "ลูกฟุตบอล", emoji: "⚽", total: 5, out: 0 },
  { id: "volleyball", name: "วอลเลย์บอล", emoji: "🏐", total: 5, out: 0 },
  { id: "basketball", name: "บาสเกตบอล", emoji: "🏀", total: 5, out: 0 },
  { id: "pingpong", name: "ปิงปอง (แพ็ค)", emoji: "🏓", total: 5, out: 0 },
  { id: "petanque", name: "เปตอง (ชุด)", emoji: "🔮", total: 5, out: 0 },
  { id: "takraw", name: "ตะกร้อ", emoji: "🧶", total: 5, out: 0 },
];

/* State Management */
let currentUser = { name: "", id: "", faculty: "", avatar: "" };
let myBorrows = [];
let myHistory = [];
let selDuration = 1;
let modalEquip = null;
let pendingReturnData = null;
let isOverdueBlocked = false;

function fmt(dateString) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return (
    date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) +
    " น."
  );
}

function initials(name) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

window.toggleSidebar = function () {
  const sidebar = document.getElementById("sidebar-menu");
  const overlay = document.getElementById("sidebar-overlay");
  if (sidebar && overlay) {
    sidebar.classList.toggle("active");
    overlay.classList.toggle("active");
  }
};

window.goTo = function (id) {
  window.scrollTo({ top: 0, behavior: "instant" });
  document
    .querySelectorAll(".screen")
    .forEach((screen) => screen.classList.remove("active"));
  const target = document.getElementById(id);
  if (target) target.classList.add("active");

  if (id === "s-home") {
    checkOverdueStatus();
    renderMyBorrows();
    renderHistoryShortcut();
    updateStats();
  }
  if (id === "s-borrow") renderEquip();
  if (id === "s-return") renderReturn();
  if (id === "s-history") renderHistory();
};

/* ฟังก์ชันรองรับการคลิกนอกกรอบ Modal บน HTML ของคุณ */
window.handleOverlayClick = function (event) {
  if (event.target.id === "borrow-modal") {
    window.closeModal();
  }
};

/* Login System */
window.doLogin = async function () {
  const nameInput = document.getElementById("inp-name");
  const idInput = document.getElementById("inp-id");
  const facultyInput = document.getElementById("inp-faculty");
  const err = document.getElementById("login-err");

  const name = nameInput?.value.trim() || "";
  const sid = idInput?.value.trim() || "";
  const faculty = facultyInput?.value || "";

  if (!name || !sid || !faculty || sid.length < 7) {
    if (err) err.style.display = "block";
    return;
  }

  if (err) err.style.display = "none";

  let existingAvatar = "";
  try {
    const snapshot = await get(ref(db, `users/${sid}/profile`));
    if (snapshot.exists()) {
      const userData = snapshot.val();
      if (userData && userData.avatar) {
        existingAvatar = userData.avatar;
      }
    }
  } catch (e) {
    console.error(e);
  }

  currentUser = { name, id: sid, faculty, avatar: existingAvatar };
  localStorage.setItem("sportsUser", JSON.stringify(currentUser));
  set(ref(db, `users/${currentUser.id}/profile`), currentUser);

  setupUserUI();
  listenToFirebaseData();
  goTo("s-home");
};

function loadUserFromStorage() {
  const data = localStorage.getItem("sportsUser");
  if (!data) return false;
  currentUser = JSON.parse(data);
  return true;
}

window.askLogout = function () {
  const modal = document.getElementById("logout-modal");
  if (modal) modal.classList.add("open");
};
window.closeLogoutModal = function () {
  const modal = document.getElementById("logout-modal");
  if (modal) modal.classList.remove("open");
};

window.doLogout = function () {
  closeLogoutModal();
  localStorage.clear();
  currentUser = { name: "", id: "", faculty: "", avatar: "" };
  myBorrows = [];
  myHistory = [];
  isOverdueBlocked = false;

  const navAv = document.getElementById("nav-avatar");
  const sideAv = document.getElementById("sidebar-avatar");
  if (navAv) {
    navAv.style.backgroundImage = "none";
    navAv.textContent = "?";
  }
  if (sideAv) {
    sideAv.style.backgroundImage = "none";
    sideAv.textContent = "?";
  }

  goTo("s-login");
};

/* AVATAR FUNCTIONS */
window.uploadAvatar = function (event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const base64Img = e.target.result;
    currentUser.avatar = base64Img;
    localStorage.setItem("sportsUser", JSON.stringify(currentUser));

    if (currentUser.id) {
      update(ref(db, `users/${currentUser.id}/profile`), { avatar: base64Img });
    }
    applyAvatarUI(base64Img);
  };
  reader.readAsDataURL(file);
};

function applyAvatarUI(imgData) {
  const navAv = document.getElementById("nav-avatar");
  const sideAv = document.getElementById("sidebar-avatar");

  if (imgData) {
    if (navAv) {
      navAv.style.backgroundImage = `url(${imgData})`;
      navAv.textContent = "";
    }
    if (sideAv) {
      sideAv.style.backgroundImage = `url(${imgData})`;
      sideAv.textContent = "";
    }
  } else {
    const fallbackTxt = initials(currentUser.name);
    if (navAv) {
      navAv.style.backgroundImage = "none";
      navAv.textContent = fallbackTxt;
    }
    if (sideAv) {
      sideAv.style.backgroundImage = "none";
      sideAv.textContent = fallbackTxt;
    }
  }
}

window.openEditProfileModal = function () {
  const nameInp = document.getElementById("edit-inp-name");
  const idInp = document.getElementById("edit-inp-id");
  const facInp = document.getElementById("edit-inp-faculty");
  const modal = document.getElementById("edit-profile-modal");

  if (nameInp) nameInp.value = currentUser.name;
  if (idInp) idInp.value = currentUser.id;
  if (facInp) facInp.value = currentUser.faculty;
  if (modal) modal.classList.add("open");
};

window.closeEditProfileModal = function () {
  const modal = document.getElementById("edit-profile-modal");
  if (modal) modal.classList.remove("open");
};

window.saveEditedProfile = function () {
  const newName = document.getElementById("edit-inp-name")?.value.trim();
  const newId = document.getElementById("edit-inp-id")?.value.trim();
  const newFaculty = document.getElementById("edit-inp-faculty")?.value;

  if (!newName || !newId || newId.length < 7) {
    alert("กรุณากรอกข้อมูลให้ถูกต้อง");
    return;
  }

  currentUser.name = newName;
  currentUser.id = newId;
  currentUser.faculty = newFaculty;

  localStorage.setItem("sportsUser", JSON.stringify(currentUser));
  set(ref(db, `users/${currentUser.id}/profile`), currentUser);

  setupUserUI();
  closeEditProfileModal();
  toggleSidebar();
  showSuccess("📝", "อัปเดตสำเร็จ", "แก้ไขข้อมูลเรียบร้อย");
};

/* FIREBASE REALTIME REAL SYNC DATA */
function saveOnlineData() {
  const equipData = {};
  EQUIP.forEach((item) => {
    equipData[item.id] = item.out;
  });
  set(ref(db, "equipmentOut"), equipData);

  if (currentUser.id) {
    set(ref(db, `users/${currentUser.id}/borrows`), myBorrows);
    set(ref(db, `users/${currentUser.id}/history`), myHistory);
  }
}

function listenToFirebaseData() {
  if (!currentUser.id) return;

  onValue(ref(db, `users/${currentUser.id}`), (snapshot) => {
    const data = snapshot.val();
    if (data) {
      myBorrows = data.borrows || [];
      myHistory = data.history || [];

      if (data.profile && data.profile.avatar) {
        currentUser.avatar = data.profile.avatar;
        localStorage.setItem("sportsUser", JSON.stringify(currentUser));
        applyAvatarUI(currentUser.avatar);
      }
    }
    checkOverdueStatus();
    renderMyBorrows();
    renderReturn();
    renderHistoryShortcut();
    renderHistory();
    updateStats();
  });

  onValue(ref(db, "equipmentOut"), (snapshot) => {
    const data = snapshot.val();
    if (data) {
      EQUIP.forEach((item) => {
        if (data[item.id] !== undefined) item.out = data[item.id];
      });
      updateStats();
      renderEquip();
    } else {
      saveOnlineData();
    }
  });
}

function setupUserUI() {
  if (!currentUser.name) return;
  const firstName = currentUser.name.split(" ")[0];

  if (document.getElementById("greet-text"))
    document.getElementById("greet-text").textContent = `สวัสดี, ${firstName}!`;
  if (document.getElementById("nav-name"))
    document.getElementById("nav-name").textContent = currentUser.name;
  if (document.getElementById("nav-id"))
    document.getElementById("nav-id").textContent = currentUser.id;
  if (document.getElementById("sidebar-name"))
    document.getElementById("sidebar-name").textContent = currentUser.name;
  if (document.getElementById("sidebar-id"))
    document.getElementById("sidebar-id").innerHTML =
      `<i class="ti ti-id"></i> ${currentUser.id}`;
  if (document.getElementById("sidebar-faculty"))
    document.getElementById("sidebar-faculty").innerHTML =
      `<i class="ti ti-school"></i> ${currentUser.faculty}`;

  applyAvatarUI(currentUser.avatar);
}

function updateStats() {
  let sumTotal = 0;
  let sumOut = 0;
  EQUIP.forEach((e) => {
    sumTotal += e.total;
    sumOut += e.out;
  });
  const sumAvail = sumTotal - sumOut;

  if (document.getElementById("stat-total"))
    document.getElementById("stat-total").textContent = sumTotal;
  if (document.getElementById("stat-out"))
    document.getElementById("stat-out").textContent = sumOut;
  if (document.getElementById("stat-avail"))
    document.getElementById("stat-avail").textContent = sumAvail;
}

function renderEquip() {
  const grid = document.getElementById("equip-grid");
  if (!grid) return;

  grid.innerHTML = EQUIP.map((e) => {
    const avail = e.total - e.out;
    const percent = (avail / e.total) * 100;
    return `
      <div class="equip-card ${avail === 0 ? "unavail" : ""}" onclick="window.handleEquipCardClick('${e.id}', ${avail})">
        <div class="eball">${e.emoji}</div>
        <h3>${e.name}</h3>
        <div class="progress-bar"><div class="progress-fill" style="width:${percent}%"></div></div>
        <div style="margin-top:0.5rem; font-size:0.85rem; color:var(--gray-500);">พร้อมยืม ${avail} / ${e.total} ชิ้น</div>
      </div>
    `;
  }).join("");
}

window.handleEquipCardClick = function (eid, avail) {
  if (avail <= 0) return;
  if (isOverdueBlocked) {
    window.openOverdueModal();
    return;
  }
  const activeCount = myBorrows.filter((b) => b.active).length;
  if (activeCount >= 1) {
    window.openLimitModal();
    return;
  }
  window.openModal(eid);
};

window.openModal = function (eid) {
  modalEquip = EQUIP.find((e) => e.id === eid);
  if (!modalEquip) return;
  const avail = modalEquip.total - modalEquip.out;
  document.getElementById("modal-title").textContent =
    `${modalEquip.emoji} ${modalEquip.name}`;
  document.getElementById("modal-avail").textContent = avail;
  selDuration = 1;
  document
    .querySelectorAll(".dur-btn")
    .forEach((b) => b.classList.remove("sel"));
  const firstBtn = document.querySelector(".dur-btn");
  if (firstBtn) firstBtn.classList.add("sel");
  document.getElementById("borrow-modal").classList.add("open");
};

window.closeModal = function () {
  document.getElementById("borrow-modal").classList.remove("open");
};
window.openLimitModal = function () {
  document.getElementById("limit-modal").classList.add("open");
};
window.closeLimitModal = function () {
  document.getElementById("limit-modal").classList.remove("open");
};

window.openOverdueModal = function () {
  const modal = document.getElementById("overdue-modal");
  if (modal) modal.classList.add("open");
};
window.closeOverdueModal = function () {
  const modal = document.getElementById("overdue-modal");
  if (modal) modal.classList.remove("open");
};

function checkOverdueStatus() {
  const now = new Date();
  const activeBorrows = myBorrows.filter((b) => b.active);
  const hasOverdueItem = activeBorrows.some((b) => new Date(b.returnBy) < now);
  isOverdueBlocked = hasOverdueItem;
}

window.selDur = function (btn, hour) {
  selDuration = hour;
  document
    .querySelectorAll(".dur-btn")
    .forEach((b) => b.classList.remove("sel"));
  btn.classList.add("sel");
};

window.confirmBorrow = function () {
  if (!modalEquip || modalEquip.out >= modalEquip.total) return;

  modalEquip.out++;
  const now = new Date();
  const returnBy = new Date(now.getTime() + selDuration * 60 * 60 * 1000);

  myBorrows.unshift({
    id: modalEquip.id,
    name: modalEquip.name,
    emoji: modalEquip.emoji,
    borrowed: now.toISOString(),
    returnBy: returnBy.toISOString(),
    active: true,
  });

  saveOnlineData();
  window.closeModal();
  showSuccess("✅", "ยืมสำเร็จ!", `คุณยืม ${modalEquip.name} เรียบร้อยแล้ว`);
};

function renderMyBorrows() {
  const container = document.getElementById("my-borrows");
  if (!container) return;
  const active = myBorrows.filter((b) => b.active);
  if (active.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="ti ti-mood-smile"></i>ไม่มีอุปกรณ์ที่กำลังยืมอยู่</div>`;
    return;
  }

  const now = new Date();
  container.innerHTML = active
    .map((b) => {
      const isOverdue = new Date(b.returnBy) < now;
      const diff = new Date(b.returnBy) - now;
      let timeText = "";

      if (diff > 0) {
        const hrs = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        timeText =
          hrs > 0
            ? `เหลือเวลา ${hrs} ชม. ${mins} นาที`
            : `เหลือเวลา ${mins} นาที`;
      } else {
        const overDiff = now - new Date(b.returnBy);
        const mins = Math.floor(overDiff / 60000);
        timeText = `เกินเวลามาแล้ว ${mins} นาที ⚠️`;
      }

      return `
        <div class="borrow-item" style="${isOverdue ? "border-left: 4px solid #ef4444;" : ""}">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <div style="display:flex; align-items:center; gap:0.75rem;">
              <span style="font-size:1.75rem;">${b.emoji}</span>
              <div>
                <h4 style="font-weight:600; color:#1e293b;">${b.name}</h4>
                <p style="font-size:0.8rem; color:${isOverdue ? "#ef4444" : "#10b981"}; font-weight:500;">
                  ${timeText}
                </p>
              </div>
            </div>
            <span class="badge ${isOverdue ? "warn" : "active"}">${isOverdue ? "เกินเวลา" : "กำลังยืม"}</span>
          </div>
          <div style="margin-top:0.75rem; padding-top:0.75rem; border-top:1px dashed #e2e8f0; font-size:0.75rem; color:#64748b; display:flex; justify-content:space-between;">
            <span>ยืมเมื่อ: ${fmt(b.borrowed)}</span>
            <span>กำหนดคืน: ${fmt(b.returnBy)}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderReturn() {
  const container = document.getElementById("return-list");
  if (!container) return;
  const active = myBorrows.filter((b) => b.active);
  if (active.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="ti ti-mood-smile"></i>ไม่มีอุปกรณ์ที่ต้องคืนในขณะนี้</div>`;
    return;
  }

  container.innerHTML = active
    .map(
      (b, idx) => `
      <div class="return-item-card">
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <span style="font-size:1.75rem;">${b.emoji}</span>
          <div>
            <h4 style="font-weight:600; color:#1e293b;">${b.name}</h4>
            <p style="font-size:0.75rem; color:#64748b;">กำหนดคืน: ${fmt(b.returnBy)}</p>
          </div>
        </div>
        <button class="btn-item-return" onclick="window.askReturn(${idx})">
          <i class="ti ti-package-export"></i> คืนของ
        </button>
      </div>
    `,
    )
    .join("");
}

window.askReturn = function (idx) {
  const active = myBorrows.filter((b) => b.active);
  pendingReturnData = active[idx];
  if (!pendingReturnData) return;

  document.getElementById("conf-emoji").textContent = pendingReturnData.emoji;
  document.getElementById("conf-msg").innerHTML =
    `คุณต้องการคืน <b>${pendingReturnData.name}</b> รายการนี้ใช่หรือไม่?`;

  const execBtn = document.getElementById("conf-execute-btn");
  if (execBtn) {
    execBtn.onclick = function () {
      window.executeReturn();
    };
  }
  document.getElementById("confirm-modal").classList.add("open");
};

window.closeConfirmModal = function () {
  document.getElementById("confirm-modal").classList.remove("open");
  pendingReturnData = null;
};

window.executeReturn = function () {
  if (!pendingReturnData) return;

  const target = myBorrows.find(
    (b) =>
      b.borrowed === pendingReturnData.borrowed &&
      b.id === pendingReturnData.id &&
      b.active,
  );

  if (target) {
    target.active = false;
    target.returned = new Date().toISOString();

    const eq = EQUIP.find((e) => e.id === target.id);
    if (eq && eq.out > 0) eq.out--;

    myHistory.unshift({ ...target });
    saveOnlineData();
  }

  window.closeConfirmModal();
  showSuccess("🎉", "คืนอุปกรณ์สำเร็จ!", "ขอบคุณที่ส่งคืนอุปกรณ์ตรงเวลา");
  goTo("s-home");
};

function renderHistoryShortcut() {
  const title = document.getElementById("shortcut-title");
  const sub = document.getElementById("shortcut-sub");
  if (!title || !sub) return;

  const active = myBorrows.filter((b) => b.active);
  if (active.length > 0) {
    const item = active[0];
    const now = new Date();
    const isOverdue = new Date(item.returnBy) < now;
    title.innerHTML = `กำลังยืม: ${item.emoji} ${item.name}`;
    sub.innerHTML = isOverdue
      ? `<span style="color:#ef4444; font-weight:600;">⚠️ เกินกำหนดส่งคืนแล้ว!</span>`
      : `ต้องคืนภายในเวลา ${fmt(item.returnBy)}`;
  } else if (myHistory.length > 0) {
    const last = myHistory[0];
    title.textContent = `คืนล่าสุด: ${last.emoji} ${last.name}`;
    sub.textContent = `เมื่อเวลา ${fmt(last.returned)}`;
  } else {
    title.textContent = "ประวัติการยืม-คืนของฉัน";
    sub.textContent = "ดูรายการอุปกรณ์ทั้งหมดที่เคยส่งคืนแล้ว";
  }
}

function renderHistory() {
  const container = document.getElementById("history-list");
  if (!container) return;
  if (myHistory.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="ti ti-history"></i>ยังไม่มีประวัติการยืม-คืนอุปกรณ์กีฬา</div>`;
    return;
  }

  container.innerHTML = myHistory
    .map(
      (h) => `
      <div class="return-item-card" style="border-left: 4px solid #10b981;">
        <div style="display:flex; align-items:center; gap:0.75rem; width:100%;">
          <span style="font-size:1.75rem;">${h.emoji}</span>
          <div style="flex:1;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <h4 style="font-weight:600; color:#1e293b;">${h.name}</h4>
              <span class="badge" style="background:#e6f4ea; color:#137333;">คืนเรียบร้อย</span>
            </div>
            <p style="font-size:0.75rem; color:#64748b; margin-top:0.25rem;">
              ยืมเมื่อ: ${fmt(h.borrowed)} | คืนเมื่อ: ${fmt(h.returned)}
            </p>
          </div>
        </div>
      </div>
    `,
    )
    .join("");
}

/* SUCCESS TOAST ALERTS */
function showSuccess(emoji, title, msg) {
  const overlay = document.getElementById("success-overlay");
  if (!overlay) return;
  document.getElementById("suc-icon").textContent = emoji;
  document.getElementById("suc-title").textContent = title;
  document.getElementById("suc-msg").textContent = msg;
  overlay.classList.add("open");
}

window.closeSuccess = function () {
  document.getElementById("success-overlay").classList.remove("open");
};

/* ตรวจสอบเวลาทุก ๆ 10 วินาที เพื่อให้เวลานับถอยหลังขยับออกแบบอัตโนมัติ */
setInterval(() => {
  const currentScreen = document.querySelector(".screen.active");
  if (currentScreen && currentScreen.id === "s-home") {
    checkOverdueStatus();
    renderMyBorrows();
    renderHistoryShortcut();
  }
}, 10000);

/* INITIALIZATION */
document.addEventListener("DOMContentLoaded", () => {
  if (loadUserFromStorage()) {
    setupUserUI();
    listenToFirebaseData();
    goTo("s-home");
  } else {
    goTo("s-login");
  }
});
