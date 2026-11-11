import * as THREE from 'three';

export function createVehicle(scene, track) {
    const car = new THREE.Group();
    scene.add(car);

    const paint = new THREE.MeshStandardMaterial({ color: 0x064b80, metalness: 0.65, roughness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x08111f, metalness: 0.5, roughness: 0.35 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x08090d, roughness: 0.95 });
    const blue = new THREE.MeshBasicMaterial({ color: 0x00caff });
    const red = new THREE.MeshStandardMaterial({ color: 0xff174d, emissive: 0xff0033, emissiveIntensity: 3 });
    const boxGeometry = new Map();
    function box(parent, size, position, material) {
        const key = size.join(',');
        if (!boxGeometry.has(key)) boxGeometry.set(key, new THREE.BoxGeometry(...size));
        const mesh = new THREE.Mesh(boxGeometry.get(key), material);
        mesh.position.set(...position);
        parent.add(mesh);
        return mesh;
    }

    box(car, [2.1, 0.55, 4.5], [0, 0.8, 0], paint);
    box(car, [2.2, 0.22, 3.9], [0, 0.55, 0], dark);
    box(car, [1.9, 0.18, 1.3], [0, 1.12, -1.42], paint);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.62, 1.9), dark);
    cabin.position.set(0, 1.35, 0);
    car.add(cabin);
    box(car, [1.5, 0.1, 1.45], [0, 1.68, 0], paint);
    box(car, [2.2, 0.12, 0.35], [0, 0.49, -2.2], dark);
    box(car, [2.3, 0.13, 0.38], [0, 1.55, 1.95], paint);
    box(car, [0.55, 0.12, 0.08], [-0.66, 0.97, -2.26], blue);
    box(car, [0.55, 0.12, 0.08], [0.66, 0.97, -2.26], blue);
    box(car, [0.57, 0.13, 0.08], [-0.66, 0.95, 2.27], red);
    box(car, [0.57, 0.13, 0.08], [0.66, 0.95, 2.27], red);
    box(car, [1.6, 0.035, 2.8], [0, 0.48, 0], blue);

    const wheels = [];
    for (const x of [-1.05, 1.05]) {
        for (const z of [-1.42, 1.42]) {
            const pivot = new THREE.Group();
            pivot.position.set(x, 0.48, z);
            car.add(pivot);
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.33, 12), rubber);
            wheel.rotation.z = Math.PI / 2;
            pivot.add(wheel);
            const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.35, 10), blue);
            rim.rotation.z = Math.PI / 2;
            pivot.add(rim);
            wheels.push({ pivot, wheel, front: z < 0 });
        }
    }

    const exhausts = [];
    const exhaustMaterial = new THREE.MeshBasicMaterial({ color: 0x39dfff });
    for (const x of [-0.55, 0.55]) {
        const exhaust = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.8, 6), exhaustMaterial);
        exhaust.rotation.x = Math.PI / 2;
        exhaust.position.set(x, 0.45, 2.6);
        exhaust.visible = false;
        car.add(exhaust);
        exhausts.push(exhaust);
    }

    const start = track.pointAt(0);
    const state = {
        speed: 0,
        yaw: start.yaw,
        lateral: 0,
        steer: 0,
        progress: 0,
        nitro: 100,
        drifting: false,
        boosting: false,
        onRoad: true,
        distance: 0
    };

    function update(delta, input) {
        const steerInput = Number(input.right) - Number(input.left);
        state.steer = THREE.MathUtils.damp(state.steer, steerInput, 5, delta);
        const steer = state.steer;
        const accelerating = input.gas;
        const braking = input.brake;

        state.boosting = input.nitro && state.nitro > 0 && state.speed > 5;
        state.drifting = input.drift && state.speed > 8;
        const boostPower = state.boosting ? 1.55 : 1;

        if (accelerating) state.speed += 28 * boostPower * delta;
        if (braking) state.speed -= (state.speed > 0 ? 45 : 13) * delta;
        if (!accelerating && !braking) {
            state.speed = THREE.MathUtils.damp(state.speed, 0, 0.75, delta);
        }

        const maxSpeed = state.boosting ? 300 : 250;
        state.speed = THREE.MathUtils.clamp(state.speed, -13, maxSpeed);

        if (state.boosting) state.nitro = Math.max(0, state.nitro - 27 * delta);
        else state.nitro = Math.min(100, state.nitro + 5 * delta);

        // The track progress is only used to check whether the independently
        // steered car is still near the road. It no longer sets the car's pose.
        state.progress = THREE.MathUtils.euclideanModulo(
            state.progress + state.speed * delta,
            track.length
        );

        const steerPower = THREE.MathUtils.clamp(Math.abs(state.speed) / 11, 0.1, 1);
        state.yaw -= steer * 1.1 * steerPower * Math.sign(state.speed || 1) * delta;

        state.lateral += steer * Math.abs(state.speed) * (state.drifting ? 0.32 : 0.09) * delta;
        state.lateral *= Math.exp(-(state.drifting ? 1.35 : 6.8) * delta);

        const forwardX = -Math.sin(state.yaw);
        const forwardZ = -Math.cos(state.yaw);
        const rightX = Math.cos(state.yaw);
        const rightZ = -Math.sin(state.yaw);
        car.position.x += (forwardX * state.speed + rightX * state.lateral) * delta;
        car.position.z += (forwardZ * state.speed + rightZ * state.lateral) * delta;
        car.position.y = 0;
        car.rotation.y = state.yaw;

        // Measure the car's lateral distance from the expected road position,
        // without pulling or steering it back toward the center.
        const road = track.pointAt(state.progress);
        const roadRightX = Math.cos(road.yaw);
        const roadRightZ = -Math.sin(road.yaw);
        const offsetX = car.position.x - road.x;
        const offsetZ = car.position.z - road.z;
        const roadOffset = Math.abs(offsetX * roadRightX + offsetZ * roadRightZ);
        state.onRoad = roadOffset < track.width / 2 - 1.1;
        if (!state.onRoad) state.speed *= Math.exp(-0.85 * delta);

        car.rotation.z = THREE.MathUtils.damp(
            car.rotation.z,
            -steer * Math.min(Math.abs(state.speed) / 70, 1) * 0.09,
            4,
            delta
        );

        const wheelRotation = -state.speed * delta / 0.46;
        for (const wheel of wheels) {
            wheel.pivot.rotation.y = wheel.front ? -steer * 0.22 : 0;
            wheel.wheel.rotation.x += wheelRotation;
        }
        red.emissiveIntensity = braking ? 6 : 3;
        for (const exhaust of exhausts) exhaust.visible = state.boosting;

        state.distance += Math.abs(state.speed) * delta;
        return state;
    }

    car.position.set(start.x, 0, start.z);
    car.rotation.y = start.yaw;

    return {
        car,
        state,
        update,
        get speed() { return state.speed; },
        get nitro() { return state.nitro; },
        get onRoad() { return state.onRoad; },
        get drifting() { return state.drifting; },
        get boosting() { return state.boosting; }
    };
}
