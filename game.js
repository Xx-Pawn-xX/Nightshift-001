
import * as THREE from 'three';
import { createWorld } from './world.js';
import { createVehicle } from './vehicle.js';

const $ = id => document.getElementById(id);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050812);
scene.fog = new THREE.FogExp2(0x07101e, 0.0018);

const camera = new THREE.PerspectiveCamera(
    68,
    innerWidth / innerHeight,
    0.1,
    1200
);

const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance'
});

renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = false;

$('world').appendChild(renderer.domElement);

// --------------------------------------------------
// LIGHTING
// --------------------------------------------------

scene.add(new THREE.HemisphereLight(
    0x7899cc,
    0x080b18,
    1.5
));

const moonLight = new THREE.DirectionalLight(
    0x9dbbff,
    1.0
);

moonLight.position.set(-80, 150, 80);
moonLight.castShadow = false;
scene.add(moonLight);

// --------------------------------------------------
// WORLD + VEHICLE
// --------------------------------------------------

const { track } = createWorld(scene);
const vehicle = createVehicle(scene, track);

// --------------------------------------------------
// GAME STATE
// --------------------------------------------------

let running = false;
let paused = false;
let elapsed = 0;
let distance = 0;
let lastTime = 0;
let countdown = 3;
let countdownActive = false;

const input = {
    left: false,
    right: false,
    gas: false,
    brake: false,
    drift: false,
    nitro: false
};

let bestTime = Number(localStorage.getItem('nightshift_best') || 0);

// --------------------------------------------------
// PARTICLES — SMALL PERFORMANCE-FRIENDLY POOL
// --------------------------------------------------

const PARTICLE_COUNT = 18;
const particles = [];

const particleGeometry = new THREE.SphereGeometry(0.11, 5, 5);
const particleMaterial = new THREE.MeshBasicMaterial({
    color: 0x8aaaff,
    transparent: true,
    opacity: 0.55
});

for (let i = 0; i < PARTICLE_COUNT; i++) {
    const mesh = new THREE.Mesh(
        particleGeometry,
        particleMaterial
    );

    mesh.visible = false;
    scene.add(mesh);

    particles.push({
        mesh,
        velocity: new THREE.Vector3(),
        life: 0
    });
}

let particleIndex = 0;

function emitSmoke(position) {
    const particle = particles[particleIndex];

    particleIndex = (particleIndex + 1) % PARTICLE_COUNT;

    particle.mesh.position.copy(position);
    particle.mesh.position.y += 0.3;

    particle.velocity.set(
        (Math.random() - 0.5) * 1.2,
        Math.random() * 0.7,
        Math.random() * 1.2
    );

    particle.life = 0.65;
    particle.mesh.visible = true;
}

function updateParticles(delta) {
    for (const particle of particles) {
        if (particle.life <= 0) continue;

        particle.life -= delta;

        particle.mesh.position.addScaledVector(
            particle.velocity,
            delta
        );

        particle.mesh.scale.multiplyScalar(1 + delta * 1.1);

        if (particle.life <= 0) {
            particle.mesh.visible = false;
            particle.mesh.scale.setScalar(1);
        }
    }
}

// --------------------------------------------------
// AUDIO
// --------------------------------------------------

let audioContext = null;
let engineOscillator = null;
let engineGain = null;

function startAudio() {
    if (audioContext) {
        audioContext.resume();
        return;
    }

    try {
        audioContext = new (
            window.AudioContext || window.webkitAudioContext
        )();

        engineOscillator = audioContext.createOscillator();
        engineGain = audioContext.createGain();

        engineOscillator.type = 'sawtooth';
        engineOscillator.frequency.value = 55;
        engineGain.gain.value = 0.025;

        engineOscillator.connect(engineGain);
        engineGain.connect(audioContext.destination);

        engineOscillator.start();
    } catch (error) {
        console.warn('Audio unavailable:', error);
    }
}

function updateAudio(speed) {
    if (!audioContext || !engineOscillator) return;

    engineOscillator.frequency.setTargetAtTime(
        45 + speed * 2.2,
        audioContext.currentTime,
        0.08
    );
}

// --------------------------------------------------
// INPUT
// --------------------------------------------------

function setInput(key, value) {
    if (key in input) input[key] = value;
}

window.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();

    if (key === 'arrowleft' || key === 'a') setInput('left', true);
    if (key === 'arrowright' || key === 'd') setInput('right', true);
    if (key === 'arrowup' || key === 'w') setInput('gas', true);
    if (key === 'arrowdown' || key === 's') setInput('brake', true);
    if (key === ' ') setInput('drift', true);
    if (key === 'shift') setInput('nitro', true);
});

window.addEventListener('keyup', event => {
    const key = event.key.toLowerCase();

    if (key === 'arrowleft' || key === 'a') setInput('left', false);
    if (key === 'arrowright' || key === 'd') setInput('right', false);
    if (key === 'arrowup' || key === 'w') setInput('gas', false);
    if (key === 'arrowdown' || key === 's') setInput('brake', false);
    if (key === ' ') setInput('drift', false);
    if (key === 'shift') setInput('nitro', false);
});

// Touch controls
document.querySelectorAll('[data-control]').forEach(button => {
    const control = button.dataset.control;

    const press = event => {
        event.preventDefault();
        setInput(control, true);
        button.classList.add('active');

        if (button.setPointerCapture && event.pointerId !== undefined) {
            try {
                button.setPointerCapture(event.pointerId);
            } catch {}
        }
    };

    const release = event => {
        event.preventDefault();
        setInput(control, false);
        button.classList.remove('active');
    };

    button.addEventListener('pointerdown', press, { passive: false });
    button.addEventListener('pointerup', release, { passive: false });
    button.addEventListener('pointercancel', release, { passive: false });
    button.addEventListener('lostpointercapture', release);
});

window.addEventListener('blur', () => {
    Object.keys(input).forEach(key => input[key] = false);
});

// --------------------------------------------------
// CAMERA
// --------------------------------------------------

const cameraOffset = new THREE.Vector3(0, 5.1, 10.5);
const cameraTarget = new THREE.Vector3();

function updateCamera(delta) {
    const car = vehicle.car || vehicle.mesh || vehicle;

    const targetPosition = cameraOffset
        .clone()
        .applyQuaternion(car.quaternion)
        .add(car.position);

    camera.position.lerp(
        targetPosition,
        1 - Math.pow(0.001, delta)
    );

    cameraTarget.copy(car.position);
    cameraTarget.y += 1.2;

    camera.lookAt(cameraTarget);
}

// --------------------------------------------------
// HUD
// --------------------------------------------------

let hudTimer = 0;

function updateHUD(speed) {
    hudTimer += 1;

    // Update text less frequently to reduce layout work.
    if (hudTimer % 4 !== 0) return;

    if ($('speed')) $('speed').textContent = Math.round(speed);
    if ($('gear')) $('gear').textContent = speed < 5 ? '1' : String(
        Math.min(6, Math.floor(speed / 35) + 1)
    );

    if ($('lap')) {
        $('lap').textContent = (distance / 1000).toFixed(2) + ' KM';
    }

    if ($('checkpoint')) {
        $('checkpoint').textContent =
            vehicle.onRoad === false ? 'OFF ROAD' : 'HIGHWAY';
    }

    if ($('speed-fill')) {
        $('speed-fill').style.width =
            Math.min(100, speed / 220 * 100) + '%';
    }

    if ($('nitro-fill')) {
        const nitro = vehicle.nitro ?? 100;
        $('nitro-fill').style.width = nitro + '%';
    }

    if ($('nitro-percent')) {
        $('nitro-percent').textContent =
            Math.round(vehicle.nitro ?? 100) + '%';
    }

    if ($('timer')) {
        $('timer').textContent = formatTime(elapsed);
    }

    if ($('driving-mode')) {
        $('driving-mode').textContent =
            input.drift ? 'DRIFT' :
            input.nitro ? 'NITRO' : 'CRUISE';
    }
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(2);

    return String(minutes).padStart(2, '0') + ':' +
        String(secs).padStart(5, '0');
}

// --------------------------------------------------
// MINIMAP
// --------------------------------------------------

const minimap = $('minimap');

if (minimap) {
    minimap.width = 120;
    minimap.height = 180;
}

const mapCtx = minimap?.getContext('2d');

function drawMinimap() {
    if (!mapCtx) return;

    mapCtx.clearRect(0, 0, 120, 180);

    mapCtx.fillStyle = '#07101d';
    mapCtx.fillRect(0, 0, 120, 180);

    mapCtx.strokeStyle = '#263d5a';
    mapCtx.lineWidth = 30;
    mapCtx.beginPath();
    mapCtx.moveTo(60, 0);
    mapCtx.lineTo(60, 180);
    mapCtx.stroke();

    mapCtx.strokeStyle = '#7aaaff';
    mapCtx.lineWidth = 1;
    mapCtx.setLineDash([8, 8]);
    mapCtx.beginPath();
    mapCtx.moveTo(60, 0);
    mapCtx.lineTo(60, 180);
    mapCtx.stroke();
    mapCtx.setLineDash([]);

    mapCtx.fillStyle = '#ffffff';
    mapCtx.beginPath();
    mapCtx.arc(60, 125, 5, 0, Math.PI * 2);
    mapCtx.fill();
}

// --------------------------------------------------
// GAME FLOW
// --------------------------------------------------

function startGame() {
    if (running) return;

    running = true;
    paused = false;
    elapsed = 0;
    distance = 0;
    countdown = 3;
    countdownActive = true;

    startAudio();

    if ($('start-screen')) $('start-screen').classList.add('hidden');
    if ($('finish-screen')) $('finish-screen').classList.add('hidden');
    if ($('countdown')) $('countdown').classList.remove('hidden');

    lastTime = performance.now();
}

function pauseGame() {
    if (!running) return;

    paused = !paused;

    if ($('pause-button')) {
        $('pause-button').textContent = paused ? 'RESUME' : 'PAUSE';
    }
}

function finishGame() {
    running = false;
    paused = false;

    if ($('final-time')) $('final-time').textContent = formatTime(elapsed);

    if (!bestTime || elapsed < bestTime) {
        bestTime = elapsed;
        localStorage.setItem('nightshift_best', bestTime);
    }

    if ($('best-time')) {
        $('best-time').textContent = formatTime(bestTime);
    }

    if ($('finish-screen')) $('finish-screen').classList.remove('hidden');
}

$('start-button')?.addEventListener('click', startGame);
$('restart-button')?.addEventListener('click', () => {
    location.reload();
});
$('pause-button')?.addEventListener('click', pauseGame);

// --------------------------------------------------
// MAIN LOOP
// --------------------------------------------------

function animate(now) {
    requestAnimationFrame(animate);

    let delta = (now - lastTime) / 1000;
    lastTime = now;

    // Prevent huge physics jumps after a background pause.
    delta = Math.min(delta, 0.04);

    if (running && !paused) {
        if (countdownActive) {
            countdown -= delta;

            if ($('countdown')) {
                $('countdown').textContent =
                    Math.max(1, Math.ceil(countdown));
            }

            if (countdown <= 0) {
                countdownActive = false;
                if ($('countdown')) $('countdown').classList.add('hidden');
            }
        } else {
            elapsed += delta;

            const previousPosition = vehicle.car
                ? vehicle.car.position.clone()
                : null;

            vehicle.update(delta, input);

            const car = vehicle.car || vehicle.mesh || vehicle;

            if (previousPosition && car.position) {
                distance += previousPosition.distanceTo(car.position);
            }

            const speed = vehicle.speed || 0;

            updateAudio(speed);
            updateHUD(speed);

            if (input.drift && Math.random() < 0.22) {
                const smokePosition = car.position.clone();
                smokePosition.x += (Math.random() - 0.5) * 2;
                emitSmoke(smokePosition);
            }
        }
    }

    updateParticles(delta);
    updateCamera(delta);
    drawMinimap();

    renderer.render(scene, camera);
}

requestAnimationFrame(animate);

// --------------------------------------------------
// RESIZE
// --------------------------------------------------

window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();

    renderer.setPixelRatio(1);
    renderer.setSize(innerWidth, innerHeight);
});

// --------------------------------------------------
// VISIBILITY
// --------------------------------------------------

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        Object.keys(input).forEach(key => input[key] = false);
        if (audioContext) audioContext.suspend();
    }
});
