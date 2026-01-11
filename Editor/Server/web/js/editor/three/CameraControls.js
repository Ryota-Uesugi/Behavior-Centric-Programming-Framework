import * as THREE from './three.module.js';

export function setupControls(camera, domElement, transformControlManager = null, scene = null) {
  let isRightMouseDown = false;
  let isLeftMouseDown = false;
  let prevMouse = { x: 0, y: 0 };

  let pitch = 0;
  let yaw = 0;

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  const initialPosition = camera.position.clone();
  yaw = camera.rotation.y;
  pitch = camera.rotation.x;
  const initialYaw = yaw;
  const initialPitch = pitch;

  domElement.addEventListener('mousedown', (e) => {
    if (transformControlManager?.isDragging) return;

    prevMouse.x = e.clientX;
    prevMouse.y = e.clientY;

    if (e.button === 0) isRightMouseDown = true;
    if (e.button === 2) isLeftMouseDown = true;

    // オブジェクト選択処理（TransformControls用）
    if (e.button === 0 && transformControlManager && scene) {
      const rect = domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      if (intersects.length > 0) {
        transformControlManager.attach(intersects[0].object);
      }
    }
  });

  domElement.addEventListener('mouseup', (e) => {
    if (e.button === 0) isRightMouseDown = false;
    if (e.button === 2) isLeftMouseDown = false;
  });

  domElement.addEventListener('mousemove', (e) => {
    if (transformControlManager?.isDragging) return;

    const dx = e.clientX - prevMouse.x;
    const dy = e.clientY - prevMouse.y;

    if (isLeftMouseDown) {
      const sensitivity = 0.005;
      yaw -= dx * sensitivity;
      pitch -= dy * sensitivity;

      const maxPitch = Math.PI / 2 - 0.01;
      const minPitch = -Math.PI / 2 + 0.01;
      pitch = Math.max(minPitch, Math.min(maxPitch, pitch));

      camera.rotation.order = 'YXZ';
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
    }

    if (isRightMouseDown) {
      const moveSpeed = 0.05;

      if (e.shiftKey) {
        camera.position.y += -dy * moveSpeed;
      } else {
        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);
        direction.y = 0;
        direction.normalize();

        const up = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(direction, up).normalize();

        camera.position.add(direction.clone().multiplyScalar(-dy * moveSpeed));
        camera.position.add(right.clone().multiplyScalar(-dx * moveSpeed));
      }
    }

    prevMouse.x = e.clientX;
    prevMouse.y = e.clientY;
  });

  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r' && e.shiftKey) {
      camera.position.copy(initialPosition);
      yaw = initialYaw;
      pitch = initialPitch;
      camera.rotation.order = 'YXZ';
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
      camera.rotation.z = 0;
    }
  });

  domElement.addEventListener('wheel', (e) => {
    if (transformControlManager?.isDragging) return;

    e.preventDefault();

    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);

    const zoomSpeed = 2;
    camera.position.add(direction.multiplyScalar(e.deltaY * -0.01 * zoomSpeed));
  }, { passive: false });
}
