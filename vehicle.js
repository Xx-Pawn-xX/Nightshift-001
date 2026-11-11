
import * as THREE from 'three';

export function createVehicle(scene, track) {
    const car = new THREE.Group();
    scene.add(car);

    const paint = new THREE.MeshStandardMaterial({
        color: 0x064b80,
        metalness: 0.9,
        roughness: 0.19
    });

    const dark = new THREE.MeshStandardMaterial({
        color: 0x08111f,
        metalness: 0.8,
        roughness: 0.18
    });

    const rubber = new THREE.MeshStandardMaterial({
        color: 0x08090d,
        roughness: 0.95
    });

    const blue = new THREE.MeshStandardMaterial({
        color: 0x00caff,
        emissive: 0x008cff,
        emissiveIntensity: 3
    });

    const red = new THREE.MeshStandardMaterial({
        color: 0xff174d,
        emissive: 0xff0033,
        emissiveIntensity: 3
    });

    function box(parent, size, position, mat) {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(...size), mat
        );

        mesh.position.set(...position);
        mesh.castShadow = true;
        parent.add(mesh);

        return mesh;
    }

    // Main chassis
    box(car, [2.1, 0.55, 4.5], [0, 0.8, 0], paint);

    // Lower body
    box(car, [2.2, 0.22, 3.9], [0, 0.55, 0], dark);

    // Hood
    box(car, [1.9, 0.18, 1.3], [0, 1.12, -1.42], paint);

    // Cabin
    const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.55, 0.62, 1.9),
        dark
    );

    cabin.position.set(0, 1.35, 0.0);
    cabin.castShadow = true;
    car.add(cabin);

    // Roof
    box(car, [1.5, 0.1, 1.45], [0, 1.68, 0.0], paint);

    // Front splitter
    box(car, [2.2, 0.12, 0.35], [0, 0.49, -2.2], dark);

    // Rear wing
    box(car, [2.3, 0.13, 0.38], [0, 1.55, 1.95], paint);
    box(car, [0.12, 0.32, 0.12], [-0.65, 1.36, 1.95], dark);
    box(car, [0.12, 0.32, 0.12], [0.65, 1.36, 1.95], dark);

    // Lights
    box(car, [0.55, 0.12, 0.08], [-0.66, 0.97, -2.26], blue);
    box(car, [0.55, 0.12, 0.08], [0.66, 0.97, -2.26], blue);

    const brakeLeft = box(
        car, [0.57, 0.13, 0.08], [-0.66, 0.95, 2.27], red
    );

    const brakeRight = box(
        car, [0.57, 0.13, 0.08], [0.66, 0.95, 2.27], red
    );

    // Wheels
    const wheels = [];

    for (const x of [-1.05, 1.05]) {
        for (const z of [-1.42, 1.42]) {
            const pivot = new THREE.Group();
            pivot.position.set(x, 0.48, z);
            car.add(pivot);

            const wheel = new THREE.Mesh(
                new THREE.CylinderGeometry(
                    0.46, 0.46, 0.33, 24
                ),
                rubber
            );

            wheel.rotation.z = Math.PI / 2;
            pivot.add(wheel);

            const rim = new THREE.Mesh(
                new THREE.CylinderGeometry(
                    0.23, 0.23, 0.35, 16
                ),
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

    // Underglow
    const glow = new THREE.PointLight(
        0x008cff, 24, 10
    );

    glow.position.y = 0.15;
    car.add(glow);

    // Exhaust flames
    const exhaustMat = new THREE.MeshBasicMaterial({
        color: 0x39dfff,
        transparent: true,
        opacity: 0.8
    });

    const exhausts = [];

    for (const x of [-0.55, 0.55]) {
        const exhaust = new THREE.Mesh(
            new THREE.ConeGeometry(0.16, 0.8, 8),
            exhaustMat
        );

        exhaust.rotation.x = Math.PI / 2;
        exhaust.position.set(x, 0.45, 2.6);
        exhaust.visible = false;

        car.add(exhaust);
        exhausts.push(exhaust);
    }

    const state = {
        speed: 0,
        yaw: Math.PI,
        lateral: 0,
        nitro: 100,
        drifting: false,
        boosting: false,
        onRoad: true
    };

    function update(delta, input, track) {
        const steer =
            Number(input.right) - Number(input.left);

        const accelerating = input.gas;
        const braking = input.brake;

        state.boosting =
            input.nitro && state.nitro > 0 &&
            state.speed > 5;

        state.drifting = input.drift && state.speed > 8;

        const boostPower = state.boosting ? 1.55 : 1;

        if (accelerating) {
            state.speed += 28 * boostPower * delta;
        }

        if (braking) {
            if (state.speed > 0) {
                state.speed -= 45 * delta;
            } else {
                state.speed -= 13 * delta;
            }
        }

        if (!accelerating && !braking) {
            state.speed = THREE.MathUtils.damp(
                state.speed, 0, 0.75, delta
            );
        }

        const maxSpeed = state.boosting ? 76 : 58;

        state.speed = THREE.MathUtils.clamp(
            state.speed, -13, maxSpeed
        );

        if (state.boosting) {
            state.nitro = Math.max(
                0, state.nitro - 27 * delta
            );
        } else {
            state.nitro = Math.min(
                100, state.nitro + 5 * delta
            );
        }

        const steerPower = THREE.MathUtils.clamp(
            Math.abs(state.speed) / 11,
            0.1, 1
        );

        state.yaw -= (
            steer * 1.65 * steerPower *
            Math.sign(state.speed || 1) * delta
        );

        state.lateral += (
            steer * Math.abs(state.speed) *
            (state.drifting ? 0.48 : 0.14) * delta
        );

        state.lateral *= Math.exp(
            -(state.drifting ? 1.35 : 6.8) * delta
        );

        const forward = new THREE.Vector3(
            0, 0, -1
        ).applyAxisAngle(
            new THREE.Vector3(0, 1, 0), state.yaw
        );

        const right = new THREE.Vector3(
            1, 0, 0
        ).applyAxisAngle(
            new THREE.Vector3(0, 1, 0), state.yaw
        );

        car.position.addScaledVector(
            forward, state.speed * delta
        );

        car.position.addScaledVector(
            right, state.lateral * delta
        );

        // Track boundary
        const nx = car.position.x / track.rx;
        const nz = car.position.z / track.rz;

        const radial = Math.sqrt(nx * nx + nz * nz);

        const averageRadius = (track.rx + track.rz) / 2;
        const distance = Math.abs(radial - 1) * averageRadius;

        state.onRoad = distance < track.width / 2 - 0.5;

        if (!state.onRoad) {
            state.speed *= Math.exp(-0.85 * delta);
        }

        // Car visual rotation
        car.rotation.y = state.yaw;

        car.rotation.z = THREE.MathUtils.damp(
            car.rotation.z,
            -steer * Math.min(Math.abs(state.speed) / 70, 1) * 0.09,
            4, delta
        );

        // Wheel animation
        for (const w of wheels) {
            w.pivot.rotation.y = w.front ? -steer * 0.3 : 0;
            w.wheel.rotation.x -= state.speed * delta / 0.46;
        }

        // Brake light intensity
        brakeLeft.material.emissiveIntensity = braking ? 6 : 3;
        brakeRight.material.emissiveIntensity = braking ? 6 : 3;

        // Boost exhaust
        for (const exhaust of exhausts) {
            exhaust.visible = state.boosting;
        }

        return state;
    }

    car.position.set(track.rx, 0, 0);
    car.rotation.y = state.yaw;

    return {
        car,
        state,
        update
    };
}
