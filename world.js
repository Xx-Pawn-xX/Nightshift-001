import * as THREE from 'three';

// NIGHTSHIFT//LITE — 16 km continuous highway loop.
const ROAD_LENGTH = 16000;
const LOOP_RADIUS = ROAD_LENGTH / (Math.PI * 2);

export const TRACK = {
    width: 24,
    length: ROAD_LENGTH,
    startZ: 0,
    roadStart: 0,
    roadEnd: -ROAD_LENGTH,

    // Distance is measured along the loop, in game units (meters).
    pointAt(distance) {
        const angle = distance / LOOP_RADIUS;
        return {
            x: LOOP_RADIUS * (1 - Math.cos(angle)),
            z: -LOOP_RADIUS * Math.sin(angle),
            yaw: -angle
        };
    },

    // Compatibility helpers for any existing callers.
    centerX(distance) {
        return this.pointAt(distance).x;
    },

    roadYaw(distance) {
        return this.pointAt(distance).yaw;
    }
};

export function createWorld(scene) {
    const materials = {
        road: new THREE.MeshStandardMaterial({ color: 0x111725, roughness: 0.65, metalness: 0.12 }),
        ground: new THREE.MeshBasicMaterial({ color: 0x070b14 }),
        blue: new THREE.MeshBasicMaterial({ color: 0x008cff }),
        pink: new THREE.MeshBasicMaterial({ color: 0xff176f }),
        metal: new THREE.MeshStandardMaterial({ color: 0x26334b, metalness: 0.35, roughness: 0.55 }),
        white: new THREE.MeshBasicMaterial({ color: 0xd7e9ff }),
        yellow: new THREE.MeshBasicMaterial({ color: 0xffd36a })
    };

    scene.background = new THREE.Color(0x050713);
    scene.fog = new THREE.FogExp2(0x080d1c, 0.00065);

    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(ROAD_LENGTH * 0.48, ROAD_LENGTH * 0.48),
        materials.ground
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(LOOP_RADIUS, -0.35, 0);
    scene.add(ground);

    // Build the road as one smooth ribbon. The very broad radius makes the
    // bend gentle while the end joins the start for a complete 16 km loop.
    const segments = 1600;
    const positions = [];
    const indices = [];
    const roadHalfWidth = TRACK.width / 2;

    for (let i = 0; i <= segments; i++) {
        const point = TRACK.pointAt((i / segments) * ROAD_LENGTH);
        const nx = Math.cos(point.yaw);
        const nz = -Math.sin(point.yaw);
        positions.push(
            point.x + nx * roadHalfWidth, 0.055, point.z + nz * roadHalfWidth,
            point.x - nx * roadHalfWidth, 0.055, point.z - nz * roadHalfWidth
        );
        if (i < segments) {
            const a = i * 2;
            indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
    }

    const roadGeometry = new THREE.BufferGeometry();
    roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    roadGeometry.setIndex(indices);
    roadGeometry.computeVertexNormals();
    scene.add(new THREE.Mesh(roadGeometry, materials.road));

    const dummy = new THREE.Object3D();
    function addInstances(geometry, material, transforms, name) {
        if (!transforms.length) return;
        const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
        mesh.name = name;
        transforms.forEach((t, i) => {
            dummy.position.set(t.x, t.y, t.z);
            dummy.rotation.set(0, t.yaw || 0, 0);
            dummy.scale.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        scene.add(mesh);
    }

    const dashes = [];
    const rails = [];
    const blueLights = [];
    const pinkLights = [];
    const poles = [];
    const bulbsBlue = [];
    const bulbsPink = [];
    const buildings = [[], [], []];

    for (let s = 0; s < ROAD_LENGTH; s += 10) {
        const p = TRACK.pointAt(s + 2.5);
        dashes.push({ x: p.x + Math.cos(p.yaw) * -4, y: 0.105, z: p.z - Math.sin(p.yaw) * -4, yaw: p.yaw, sx: 1, sy: 1, sz: 1 });
        dashes.push({ x: p.x + Math.cos(p.yaw) * 4, y: 0.105, z: p.z - Math.sin(p.yaw) * 4, yaw: p.yaw, sx: 1, sy: 1, sz: 1 });
    }

    for (const side of [-1, 1]) {
        for (let s = 0; s < ROAD_LENGTH; s += 8) {
            const p = TRACK.pointAt(s + 4);
            const offset = side * 13.2;
            const x = p.x + Math.cos(p.yaw) * offset;
            const z = p.z - Math.sin(p.yaw) * offset;
            rails.push({ x, y: 0.65, z, yaw: p.yaw });
            (side < 0 ? blueLights : pinkLights).push({ x, y: 1.03, z, yaw: p.yaw });
        }

        for (let s = 20; s < ROAD_LENGTH; s += 55) {
            const p = TRACK.pointAt(s);
            const offset = side * 17;
            const x = p.x + Math.cos(p.yaw) * offset;
            const z = p.z - Math.sin(p.yaw) * offset;
            poles.push({ x, y: 4.5, z });
            (side < 0 ? bulbsBlue : bulbsPink).push({ x: x - side * 2.1, y: 8.3, z });
        }
    }

    // City blocks follow the highway, keeping the skyline around the loop.
    for (let s = 150; s < ROAD_LENGTH; s += 85) {
        const p = TRACK.pointAt(s);
        for (const side of [-1, 1]) {
            const distance = 65 + Math.random() * 110;
            const height = 15 + Math.random() * 75;
            const width = 9 + Math.random() * 17;
            const depth = 9 + Math.random() * 17;
            const type = Math.floor(Math.random() * 3);
            buildings[type].push({
                x: p.x + Math.cos(p.yaw) * side * distance,
                y: height / 2,
                z: p.z - Math.sin(p.yaw) * side * distance,
                sx: width, sy: height, sz: depth
            });
        }
    }

    addInstances(new THREE.BoxGeometry(0.12, 0.035, 5), materials.white, dashes, 'Lane Markings');
    addInstances(new THREE.BoxGeometry(0.45, 0.75, 8.2), materials.metal, rails, 'Highway Barriers');
    addInstances(new THREE.BoxGeometry(0.12, 0.09, 8.1), materials.blue, blueLights, 'Blue Barrier Lights');
    addInstances(new THREE.BoxGeometry(0.12, 0.09, 8.1), materials.pink, pinkLights, 'Pink Barrier Lights');
    addInstances(new THREE.CylinderGeometry(0.09, 0.13, 9, 6), materials.metal, poles, 'Streetlight Poles');
    addInstances(new THREE.SphereGeometry(0.2, 5, 5), materials.blue, bulbsBlue, 'Blue Streetlights');
    addInstances(new THREE.SphereGeometry(0.2, 5, 5), materials.pink, bulbsPink, 'Pink Streetlights');

    const buildingMaterials = [0x111d35, 0x1b1934, 0x102638].map(color =>
        new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.65 })
    );
    for (let i = 0; i < buildings.length; i++) {
        addInstances(new THREE.BoxGeometry(1, 1, 1), buildingMaterials[i], buildings[i], `City Buildings ${i}`);
    }

    const start = new THREE.Mesh(new THREE.BoxGeometry(TRACK.width, 0.035, 0.7), materials.white);
    start.position.set(0, 0.12, 0);
    scene.add(start);

    return { track: TRACK };
}
