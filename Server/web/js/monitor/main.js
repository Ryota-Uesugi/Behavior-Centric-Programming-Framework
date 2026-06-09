import * as THREE from './three/three.module.js';

/* ================= Drawer Control ================= */
const drawer = document.getElementById("drawer");

// Open/Close display drawer (MAVLink Viewer)
document.getElementById("open-drawer").onclick = () =>
  drawer.classList.add("open");
document.getElementById("drawer-close").onclick = () =>
  drawer.classList.remove("open");

/* ================= Accordion UI (MAVLink Viewer) ================= */
const drawerContent = document.getElementById("drawer-content");
const messageItems = {};

function createAccordion(type, data) {
  if (messageItems[type]) return;

  const item = document.createElement("div");
  item.className = "accordion-item";

  const h = document.createElement("div");
  h.className = "accordion-header";
  h.textContent = type;

  const b = document.createElement("div");
  b.className = "accordion-body";

  for (const k in data) {
    const val = data[k];
    let input;

    if (Array.isArray(val) || typeof val === "object") {
      input = document.createElement("textarea");
      input.value = JSON.stringify(val);
    } else if (typeof val === "number") {
      input = document.createElement("input");
      input.type = "number";
      input.value = val;
    } else if (typeof val === "string") {
      input = document.createElement("input");
      input.type = "text";
      input.value = val;
    } else if (typeof val === "boolean") {
      input = document.createElement("input");
      input.type = "checkbox";
      input.checked = val;
    }

    const tooltip = document.createElement("div");
    tooltip.className = "field-tooltip";
    tooltip.textContent = k;

    input.onmouseenter = () => (tooltip.style.display = "block");
    input.onmouseleave = () => (tooltip.style.display = "none");

    const wrapper = document.createElement("div");
    wrapper.style.position = "relative";
    wrapper.append(input, tooltip);
    b.appendChild(wrapper);
  }

  h.onclick = () => b.classList.toggle("open");
  item.append(h, b);
  drawerContent.appendChild(item);
  messageItems[type] = item;
}

/* ================= Add Condition Button ================= */

const addConditionBtn = document.getElementById("add-condition-btn");

if (addConditionBtn) {
  addConditionBtn.onclick = () => {
    window.open("./block.html", "_blank", "noopener");
  };
}

/* ================= Alert UI ================= */
const alertContainer = document.getElementById("alert-container");
let currentAlert = null;

function showAlert(message, type = "alert") {
  const existingToasts = Array.from(alertContainer.querySelectorAll('.alert-toast'));
  if (existingToasts.some(t => t.textContent === message)) {
    return;
  }
  
  if (currentAlert) {
    const old = currentAlert;
    setTimeout(() => {
      old.classList.remove("show");
      setTimeout(() => old.remove(), 300);
    }, 800);
  }

  const toast = document.createElement("div");
  toast.className = `alert-toast ${type}`;
  toast.textContent = message;
  alertContainer.appendChild(toast);
  currentAlert = toast;

  requestAnimationFrame(() => toast.classList.add("show"));

  if (type === "info") {
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        if (toast.parentNode) toast.remove();
        if (currentAlert === toast) currentAlert = null;
      }, 300);
    }, 3000);
  }
}

/* ================= Three.js Scene Setup ================= */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(3, 3, 3);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.GridHelper(10, 10));

const body = new THREE.Mesh(
  new THREE.BoxGeometry(0.6, 0.2, 0.6),
  new THREE.MeshStandardMaterial({ color: 0x00ff77, metalness: 0.5, roughness: 0.6 })
);
scene.add(body);

const propellers = [];
[[0.4,0,0.4],[0.4,0,-0.4],[-0.4,0,0.4],[-0.4,0,-0.4]].forEach(p=>{
  const prop = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15,0.15,0.02,16),
    new THREE.MeshStandardMaterial({color:0xffffff})
  );
  prop.rotation.x = Math.PI/2;
  prop.position.set(...p);
  body.add(prop);
  propellers.push(prop);
});

scene.add(new THREE.AmbientLight(0xffffff,0.5));
const directionalLight = new THREE.DirectionalLight(0xffffff,0.7);
directionalLight.position.set(5,10,7);
scene.add(directionalLight);

/* ================= MAVBuffer + Replay + Seek Handling ================= */
let mavBuffer=[], BUFFER_SECONDS=30, FPS=30, MAX_FRAMES=BUFFER_SECONDS*FPS;
let isSeeking=false, isAtLatest=true, currentIndex=0;
const alertTimeline = new Map();
const seekTrack = document.getElementById("seek-track");
const seekThumb = document.getElementById("seek-thumb");
const seekProgress = document.getElementById("seek-progress");
const timeLabel = document.getElementById("timeLabel");
const markerContainer = document.getElementById("seek-markers");

let isDragging = false;
let lastAlertIndex = -1; 

function updateSeekPosition(clientX) {
  const rect = seekTrack.getBoundingClientRect();
  const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
  const ratio = x / rect.width;
  const max = mavBuffer.length - 1;
  
  if (max <= 0) return;
  
  const newIndex = Math.round(ratio * max);
  
  if (newIndex !== lastAlertIndex) {
    const alerts = alertTimeline.get(newIndex);
    if (alerts) {
      alerts.forEach(a => showAlert(a.message, a.type));
    }
    lastAlertIndex = newIndex;
  }

  currentIndex = newIndex;
  isAtLatest = currentIndex >= max;
  applyFrame();
  updateSeekUI();
}

seekTrack.addEventListener("mousedown", (e) => {
  isDragging = true;
  isSeeking = true;
  updateSeekPosition(e.clientX);
});

document.addEventListener("mousemove", (e) => {
  if (isDragging) updateSeekPosition(e.clientX);
});

document.addEventListener("mouseup", () => {
  if (isDragging) {
    isDragging = false;
    isSeeking = false;
    if (currentIndex >= mavBuffer.length - 1) isAtLatest = true;
  }
});

function updateSeekUI() {
  const max = mavBuffer.length - 1;
  if (max <= 0) {
    seekThumb.style.left = "0%";
    seekProgress.style.width = "0%";
    return;
  }
  const percent = (currentIndex / max) * 100;
  seekThumb.style.left = `${percent}%`;
  seekProgress.style.width = `${percent}%`;
}

function updateDrawerFromFrame(frame){
  for(const msgType in frame.raw){
    createAccordion(msgType, frame.raw[msgType]);
    const item = messageItems[msgType];
    const inputs = item.querySelectorAll(".accordion-body input, .accordion-body textarea");
    let i=0;
    for(const key in frame.raw[msgType]){
      const val = frame.raw[msgType][key];
      const input = inputs[i++];
      if(!input || document.activeElement === input) continue;
      
      if(Array.isArray(val)){
        input.value = JSON.stringify(val);
      } else if(typeof val === "boolean"){
        input.checked = val;
      } else {
        input.value = val;
      }
    }
  }
}

let markerRenderScheduled = false;
function scheduleMarkerRender() {
  if (markerRenderScheduled) return;
  markerRenderScheduled = true;
  requestAnimationFrame(() => {
    renderAlertMarkers();
    markerRenderScheduled = false;
  });
}

function renderAlertMarkers() {
  markerContainer.innerHTML = "";
  const max = mavBuffer.length - 1;
  if (max <= 0) return;

  const fragment = document.createDocumentFragment();
  alertTimeline.forEach((alerts, index) => {
    const percent = (index / max) * 100;
    alerts.forEach((a) => {
      const marker = document.createElement("div");
      marker.className = `seek-marker ${a.type}`;
      marker.style.left = `${percent}%`;
      fragment.appendChild(marker);
    });
  });
  markerContainer.appendChild(fragment);
}

function applyFrame(frame){
  const f = frame || mavBuffer[currentIndex];
  if(!f) return;
  body.position.copy(f.position);
  body.rotation.copy(f.rotation);
  updateDrawerFromFrame(f);
  timeLabel.textContent = `${currentIndex} / ${mavBuffer.length-1}`;
  updateSeekUI();
}

/* ================= WebSocket ================= */
let socket, isArmed=false;
let startPos = new THREE.Vector3(), endPos = new THREE.Vector3(), tPos=1.0;
let startRot = new THREE.Euler(), endRot = new THREE.Euler(), tRot=1.0;
const moveDuration=0.5, rotDuration=0.5;
let lastFlowTime=null, flowPos=new THREE.Vector3();

try{ socket = new WebSocket("ws://localhost:5000/ws/events"); }catch(e){console.error(e);}
if(socket){
  socket.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    // Logic for condition evaluation results (alerts) is kept, 
    // but settings list management logic is removed.
    if (data.type === 'condition_result') {
      let msgValue, type, msg;
      if (typeof data.value === "boolean") {
        msgValue = data.value ? "Normalized" : "Anomaly Detected";
        type = data.value ? "clear" : "alert"; 
        msg = `${data.name} : ${msgValue}`;
      } else if (typeof data.value === "number") {
        msgValue = data.value.toFixed(3);
        type = "info"; 
        msg = `${data.name} : ${msgValue}`;
      } else {
        msgValue = String(data.value);
        type = data.notify ? "alert" : "info";
        msg = `${data.name} : ${msgValue}`;
      }
      showAlert(msg, type);

      if (mavBuffer.length) {
        const index = mavBuffer.length - 1;
        if (!alertTimeline.has(index)) alertTimeline.set(index, []);
        alertTimeline.get(index).push({ type, message: msg });
        scheduleMarkerRender();
      }
      return;
    }

    const shouldAddFrame = !isSeeking && isAtLatest;

    if(data.LOCAL_POSITION_NED){
      const pos = data.LOCAL_POSITION_NED;
      startPos.copy(body.position);
      endPos.set(pos.x || 0, body.position.y, pos.y || 0);
      tPos = 0;
    }
    if(data.OPTICAL_FLOW){
      const f = data.OPTICAL_FLOW;
      if(lastFlowTime !== null){
        const dt = (f.time_usec - lastFlowTime) / 1e6;
        flowPos.x += f.flow_comp_m_x * dt;
        flowPos.z -= f.flow_comp_m_y * dt;
      }
      lastFlowTime = f.time_usec;
      startPos.copy(body.position);
      endPos.set(flowPos.x, body.position.y, flowPos.z);
      tPos = 0;
    }
    if(data.DISTANCE_SENSOR){
      startPos.y = body.position.y;
      endPos.y = data.DISTANCE_SENSOR.current_distance / 10;
      tPos = 0;
    } else if(data.RANGEFINDER){
      startPos.y = body.position.y;
      endPos.y = data.RANGEFINDER.distance;
      tPos = 0;
    } else if(data.LOCAL_POSITION_NED && !data.DISTANCE_SENSOR && !data.RANGEFINDER){
      startPos.y = body.position.y;
      endPos.y = -data.LOCAL_POSITION_NED.z;
      tPos = 0;
    }
    if(data.ATTITUDE){
      const ori = data.ATTITUDE;
      startRot.copy(body.rotation);
      endRot.set(ori.pitch || 0, -(ori.yaw || 0), ori.roll || 0, 'XYZ');
      tRot = 0;
    }
    if(data.HEARTBEAT && typeof data.HEARTBEAT.base_mode === 'number'){
      isArmed = (data.HEARTBEAT.base_mode & 0x80) !== 0;
    }

    if(shouldAddFrame){
      mavBuffer.push({
        raw: data,
        position: body.position.clone(),
        rotation: body.rotation.clone(),
        t: performance.now() / 1000
      });
      if(mavBuffer.length > MAX_FRAMES){
        mavBuffer.shift();
        const newTimeline = new Map();
        alertTimeline.forEach((v, k) => { if(k > 0) newTimeline.set(k - 1, v); });
        alertTimeline.clear();
        newTimeline.forEach((v, k) => alertTimeline.set(k, v));
      }
      if(!isSeeking) currentIndex = mavBuffer.length - 1;
      applyFrame(mavBuffer.at(-1));
      scheduleMarkerRender();
    } else {
      applyFrame(mavBuffer[currentIndex]);
    }
  };
}

/* ================= Animation Loop ================= */
const dt = 1/60;
function animate(){
  requestAnimationFrame(animate);
  if(tPos < 1.0){
    tPos = Math.min(1.0, tPos + dt / moveDuration);
    body.position.lerpVectors(startPos, endPos, tPos);
  }
  if(tRot < 1.0){
    tRot = Math.min(1.0, tRot + dt / rotDuration);
    body.rotation.set(
      THREE.MathUtils.lerp(startRot.x, endRot.x, tRot),
      THREE.MathUtils.lerp(startRot.y, endRot.y, tRot),
      THREE.MathUtils.lerp(startRot.z, endRot.z, tRot)
    );
  }
  if(isArmed) propellers.forEach(p => p.rotation.z += 0.5);
  renderer.render(scene, camera);
}
animate();

/* ================= Resize ================= */
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  scheduleMarkerRender();
});