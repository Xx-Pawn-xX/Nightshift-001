
import * as THREE from 'three';
import { TRACK, createWorld } from './world.js';
import { createVehicle } from './vehicle.js';

// =============================================
// NIGHTSHIFT//LITE — GAME CONTROLLER
// =============================================

const $ = id => document.getElementById(id);

const root = $('world');

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    68,
    innerWidth / innerHeight,
    0.1,
    700
);

const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
});

renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

root.appendChild(renderer.domElement);

// Build world and vehicle
createWorld(scene);

const vehicle = createVehicle(scene, TRACK);
const car = vehicle.car;

const clock = new THREE.Clock();

const input = {
    gas: false,
    brake: false,
    left: false,
    right: false,
    drift: false,
    nitro: false
};

let started = false;
let paused = false;
let finished = false;

let raceTime = 0;
let progress = 0;
let previousAngle = 0;

let cameraShake = 0;
let smokeTimer = 0;
let countdownActive = false;

const cameraTarget = new THREE.Vector3();
const desiredCamera = new THREE.Vector3();

// =============================================
// INPUT
// =============================================

const keyMap = {
    KeyW: 'gas',
    ArrowUp: 'gas',
    KeyS: 'brake',
    ArrowDown: 'brake',
    KeyA: 'left',
    ArrowLeft: 'left',
    KeyD: 'right',
    ArrowRight: 'right',
    Space: 'drift',
    ShiftLeft: 'nitro',
    ShiftRight: 'nitro'
};

window.addEventListener('keydown', event => {
    const action = keyMap[event.code];

    if (action) {
        event.preventDefault();
        input[action] = true;
    }

    if (event.code === 'Escape' && started && !finished) {
        togglePause();
    }
});

window.addEventListener('keyup', event => {
    const action = keyMap[event.code];

    if (action) {
        event.preventDefault();
        input[action] = false;
    }
});

window.addEventListener('blur', () => {
    clearInput();
});

function clearInput() {
    Object.keys(input).forEach(key => {
        input[key] = false;
    });
}

document.querySelectorAll('[data-control]').forEach(button => {
    const action = button.dataset.control;

    const down = event => {
        event.preventDefault();

        if (paused || !started || finished) return;

        input[action] = true;
        button.classList.add('active');

        try {
            button.setPointerCapture(event.pointerId);
        } catch (_) {}
    };

    const up = event => {
        event.preventDefault();
        input[action] = false;
        button.classList.remove('active');
    };

    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('lostpointercapture', up);
});

// =============================================
// AUDIO SYSTEM
// =============================================

let audioContext;
let engineOscillator;
let engineGain;
let engineFilter;

function startAudio() {
    try {
        const AudioContextClass =
            window.AudioContext || window.webkitAudioContext;

        if (!AudioContextClass) return;

        if (audioContext) {
            audioContext.resume();
            return;
        }

        audioContext = new AudioContextClass();

        engineOscillator = audioContext.createOscillator();
        engineGain = audioContext.createGain();
        engineFilter = audioContext.createBiquadFilter();

        engineOscillator.type = 'sawtooth';
        engineOscillator.frequency.value = 45;

        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 250;

        engineGain.gain.value = 0.0001;

        engineOscillator.connect(engineFilter);
        engineFilter.connect(engineGain);
        engineGain.connect(audioContext.destination);

        engineOscillator.start();
    } catch (error) {
        console.warn('Audio unavailable:', error);
    }
}

function updateAudio() {
    if (!audioContext || !engineOscillator) return;

    const state = vehicle.state;

    const targetFrequency =
        42 + Math.abs(state.speed) * 2.4;

    engineOscillator.frequency.setTargetAtTime(
        targetFrequency,
        audioContext.currentTime,
        0.08
    );

    const volume = started && !paused && !finished
        ? 0.025 + Math.abs(state.speed) * 0.00035
        : 0.0001;

    engineGain.gain.setTargetAtTime(
        volume,
        audioContext.currentTime,
        0.1
    );

    engineFilter.frequency.setTargetAtTime(
        state.boosting ? 1000 : 400,
        audioContext.currentTime,
        0.1
    );
}

// =============================================
// PARTICLES
// =============================================

const particleMaterial = new THREE.MeshBasicMaterial({
    color: 0xb7d6e8,
    transparent: true,
    opacity: 0.32,
    depthWrite: false
});

const particles = [];

for (let i = 0; i < 35; i++) {
    const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 6, 6),
        particleMaterial.clone()
    );

    mesh.visible = false;
    scene.add(mesh);

    particles.push({
        mesh,
        life: 0,
        maxLife: 1
    });
}

let particleIndex = 0;

function spawnSmoke() {
    const state = vehicle.state;

    if (!state.drifting || Math.abs(state.speed) < 12) return;

    for (const side of [-1, 1]) {
        const p = particles[particleIndex];

        particleIndex = (particleIndex + 1) % particles.length;

        const offset = new THREE.Vector3(
            side * 0.9,
            0.35,
            1.35
        ).applyQuaternion(car.quaternion);

        p.mesh.position.copy(car.position).add(offset);

        p.mesh.scale.setScalar(0.5 + Math.random() * 0.5);
        p.mesh.visible = true;
        p.life = 0.65;
        p.maxLife = 0.65;
    }
}

function updateParticles(delta) {
    for (const p of particles) {
        if (!p.mesh.visible) continue;

        p.life -= delta;

        if (p.life <= 0) {
            p.mesh.visible = false;
            continue;
        }

        p.mesh.position.y += delta * 1.1;
        p.mesh.scale.multiplyScalar(1 + delta * 1.2);

        p.mesh.material.opacity =
            0.32 * p.life / p.maxLife;
    }
}

// =============================================
// CAMERA
// =============================================

function updateCamera(delta) {
    const state = vehicle.state;

    const speedFactor = Math.abs(state.speed) / 65;

    const offset = new THREE.Vector3(
        0,
        5.1 + speedFactor * 1.3,
        10.5 + speedFactor * 2.8
    );

    offset.applyQuaternion(car.quaternion);

    desiredCamera.copy(car.position).add(offset);

    if (state.boosting) {
        cameraShake = THREE.MathUtils.damp(
            cameraShake, 0.09, 5, delta
        );
    } else {
        cameraShake = THREE.MathUtils.damp(
            cameraShake, 0, 5, delta
        );
    }

    desiredCamera.x += (Math.random() - 0.5) * cameraShake;
    desiredCamera.y += (Math.random() - 0.5) * cameraShake;

    camera.position.lerp(
        desiredCamera,
        1 - Math.exp(-5 * delta)
    );

    cameraTarget.copy(car.position);
    cameraTarget.y += 1.0;

    camera.lookAt(cameraTarget);

    const targetFov = state.boosting
        ? 82
        : 68 + speedFactor * 6;

    camera.fov = THREE.MathUtils.damp(
        camera.fov, targetFov, 3, delta
    );

    camera.updateProjectionMatrix();
}

// =============================================
// RACE PROGRESS
// =============================================

function getTrackAngle() {
    return Math.atan2(
        car.position.z / TRACK.rz,
        car.position.x / TRACK.rx
    );
}

function updateRaceProgress() {
    const angle = getTrackAngle();

    let difference = angle - previousAngle;

    if (difference > Math.PI) difference -= Math.PI * 2;
    if (difference < -Math.PI) difference += Math.PI * 2;

    previousAngle = angle;

    if (
        vehicle.state.onRoad &&
        vehicle.state.speed > 1 &&
        difference > 0 &&
        difference < 0.15
    ) {
        progress += difference;
    }

    const lapProgress = progress / (Math.PI * 2);

    const lap = Math.min(
        TRACK.laps,
        Math.floor(lapProgress) + 1
    );

    const checkpoint = Math.min(
        4,
        Math.floor((lapProgress % 1) * 4) + 1
    );

    $('lap').innerHTML =
        String(lap).padStart(2, '0') + ' <span>/ 03</span>';

    $('checkpoint').innerHTML =
        String(checkpoint).padStart(2, '0') +
        ' <span>/ 04</span>';

    if (progress >= TRACK.laps * Math.PI * 2) {
        finishRace();
    }
}

// =============================================
// HUD
// =============================================

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const hundredths = Math.floor((seconds % 1) * 100);

    return (
        String(minutes).padStart(2, '0') + ':' +
        String(secs).padStart(2, '0') + '.' +
        String(hundredths).padStart(2, '0')
    );
}

function updateHUD() {
    const state = vehicle.state;

    const kmh = Math.round(Math.abs(state.speed) * 3.6);

    $('speed').textContent =
        String(kmh).padStart(3, '0');

    $('speed-fill').style.width =
        Math.min(kmh / 274 * 100, 100) + '%';

    $('nitro-fill').style.width =
        state.nitro + '%';

    $('nitro-percent').textContent =
        Math.round(state.nitro) + '%';

    const gear = state.speed < -0.5
        ? 'R'
        : state.speed < 1
            ? 'N'
            : Math.min(7, Math.ceil(state.speed / 9));

    $('gear').textContent = gear;

    $('driving-mode').textContent =
        state.boosting ? 'BOOST' :
        state.drifting ? 'DRIFT' :
        state.onRoad ? 'SPORT' : 'OFF ROAD';

    $('timer').textContent = formatTime(raceTime);
}

// =============================================
// MINIMAP
// =============================================

const map = $('minimap');
const ctx = map.getContext('2d');

function drawMinimap() {
    const w = map.width;
    const h = map.height;

    ctx.clearRect(0, 0, w, h);

    ctx.save();

    ctx.translate(w / 2, h / 2);

    ctx.beginPath();
    ctx.ellipse(0, 0, 69, 46, 0, 0, Math.PI * 2);

    ctx.strokeStyle = '#1b304b';
    ctx.lineWidth = 14;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(0, 0, 69, 46, 0, 0, Math.PI * 2);

    ctx.strokeStyle = '#00bfff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const x = car.position.x / TRACK.rx * 69;
    const z = car.position.z / TRACK.rz * 46;

    ctx.shadowBlur = 12;
    ctx.shadowColor = '#00dfff';

    ctx.beginPath();
    ctx.arc(x, z, 4, 0, Math.PI * 2);

    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.restore();
}

// =============================================
// TOAST
// =============================================

let toastTimeout;

function toast(message) {
    const element = $('toast');

    element.textContent = message;
    element.style.opacity = '1';

    clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
        element.style.opacity = '0';
    }, 1300);
}

// =============================================
// COUNTDOWN
// =============================================

function startCountdown() {
    if (countdownActive) return;

    countdownActive = true;

    const element = $('countdown');
    element.classList.remove('hidden');

    const sequence = ['3', '2', '1', 'GO!'];
    let index = 0;

    function next() {
        if (index >= sequence.length) {
            element.classList.add('hidden');
            started = true;
            countdownActive = false;
            return;
        }

        element.textContent = sequence[index];

        toast(sequence[index] === 'GO!'
            ? 'RACE START'
            : 'GET READY'
        );

        index++;

        setTimeout(next, 850);
    }

    next();
}

// =============================================
// PAUSE / FINISH / RESTART
// =============================================

function togglePause() {
    if (!started || finished) return;

    paused = !paused;

    clearInput();

    $('pause-button').textContent = paused ? '▶' : 'Ⅱ';

    toast(paused ? 'RACE PAUSED' : 'RACE RESUMED');
}

function finishRace() {
    if (finished) return;

    finished = true;
    started = false;

    clearInput();

    $('final-time').textContent = formatTime(raceTime);

    $('best-time').textContent =
        'NIGHT CITY CIRCUIT · 3 LAPS COMPLETE';

    $('finish-screen').classList.remove('hidden');

    toast('RACE COMPLETE');
}

$('pause-button').addEventListener('click', togglePause);

$('start-button').addEventListener('click', () => {
    $('start-screen').classList.add('hidden');

    startAudio();
    startCountdown();
});

$('restart-button').addEventListener('click', () => {
    location.reload();
});

// =============================================
// MAIN LOOP
// =============================================

function animate() {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.04);

    if (started && !paused && !finished) {
        raceTime += delta;

        vehicle.update(delta, input, TRACK);

        updateRaceProgress();

        smokeTimer += delta;

        if (smokeTimer > 0.055) {
            smokeTimer = 0;
            spawnSmoke();
        }

        updateParticles(delta);
        updateCamera(delta);
        updateHUD();
        drawMinimap();
        updateAudio();
    } else {
        updateParticles(delta);
        updateCamera(delta);
        drawMinimap();
        updateAudio();
    }

    renderer.render(scene, camera);
}

animate();

// =============================================
// RESIZE
// =============================================

window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(innerWidth, innerHeight);

    renderer.setPixelRatio(
        Math.min(devicePixelRatio, 1.5)
    );
});

// =============================================
// LOADING SCREEN
// =============================================

let loadingProgress = 0;

const loadingTimer = setInterval(() => {
    loadingProgress += 10;

    $('loading-fill').style.width =
        Math.min(loadingProgress, 100) + '%';

    if (loadingProgress >= 100) {
        clearInterval(loadingTimer);

        setTimeout(() => {
            const loading = $('loading');

            loading.style.opacity = '0';

            setTimeout(() => loading.remove(), 850);
        }, 300);
    }
}, 100);

console.log('NIGHTSHIFT//LITE v1.0');
console.log('3D WORLD: READY');
console.log('VEHICLE SYSTEM: READY');
console.log('RACING SYSTEM: READY');
console.log('NITRO SYSTEM: READY');
