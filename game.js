
import * as THREE from 'three';
import { createWorld } from './world.js';
import { createVehicle } from './vehicle.js';

const $ = id => document.getElementById(id);

// --------------------------------------------------
// DOM CACHE
// --------------------------------------------------

const ui = {
    world: $('world'),
    speed: $('speed'),
    gear: $('gear'),
    lap: $('lap'),
    checkpoint: $('checkpoint'),
    speedFill: $('speed-fill'),
    nitroFill: $('nitro-fill'),
    nitroPercent: $('nitro-percent'),
    timer: $('timer'),
    drivingMode: $('driving-mode'),
    minimap: $('minimap'),
    startScreen: $('start-screen'),
    finishScreen: $('finish-screen'),
    countdown: $('countdown'),
    pauseButton: $('pause-button'),
    startButton: $('start-button'),
    restartButton: $('restart-button'),
    finalTime: $('final-time'),
    bestTime: $('best-time')
};

// --------------------------------------------------
// RENDERER
// --------------------------------------------------

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050812);
scene.fog = new THREE.FogExp2(0x07101e, 0.0018);

const camera = new THREE.PerspectiveCamera(
    68,
    innerWidth / innerHeight,
    0.1,
    1000
);

const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true
});

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = false;

let renderScale = 0.85;

function resizeRenderer() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();

    renderer.setPixelRatio(renderScale);
    renderer.setSize(innerWidth, innerHeight);
}

resizeRenderer();
ui.world.appendChild(renderer.domElement);

// --------------------------------------------------
// LIGHTING
// --------------------------------------------------

scene.add(new THREE.HemisphereLight(
    0x7899cc,
    0x080b18,
    1.35
));

const moonLight = new THREE.DirectionalLight(
    0x9dbbff,
    0.75
);

moonLight.position.set(-80, 150, 80);
scene.add(moonLight);

// --------------------------------------------------
// WORLD + VEHICLE
// --------------------------------------------------

const { track } = createWorld(scene);
const vehicle = createVehicle(scene, track);

const getCar = () => vehicle.car || vehicle.mesh || vehicle;

// --------------------------------------------------
// GAME STATE
// --------------------------------------------------

let running = false;
let paused = false;
let elapsed = 0;
let distance = 0;
let lastTime = performance.now();

let countdown = 3;
let countdownActive = false;

let hudAccumulator = 0;
let minimapAccumulator = 0;
let smokeAccumulator = 0;

const input = {
    left: false,
    right: false,
    gas: false,
    brake: false,
    drift: false,
    nitro: false
};

let bestTime = 0;

try {
    bestTime = Number(
        localStorage.getItem('nightshift_best') || 0
    );
} catch {}

const previousPosition = new THREE.Vector3();

// --------------------------------------------------
// PARTICLE SYSTEM
// --------------------------------------------------

const PARTICLE_COUNT = 10;
const particles = [];

const particleGeometry = new THREE.SphereGeometry(
    0.11, 4, 4
);

const particleMaterial = new THREE.MeshBasicMaterial({
    color: 0x8aaaff,
    transparent: true,
    opacity: 0.45,
    depthWrite: false
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
        (Math.random() - 0.5) * 0.8,
        Math.random() * 0.5,
        Math.random() * 0.8
    );

    particle.life = 0.55;
    particle.mesh.visible = true;
    particle.mesh.scale.setScalar(1);
}

function updateParticles(delta) {
    for (const particle of particles) {
        if (particle.life <= 0) continue;

        particle.life -= delta;

        particle.mesh.position.addScaledVector(
            particle.velocity,
            delta
        );

        const scale = Math.max(
            0.1,
            particle.life / 0.55
        );

        particle.mesh.scale.setScalar(scale);

        if (particle.life <= 0) {
            particle.mesh.visible = false;
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
            window.AudioContext ||
            window.webkitAudioContext
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
        0.1
    );
}

// --------------------------------------------------
// INPUT
// --------------------------------------------------

function setInput(key, value) {
    if (key in input) {
        input[key] = value;
    }
}

window.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();

    if (key.startsWith('arrow') || key === ' ') {
        event.preventDefault();
    }

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

        if (button.setPointerCapture) {
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

    button.addEventListener('pointerdown', press, {
        passive: false
    });

    button.addEventListener('pointerup', release, {
        passive: false
    });

    button.addEventListener('pointercancel', release, {
        passive: false
    });

    button.addEventListener('lostpointercapture', release);
});

function clearInput() {
    Object.keys(input).forEach(key => {
        input[key] = false;
    });

    document.querySelectorAll('[data-control]').forEach(button => {
        button.classList.remove('active');
    });
}

window.addEventListener('blur', clearInput);

// --------------------------------------------------
// CAMERA
// --------------------------------------------------

const baseCameraOffset = new THREE.Vector3(0, 5.1, 10.5);
const cameraOffset = new THREE.Vector3();
const cameraTarget = new THREE.Vector3();

function updateCamera(delta) {
    const car = getCar();

    cameraOffset
        .copy(baseCameraOffset)
        .applyQuaternion(car.quaternion);

    cameraOffset.add(car.position);

    camera.position.lerp(
        cameraOffset,
        1 - Math.pow(0.001, delta)
    );

    cameraTarget.copy(car.position);
    cameraTarget.y += 1.2;

    camera.lookAt(cameraTarget);
}

// --------------------------------------------------
// HUD
// --------------------------------------------------

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(2);

    return String(minutes).padStart(2, '0') + ':' +
        String(secs).padStart(5, '0');
}

function updateHUD(speed) {
    if (ui.speed) {
        ui.speed.textContent = Math.round(speed);
    }

    if (ui.gear) {
        ui.gear.textContent = speed < 5
            ? '1'
            : String(Math.min(6, Math.floor(speed / 35) + 1));
    }

    if (ui.lap) {
        ui.lap.textContent = (distance / 1000).toFixed(2) + ' KM';
    }

    if (ui.checkpoint) {
        ui.checkpoint.textContent =
            vehicle.onRoad === false ? 'OFF ROAD' : 'HIGHWAY';
    }

    if (ui.speedFill) {
        ui.speedFill.style.width =
            Math.min(100, speed / 220 * 100) + '%';
    }

    const nitro = vehicle.nitro ?? 100;

    if (ui.nitroFill) {
        ui.nitroFill.style.width = nitro + '%';
    }

    if (ui.nitroPercent) {
        ui.nitroPercent.textContent = Math.round(nitro) + '%';
    }

    if (ui.timer) {
        ui.timer.textContent = formatTime(elapsed);
    }

    if (ui.drivingMode) {
        ui.drivingMode.textContent =
            input.drift ? 'DRIFT' :
            input.nitro ? 'NITRO' : 'CRUISE';
    }
}

// --------------------------------------------------
// MINIMAP
// --------------------------------------------------

const minimap = ui.minimap;

if (minimap) {
    minimap.width = 120;
    minimap.height = 180;
}

const mapCtx = minimap?.getContext('2d');

function drawMinimap() {
    if (!mapCtx) return;

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

    smokeAccumulator = 0;
    hudAccumulator = 0;

    previousPosition.copy(getCar().position);

    startAudio();

    ui.startScreen?.classList.add('hidden');
    ui.finishScreen?.classList.add('hidden');
    ui.countdown?.classList.remove('hidden');

    lastTime = performance.now();
}

function pauseGame() {
    if (!running) return;

    paused = !paused;

    clearInput();

    if (ui.pauseButton) {
        ui.pauseButton.textContent = paused ? 'RESUME' : 'PAUSE';
    }

    lastTime = performance.now();
}

function finishGame() {
    running = false;
    paused = false;

    clearInput();

    if (ui.finalTime) {
        ui.finalTime.textContent = formatTime(elapsed);
    }

    if (!bestTime || elapsed < bestTime) {
        bestTime = elapsed;

        try {
            localStorage.setItem('nightshift_best', bestTime);
        } catch {}
    }

    if (ui.bestTime) {
        ui.bestTime.textContent = formatTime(bestTime);
    }

    ui.finishScreen?.classList.remove('hidden');
}

ui.startButton?.addEventListener('click', startGame);

ui.restartButton?.addEventListener('click', () => {
    location.reload();
});

ui.pauseButton?.addEventListener('click', pauseGame);

// --------------------------------------------------
// ADAPTIVE PERFORMANCE
// --------------------------------------------------

let performanceTimer = 0;
let performanceFrames = 0;
let performanceTime = 0;

function updatePerformance(delta) {
    performanceTimer += delta;
    performanceFrames++;

    if (performanceTimer < 2) return;

    const averageFrameTime =
        performanceTimer / performanceFrames;

    let changed = false;

    if (averageFrameTime > 0.023 && renderScale > 0.65) {
        renderScale = Math.max(0.65, renderScale - 0.1);
        changed = true;
    }

    if (averageFrameTime < 0.016 && renderScale < 0.9) {
        renderScale = Math.min(0.9, renderScale + 0.05);
        changed = true;
    }

    if (changed) {
        renderer.setPixelRatio(renderScale);
        renderer.setSize(innerWidth, innerHeight);
    }

    performanceTimer = 0;
    performanceFrames = 0;
}

// --------------------------------------------------
// MAIN LOOP
// --------------------------------------------------

function animate(now) {
    requestAnimationFrame(animate);

    if (document.hidden) return;

    let delta = (now - lastTime) / 1000;
    lastTime = now;

    delta = Math.min(delta, 0.04);

    if (running && !paused) {
        if (countdownActive) {
            countdown -= delta;

            if (ui.countdown) {
                ui.countdown.textContent =
                    Math.max(1, Math.ceil(countdown));
            }

            if (countdown <= 0) {
                countdownActive = false;
                ui.countdown?.classList.add('hidden');
            }
        } else {
            elapsed += delta;

            const car = getCar();

            vehicle.update(delta, input);

            const dx = car.position.x - previousPosition.x;
            const dy = car.position.y - previousPosition.y;
            const dz = car.position.z - previousPosition.z;

            distance += Math.sqrt(
                dx * dx + dy * dy + dz * dz
            );

            previousPosition.copy(car.position);

            const speed = vehicle.speed || 0;

            hudAccumulator += delta;

            if (hudAccumulator >= 0.08) {
                updateHUD(speed);
                updateAudio(speed);
                hudAccumulator = 0;
            }

            if (input.drift) {
                smokeAccumulator += delta;

                if (smokeAccumulator >= 0.12) {
                    smokeAccumulator = 0;

                    const smokePosition = car.position.clone();
                    smokePosition.x +=
                        (Math.random() - 0.5) * 2;

                    emitSmoke(smokePosition);
                }
            } else {
                smokeAccumulator = 0;
            }
        }
    }

    updateParticles(delta);
    updateCamera(delta);

    minimapAccumulator += delta;

    if (minimapAccumulator >= 0.1) {
        drawMinimap();
        minimapAccumulator = 0;
    }

    updatePerformance(delta);

    renderer.render(scene, camera);
}

requestAnimationFrame(animate);

// --------------------------------------------------
// RESIZE
// --------------------------------------------------

window.addEventListener('resize', resizeRenderer);

// --------------------------------------------------
// VISIBILITY
// --------------------------------------------------

document.addEventListener('visibilitychange', () => {
    clearInput();

    lastTime = performance.now();

    if (document.hidden) {
        audioContext?.suspend();
    } else if (running && !paused) {
        audioContext?.resume();
    }
});
