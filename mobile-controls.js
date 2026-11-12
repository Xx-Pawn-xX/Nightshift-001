const controls = {
    orientationEnabled: false,
    orientationSteer: 0,
    maxSpeed: 358
};
window.nightshiftControls = controls;

const orientationButton = document.getElementById('orientation-button');
const speedSlider = document.getElementById('speed-limit-slider');
const speedValue = document.getElementById('speed-limit-value');
let orientationBaseline = null;

try {
    const savedSpeed = Number(localStorage.getItem('nightshift_max_speed'));
    if (Number.isFinite(savedSpeed) && savedSpeed >= 100 && savedSpeed <= 700) {
        controls.maxSpeed = savedSpeed;
    }
} catch {}

function renderSpeedLimit() {
    if (speedSlider) speedSlider.value = String(controls.maxSpeed);
    if (speedValue) speedValue.value = String(controls.maxSpeed);
    if (speedValue) speedValue.textContent = String(controls.maxSpeed);
}
renderSpeedLimit();

speedSlider?.addEventListener('input', () => {
    controls.maxSpeed = Number(speedSlider.value);
    renderSpeedLimit();
    try {
        localStorage.setItem('nightshift_max_speed', String(controls.maxSpeed));
    } catch {}
});

function setOrientationEnabled(enabled) {
    controls.orientationEnabled = enabled;
    controls.orientationSteer = 0;
    orientationBaseline = null;
    orientationButton?.classList.toggle('active', enabled);
    orientationButton?.setAttribute('aria-pressed', String(enabled));
    if (orientationButton) orientationButton.textContent = enabled ? 'TILT: ON' : 'TILT: OFF';
}

function handleOrientation(event) {
    if (!controls.orientationEnabled || !Number.isFinite(event.gamma)) return;
    if (orientationBaseline === null) {
        orientationBaseline = event.gamma;
        return;
    }
    // Calibrate against the phone's position when tilt steering is enabled.
    controls.orientationSteer = Math.max(-1, Math.min(1, (event.gamma - orientationBaseline) / 25));
}

window.addEventListener('deviceorientation', handleOrientation);

orientationButton?.addEventListener('click', async () => {
    if (controls.orientationEnabled) {
        setOrientationEnabled(false);
        return;
    }

    const orientationApi = window.DeviceOrientationEvent;
    if (!orientationApi) {
        orientationButton.textContent = 'TILT UNAVAILABLE';
        return;
    }

    try {
        if (typeof orientationApi.requestPermission === 'function') {
            const permission = await orientationApi.requestPermission();
            if (permission !== 'granted') {
                orientationButton.textContent = 'TILT DENIED';
                return;
            }
        }
        setOrientationEnabled(true);
    } catch (error) {
        console.warn('Orientation permission unavailable:', error);
        orientationButton.textContent = 'TILT UNAVAILABLE';
    }
});
