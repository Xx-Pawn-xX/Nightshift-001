
import * as THREE from 'three';

// NIGHTSHIFT//LITE — OPTIMIZED VEHICLE SYSTEM

export function createVehicle(scene, track) {

    // --------------------------------------------------
    // CAR
    // --------------------------------------------------

    const car = new THREE.Group();
    scene.add(car);

    const paint = new THREE.MeshStandardMaterial({
        color: 0x064b80,
        metalness: 0.65,
        roughness: 0.3
    });

    const dark = new THREE.MeshStandardMaterial({
        color: 0x08111f,
        metalness: 0.5,
        roughness: 0.35
    });

    const rubber = new THREE.MeshStandardMaterial({
        color: 0x08090d,
        roughness: 0.95
    });

    const blue = new THREE.MeshBasicMaterial({
        color: 0x00caff
    });

    const red = new THREE.MeshStandardMaterial({
        color: 0xff174d,
        emissive: 0xff0033,
        emissiveIntensity: 3
    });

    // --------------------------------------------------
    // GEOMETRY CACHE
    // --------------------------------------------------

    const boxCache = new Map();

    function getBoxGeometry(size) {
        const key = size.join(',');

        if (!boxCache.has(key)) {
            boxCache.set(
                key,
                new THREE.BoxGeometry(...size)
            );
        }

        return boxCache.get(key);
    }

    function box(parent, size, position, material) {
        const mesh = new THREE.Mesh(
            getBoxGeometry(size),
            material
        );

        mesh.position.set(...position);

        // Shadows disabled for mobile performance.
        mesh.castShadow = false;
        mesh.receiveShadow = false;

        parent.add(mesh);

        return mesh;
    }

    // --------------------------------------------------
    // BODY
    // --------------------------------------------------

    box(car, [2.1, 0.55, 4.5], [0, 0.8, 0], paint);
    box(car, [2.2, 0.22, 3.9], [0, 0.55, 0], dark);
    box(car, [1.9, 0.18, 1.3], [0, 1.12, -1.42], paint);

    const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.55, 0.62, 1.9),
        dark
    );

    cabin.position.set(0, 1.35, 0);
    car.add(cabin);

    box(car, [1.5, 0.1, 1.45], [0, 1.68, 0], paint);
    box(car, [2.2, 0.12, 0.35], [0, 0.49, -2.2], dark);

    box(car, [2.3, 0.13, 0.38], [0, 1.55, 1.95], paint);
    box(car, [0.12, 0.32, 0.12], [-0.65, 1.36, 1.95], dark);
    box(car, [0.12, 0.32, 0.12], [0.65, 1.36, 1.95], dark);

    // --------------------------------------------------
    // LIGHTS
    // --------------------------------------------------

    box(car, [0.55, 0.12, 0.08], [-0.66, 0.97, -2.26], blue);
    box(car, [0.55, 0.12, 0.08], [0.66, 0.97, -2.26], blue);

    box(car, [0.57, 0.13, 0.08], [-0.66, 0.95, 2.27], red);
    box(car, [0.57, 0.13, 0.08], [0.66, 0.95, 2.27], red);

    // Lightweight underbody neon strip.
    box(
        car,
        [1.6, 0.035, 2.8],
        [0, 0.48, 0],
        blue
    );

    // --------------------------------------------------
    // WHEELS
    // --------------------------------------------------

    const wheels = [];

    const wheelGeometry = new THREE.CylinderGeometry(
        0.46, 0.46, 0.33, 12
    );

    const rimGeometry = new THREE.CylinderGeometry(
        0.23, 0.23, 0.35, 10
    );

    for (const x of [-1.05, 1.05]) {
        for (const z of [-1.42, 1.42]) {

            const pivot = new THREE.Group();

            pivot.position.set(x, 0.48, z);
            car.add(pivot);

            const wheel = new THREE.Mesh(
                wheelGeometry,
                rubber
            );

            wheel.rotation.z = Math.PI / 2;
            pivot.add(wheel);

            const rim = new THREE.Mesh(
                rimGeometry,
                blue
            );

            rim.rotation.z = Math.PI / 2;
            pivot.add(rim);

            wheels.push({
                pivot,
                wheel,
                front: z < 0
            });
        }
    }

    // --------------------------------------------------
    // EXHAUST
    // --------------------------------------------------

    const exhaustMat = new THREE.MeshBasicMaterial({
        color: 0x39dfff
    });

    const exhaustGeometry = new THREE.ConeGeometry(
        0.16, 0.8, 6
    );

    const exhausts = [];

    for (const x of [-0.55, 0.55]) {

        const exhaust = new THREE.Mesh(
            exhaustGeometry,
            exhaustMat
        );

        exhaust.rotation.x = Math.PI / 2;
        exhaust.position.set(x, 0.45, 2.6);
        exhaust.visible = false;

        car.add(exhaust);
        exhausts.push(exhaust);
    }

    // --------------------------------------------------
    // PHYSICS STATE
    // --------------------------------------------------

    const initialYaw = track.roadYaw(track.startZ);

    const state = {
        speed: 0,
        yaw: initialYaw,
        lateral: 0,
        nitro: 100,
        drifting: false,
        boosting: false,
        onRoad: true,
        distance: 0
    };

    let previousRoadYaw = initialYaw;

    // Reusable calculations.
    const sin = Math.sin;
    const cos = Math.cos;

    // --------------------------------------------------
    // UPDATE
    // --------------------------------------------------

    function update(delta, input) {

        const steer =
            Number(input.right) - Number(input.left);

        const accelerating = input.gas;
        const braking = input.brake;

        state.boosting =
            input.nitro &&
            state.nitro > 0 &&
            state.speed > 5;

        state.drifting =
            input.drift && state.speed > 8;

        const boostPower = state.boosting ? 1.55 : 1;

        // Acceleration.
        if (accelerating) {
            state.speed += 28 * boostPower * delta;
        }

        // Braking and reverse.
        if (braking) {
            state.speed -=
                (state.speed > 0 ? 45 : 13) * delta;
        }

        // Natural friction.
        if (!accelerating && !braking) {
            state.speed = THREE.MathUtils.damp(
                state.speed,
                0,
                0.75,
                delta
            );
        }

        const maxSpeed = state.boosting ? 300 : 250;

        state.speed = THREE.MathUtils.clamp(
            state.speed,
            -13,
            maxSpeed
        );

        // Nitro.
        if (state.boosting) {
            state.nitro = Math.max(
                0,
                state.nitro - 27 * delta
            );
        } else {
            state.nitro = Math.min(
                100,
                state.nitro + 5 * delta
            );
        }

        // --------------------------------------------------
        // ROAD CURVATURE
        // --------------------------------------------------

        const roadYaw = track.roadYaw(car.position.z);

        let curveChange = roadYaw - previousRoadYaw;

        if (curveChange > Math.PI) {
            curveChange -= Math.PI * 2;
        }

        if (curveChange < -Math.PI) {
            curveChange += Math.PI * 2;
        }

        state.yaw += curveChange;
        previousRoadYaw = roadYaw;

        // Steering.
        const steerPower = THREE.MathUtils.clamp(
            Math.abs(state.speed) / 11,
            0.1,
            1
        );

        state.yaw -=
            steer *
            1.65 *
            steerPower *
            Math.sign(state.speed || 1) *
            delta;

        // Lateral movement.
        state.lateral +=
            steer *
            Math.abs(state.speed) *
            (state.drifting ? 0.48 : 0.14) *
            delta;

        state.lateral *= Math.exp(
            -(state.drifting ? 1.35 : 6.8) * delta
        );

        // --------------------------------------------------
        // MOVEMENT
        // --------------------------------------------------

        // Direct trigonometry: no temporary Vector3 objects.
        const sy = sin(state.yaw);
        const cy = cos(state.yaw);

        const forwardX = -sy;
        const forwardZ = -cy;

        const rightX = cy;
        const rightZ = -sy;

        car.position.x += (
            forwardX * state.speed +
            rightX * state.lateral
        ) * delta;

        car.position.z += (
            forwardZ * state.speed +
            rightZ * state.lateral
        ) * delta;

        // --------------------------------------------------
        // ROAD BOUNDARIES
        // --------------------------------------------------

        const center = track.centerX(car.position.z);

        const roadOffset = Math.abs(
            car.position.x - center
        );

        state.onRoad =
            roadOffset < track.width / 2 - 1.1;

        if (!state.onRoad) {
            state.speed *= Math.exp(-0.85 * delta);
        }

        car.position.y = 0;

        // --------------------------------------------------
        // VISUAL ROTATION
        // --------------------------------------------------

        car.rotation.y = state.yaw;

        car.rotation.z = THREE.MathUtils.damp(
            car.rotation.z,
            -steer *
            Math.min(Math.abs(state.speed) / 70, 1) *
            0.09,
            4,
            delta
        );

        // --------------------------------------------------
        // WHEEL ANIMATION
        // --------------------------------------------------

        const wheelRotation =
            -state.speed * delta / 0.46;

        for (const wheel of wheels) {

            wheel.pivot.rotation.y =
                wheel.front ? -steer * 0.3 : 0;

            wheel.wheel.rotation.x += wheelRotation;
        }

        // Brake lights.
        red.emissiveIntensity = braking ? 6 : 3;

        // Nitro exhaust.
        const exhaustVisible = state.boosting;

        for (const exhaust of exhausts) {
            exhaust.visible = exhaustVisible;
        }

        // Distance.
        state.distance = Math.max(
            0,
            track.startZ - car.position.z
        );

        return state;
    }

    // --------------------------------------------------
    // INITIAL POSITION
    // --------------------------------------------------

    car.position.set(
        track.centerX(track.startZ),
        0,
        track.startZ
    );

    car.rotation.y = initialYaw;

    // --------------------------------------------------
    // PUBLIC API
    // --------------------------------------------------

    return {
        car,
        state,
        update,

        // Compatibility with game.js HUD.
        get speed() {
            return state.speed;
        },

        get nitro() {
            return state.nitro;
        },

        get onRoad() {
            return state.onRoad;
        },

        get drifting() {
            return state.drifting;
        },

        get boosting() {
            return state.boosting;
        }
    };
}
