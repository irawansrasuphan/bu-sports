/* =========================================================
   Sports Lending System - script.js (Firebase Realtime & Profile Persistent)
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

// คีย์โครงการของโครงการคุณตามระบบ
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
let isOverdueBlocked = false; // สำหรับเช็คสถานะการล็อกยืมเมื่อเกินกำหนดเวลา

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
    checkOverdueStatus(); // ตรวจสอบการหมดเวลาก่อนแสดงผลหน้าหลัก
    renderMyBorrows();
    renderHistoryShortcut(); // 🆕 เรนเดอร์ข้อมูลประวัติแบบย่อในหน้าแรก
    updateStats();
  }
  if (id === "s-borrow") renderEquip();
  if (id === "s-return") renderReturn();
  if (id === "s-history") renderHistory(); // 🆕 เรนเดอร์หน้าประวัติทั้งหมด
};

/* Login System - ปรับปรุงเพื่อไม่ให้เขียนทับรูปโปรไฟล์เดิมบน Firebase */
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

  // ตรวจสอบก่อนว่าผู้ใช้นี้เคยมีข้อมูลในระบบและมีรูปภาพโปรไฟล์อยู่แล้วหรือไม่
  let existingAvatar = "";
  try {
    const snapshot = await get(ref(db, `users/${sid}/profile`));
    if (snapshot.exists()) {
      const userData = snapshot.val();
      if (userData && userData.avatar) {
        existingAvatar = userData.avatar; // ดึงรูปภาพเดิมมาใช้งาน
      }
    }
  } catch (e) {
    console.error("Error fetching user profile:", e);
  }

  currentUser = { name, id: sid, faculty, avatar: existingAvatar };

  localStorage.setItem("sportsUser", JSON.stringify(currentUser));

  // บันทึกข้อมูลลงฐานข้อมูลโดยรักษารูปภาพเดิมไว้
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
  document.getElementById("logout-modal").classList.add("open");
};
window.closeLogoutModal = function () {
  document.getElementById("logout-modal").classList.remove("open");
};

window.doLogout = function () {
  closeLogoutModal();
  localStorage.clear();
  currentUser = { name: "", id: "", faculty: "", avatar: "" };
  myBorrows = [];
  myHistory = [];
  isOverdueBlocked = false;

  // รีเซ็ตการแสดงผลหน้ากากรูปภาพให้กลับเป็นตัวอักษรเริ่มต้นหลังออกจากระบบ
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
  document.getElementById("edit-inp-name").value = currentUser.name;
  document.getElementById("edit-inp-id").value = currentUser.id;
  document.getElementById("edit-inp-faculty").value = currentUser.faculty;
  document.getElementById("edit-profile-modal").classList.add("open");
};

window.closeEditProfileModal = function () {
  document.getElementById("edit-profile-modal").classList.remove("open");
};

window.saveEditedProfile = function () {
  const newName = document.getElementById("edit-inp-name").value.trim();
  const newId = document.getElementById("edit-inp-id").value.trim();
  const newFaculty = document.getElementById("edit-inp-faculty").value;

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

      // ปรับปรุงการดึงข้อมูลรูปภาพโปรไฟล์จากเซิร์ฟเวอร์แบบ Realtime
      if (data.profile && data.profile.avatar) {
        currentUser.avatar = data.profile.avatar;
        localStorage.setItem("sportsUser", JSON.stringify(currentUser));
        applyAvatarUI(currentUser.avatar);
      }
    }
    checkOverdueStatus(); // ตรวจสอบสถานะการค้างส่งอุปกรณ์แบบเรียลไทม์
    renderMyBorrows();
    renderReturn();
    renderHistoryShortcut(); // 🆕 อัปเดตข้อมูลทางลัดประวัติหน้าแรกแบบเรียลไทม์
    renderHistory(); // 🆕 อัปเดตข้อมูลหน้าประวัติหลักแบบเรียลไทม์
    updateStats();
  });

  onValue(ref(db, "equipmentOut"), (snapshot) => {
    const data = snapshot.val();
    if (data) {
      EQUIP.forEach((item) => {
        if (data[item.id] !== undefined) {
          item.out = data[item.id];
        }
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

  // 🚨 ตรวจสอบก่อนว่าติดสถานะ Overdue หรือไม่ ถ้าติดให้ออกและระงับการยืมทันที
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

/* 🚨 FUNCTIONS สำหรับจัดการแจ้งเตือนคืนเกินเวลา (Overdue) */
window.openOverdueModal = function () {
  const modal = document.getElementById("overdue-modal");
  if (modal) modal.classList.add("open");
};
window.closeOverdueModal = function () {
  const modal = document.getElementById("overdue-modal");
  if (modal) modal.classList.remove("open");
};

// ฟังก์ชันตรวจสอบประวัติที่กำลังยืมอยู่ว่าเลยเวลากำหนดส่งคืนแล้วหรือยัง
function checkOverdueStatus() {
  const now = new Date();
  const activeBorrows = myBorrows.filter((b) => b.active);

  // ค้นหาว่ามีไอเทมไหนที่เวลาส่งคืน (returnBy) น้อยกว่าเวลาปัจจุบัน (now) หรือไม่
  const hasOverdueItem = activeBorrows.some((b) => new Date(b.returnBy) < now);

  if (hasOverdueItem) {
    isOverdueBlocked = true;
  } else {
    isOverdueBlocked = false;
  }
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
      // ตรวจสอบข้อมูลรายตัวเพื่อเปลี่ยนสไตล์ badge และการสั่นแจ้งเตือนภัย
      const isOverdue = new Date(b.returnBy) < now;
      const badgeClass = isOverdue ? "badge warn" : "badge active";
      const badgeText = isOverdue ? "เกินเวลาคืน" : "กำลังยืม";

      return `
        <div class="borrow-item" style="${isOverdue ? "border-left: 4px solid var(--warning); padding-left: calc(1rem - 4px);" : ""}">
          <div class="ball-icon" style="${isOverdue ? "background: var(--warning-light); color: var(--warning-dark); animation: shake 0.3s infinite ease-in-out alternate;" : ""}">${b.emoji}</div>
          <div class="info">
            <b style="${isOverdue ? "color: var(--warning-dark);" : ""}">${b.name}</b>
            <small>กำหนดคืน: ${fmt(b.returnBy)}</small>
          </div>
          <span class="${badgeClass}">${badgeText}</span>
        </div>
      `;
    })
    .join("");
}

function renderReturn() {
  const container = document.getElementById("return-list");
  if (!container) return;
  const activeBorrows = myBorrows.filter((b) => b.active);
  if (activeBorrows.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding: 4rem 1rem;"><i class="ti ti-package" style="font-size: 3.5rem; opacity: 0.5;"></i><p>ไม่มีอุปกรณ์กีฬาที่ต้องคืนในขณะนี้</p></div>`;
    return;
  }

  const now = new Date();
  container.innerHTML = activeBorrows
    .map((b) => {
      const masterIndex = myBorrows.indexOf(b);
      const isOverdue = new Date(b.returnBy) < now;

      return `
      <div class="borrow-item" style="padding: 1.25rem; margin: 1rem; background: white; border-radius: 16px; border: 1px solid ${isOverdue ? "var(--warning)" : "var(--gray-200)"}; display: flex; align-items: center; justify-content: space-between; box-shadow: ${isOverdue ? "var(--shadow-sm)" : "none"};">
        <div style="display: flex; align-items: center; gap: 1rem;">
          <div class="ball-icon" style="${isOverdue ? "background: var(--warning-light); color: var(--warning-dark); animation: shake 0.3s infinite ease-in-out alternate;" : ""}">${b.emoji}</div>
          <div>
            <b style="${isOverdue ? "color: var(--warning-dark);" : ""}">${b.name} ${isOverdue ? "(เกินเวลาคืน)" : ""}</b>
            <small style="color: var(--gray-500); display:block;">กำหนดคืน: ${fmt(b.returnBy)}</small>
          </div>
        </div>
        <button class="btn-cancel" onclick="window.openConfirmModal('${b.id}', ${masterIndex})" style="border: 1px solid var(--danger); color: var(--danger); padding: 0.5rem 1rem; border-radius: 10px; cursor: pointer; background: white; font-weight:600;">คืนของ</button>
      </div>
    `;
    })
    .join("");
}

window.openConfirmModal = function (equipId, borrowIndex) {
  const item = myBorrows[borrowIndex];
  if (!item) return;
  pendingReturnData = { equipId, borrowIndex };
  document.getElementById("conf-emoji").textContent = item.emoji;
  document.getElementById("conf-msg").textContent =
    `คุณต้องการคืน ${item.name} ใช่หรือไม่?`;
  document.getElementById("conf-execute-btn").onclick = executeReturn;
  document.getElementById("confirm-modal").classList.add("open");
};

window.closeConfirmModal = function () {
  document.getElementById("confirm-modal").classList.remove("open");
  pendingReturnData = null;
};

function executeReturn() {
  if (!pendingReturnData) return;
  const { equipId, borrowIndex } = pendingReturnData;
  const targetEquip = EQUIP.find((e) => e.id === equipId);
  if (targetEquip && targetEquip.out > 0) targetEquip.out--;

  if (myBorrows[borrowIndex]) {
    myBorrows[borrowIndex].active = false;
    myHistory.unshift({
      ...myBorrows[borrowIndex],
      returned: new Date().toISOString(),
    });
  }

  saveOnlineData();
  window.closeConfirmModal();

  // ทำการเช็คสถานะอีกครั้งหลังคืนของ เพื่อปลดล็อกการล็อกยืมทันทีหากไม่มีชิ้นอื่นค้างส่งอีกแล้ว
  checkOverdueStatus();

  showSuccess("🎉", "คืนอุปกรณ์สำเร็จ!", `ขอบคุณที่ส่งคืนอุปกรณ์เรียบร้อยแล้ว`);
}

/* 🆕 ฟังก์ชันเรนเดอร์ข้อมูลหน้าจอประวัติการยืม-คืนอุปกรณ์กีฬาหลัก (s-history) */
function renderHistory() {
  const container = document.getElementById("history-list");
  if (!container) return;

  if (myHistory.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding: 4rem 1rem;"><i class="ti ti-history" style="font-size: 3.5rem; opacity: 0.4;"></i><p>ยังไม่มีประวัติการทำรายการยืม-คืนอุปกรณ์กีฬา</p></div>`;
    return;
  }

  container.innerHTML = myHistory
    .map((h) => {
      return `
      <div class="borrow-item" style="padding: 1rem 0;">
        <div class="ball-icon" style="background: var(--gray-100); color: var(--gray-700);">${h.emoji}</div>
        <div class="info">
          <b>${h.name}</b>
          <small style="color: var(--gray-500); display: block; margin-top: 0.15rem;">ยืมเมื่อ: ${fmt(h.borrowed)}</small>
          <small style="color: var(--primary-dark); display: block;">คืนเมื่อ: ${fmt(h.returned)}</small>
        </div>
        <span class="badge returned">คืนแล้ว</span>
      </div>
    `;
    })
    .join("");
}

/* 🆕 ฟังก์ชันอัปเดต Widget การ์ดทางลัดประวัติหน้าแรก (history-shortcut-card) */
function renderHistoryShortcut() {
  const shortcutTitle = document.getElementById("shortcut-title");
  const shortcutSub = document.getElementById("shortcut-sub");

  if (!shortcutTitle || !shortcutSub) return;

  if (myHistory.length > 0) {
    const latest = myHistory[0];
    shortcutTitle.textContent = `${latest.emoji} คืน ${latest.name} สำเร็จ`;
    shortcutSub.textContent = `ทำรายการล่าสุดเมื่อ ${fmt(latest.returned)}`;
  } else {
    shortcutTitle.textContent = "ยังไม่มีประวัติการยืม";
    shortcutSub.textContent = "กดเพื่อดูรายละเอียดประวัติทั้งหมดของคุณ";
  }
}

function showSuccess(icon, title, message) {
  document.getElementById("suc-icon").textContent = icon;
  document.getElementById("suc-title").textContent = title;
  document.getElementById("suc-msg").textContent = message;
  document.getElementById("success-overlay").classList.add("open");
}

window.closeSuccess = function () {
  document.getElementById("success-overlay").classList.remove("open");
  window.goTo("s-home");
};

/* ตรวจสอบและดึงรูปภาพโปรไฟล์เมื่อรีเฟรชหน้าเว็บ */
window.onload = function () {
  if (loadUserFromStorage()) {
    setupUserUI();

    if (currentUser && currentUser.avatar) {
      applyAvatarUI(currentUser.avatar);
    }

    listenToFirebaseData();
    window.goTo("s-home");
  } else {
    window.goTo("s-login");
  }
};
