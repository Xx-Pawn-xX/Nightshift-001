
import * as THREE from 'three';

// NIGHTSHIFT//LITE — HIGHWAY WORLD

const ROAD_LENGTH = 6000;

export const TRACK = {
    width: 24,
    startZ: 0,
    roadStart: 1800,
    roadEnd: -4200,
    length: ROAD_LENGTH,

    // Smooth, gradual highway bends.
    centerX(z) {
        return 14 * Math.sin(z / 260) +
               6 * Math.sin(z / 720);
    },

    slope(z) {
        return (14 / 260) * Math.cos(z / 260) +
               (6 / 720) * Math.cos(z / 720);
    },

    roadYaw(z) {
        return Math.atan2(-this.slope(z), 1);
    }
};

export function createWorld(scene) {
    const mats = {
        road: new THREE.MeshStandardMaterial({
            color: 0x111725,
            roughness: 0.36,
            metalness: 0.35
        }),
        ground: new THREE.MeshStandardMaterial({
            color: 0x070b14,
            roughness: 1
        }),
        blue: new THREE.MeshStandardMaterial({
            color: 0x00aaff,
            emissive: 0x0077ff,
            emissiveIntensity: 2.2
        }),
        pink: new THREE.MeshStandardMaterial({
            color: 0xff176f,
            emissive: 0xff0055,
            emissiveIntensity: 1.8
        }),
        metal: new THREE.MeshStandardMaterial({
            color: 0x26334b,
            metalness: 0.8,
            roughness: 0.28
        }),
        whiteLine: new THREE.MeshBasicMaterial({
            color: 0xd7e9ff
        }),
        yellowLine: new THREE.MeshBasicMaterial({
            color: 0xffd36a
        })
    };

    scene.background = new THREE.Color(0x050713);
    scene.fog = new THREE.FogExp2(0x080d1c, 0.00065);

    scene.add(new THREE.HemisphereLight(
        0x9bbdff, 0x111322, 1.55
    ));

    const moon = new THREE.DirectionalLight(0x9acbff, 1.8);
    moon.position.set(-55, 90, -45);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -100;
    moon.shadow.camera.right = 100;
    moon.shadow.camera.top = 100;
    moon.shadow.camera.bottom = -100;
    scene.add(moon);

    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(1800, ROAD_LENGTH + 1000),
        mats.ground
    );

    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.35, -1200);
    ground.receiveShadow = true;
    scene.add(ground);

    // Highway surface built as a continuous curved ribbon.
    function makeRoadRibbon(width, material, height, offset = 0) {
        const positions = [];
        const indices = [];
        const segments = 600;
        const half = width / 2;

        for (let i = 0; i <= segments; i++) {
            const z = TRACK.roadStart -
                (i / segments) * ROAD_LENGTH;

            const x = TRACK.centerX(z) + offset;
            const angle = TRACK.roadYaw(z);
            const nx = Math.cos(angle);
            const nz = Math.sin(angle);

            positions.push(
                x + nx * half, height, z + nz * half,
                x - nx * half, height, z - nz * half
            );

            if (i < segments) {
                const a = i * 2;
                indices.push(
    a, a + 2, a + 1,
    a + 1, a + 2, a + 3
);
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        );
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        scene.add(mesh);
    }

    makeRoadRibbon(TRACK.width + 2.5, mats.metal, 0);
    makeRoadRibbon(TRACK.width, mats.road, 0.055);

    // Lane lines: two dashed white separators and yellow edges.
    function addRoadMarking(offset, width, material, dashLength, gap) {
        for (
            let z = TRACK.roadStart;
            z > TRACK.roadEnd;
            z -= dashLength + gap
        ) {
            const mid = z - dashLength / 2;
            const angle = TRACK.roadYaw(mid);

            const dash = new THREE.Mesh(
                new THREE.BoxGeometry(width, 0.035, dashLength),
                material
            );

            dash.position.set(
                TRACK.centerX(mid) + Math.cos(angle) * offset,
                0.105,
                mid + Math.sin(angle) * offset
            );

            dash.rotation.y = angle;
            scene.add(dash);
        }
    }

    addRoadMarking(-4, 0.12, mats.whiteLine, 5, 5);
    addRoadMarking(4, 0.12, mats.whiteLine, 5, 5);
    addRoadMarking(-11.35, 0.2, mats.yellowLine, 6000, 0);
    addRoadMarking(11.35, 0.2, mats.yellowLine, 6000, 0);

    // Roadside barriers.
    for (const side of [-1, 1]) {
        for (
            let z = TRACK.roadStart;
            z > TRACK.roadEnd;
            z -= 8
        ) {
            const mid = z - 4;
            const angle = TRACK.roadYaw(mid);
            const offset = side * 13.2;

            const rail = new THREE.Mesh(
                new THREE.BoxGeometry(0.45, 0.75, 8.2),
                mats.metal
            );

            rail.position.set(
                TRACK.centerX(mid) + Math.cos(angle) * offset,
                0.65,
                mid + Math.sin(angle) * offset
            );

            rail.rotation.y = angle;
            rail.castShadow = true;
            scene.add(rail);

            const neon = new THREE.Mesh(
                new THREE.BoxGeometry(0.12, 0.09, 8.1),
                side < 0 ? mats.blue : mats.pink
            );

            neon.position.copy(rail.position);
            neon.position.y = 1.03;
            neon.rotation.y = angle;
            scene.add(neon);
        }
    }

    // Streetlights along both sides.
    for (
        let z = TRACK.roadStart - 15;
        z > TRACK.roadEnd;
        z -= 55
    ) {
        const angle = TRACK.roadYaw(z);

        for (const side of [-1, 1]) {
            const offset = side * 17;
            const x = TRACK.centerX(z) +
                Math.cos(angle) * offset;
            const zz = z + Math.sin(angle) * offset;

            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(
                    0.09, 0.13, 9, 8
                ),
                mats.metal
            );

            pole.position.set(x, 4.5, zz);
            scene.add(pole);

            const arm = new THREE.Mesh(
                new THREE.BoxGeometry(2.8, 0.12, 0.12),
                mats.metal
            );

            arm.position.set(
                x - side * 1.2, 8.7, zz
            );
            scene.add(arm);

            const lamp = new THREE.PointLight(
                side < 0 ? 0x68baff : 0xffb9d4,
                28,
                42
            );

            lamp.position.set(x - side * 2.1, 8.3, zz);
            scene.add(lamp);

            const bulb = new THREE.Mesh(
                new THREE.SphereGeometry(0.2, 8, 8),
                side < 0 ? mats.blue : mats.pink
            );

            bulb.position.copy(lamp.position);
            scene.add(bulb);
        }
    }

    // Procedural city skyline.
    const buildingMats = [
        new THREE.MeshStandardMaterial({
            color: 0x111d35,
            metalness: 0.6,
            roughness: 0.4
        }),
        new THREE.MeshStandardMaterial({
            color: 0x1b1934,
            metalness: 0.55,
            roughness: 0.35
        }),
        new THREE.MeshStandardMaterial({
            color: 0x102638,
            metalness: 0.65,
            roughness: 0.35
        })
    ];

    const windowMats = [
        new THREE.MeshBasicMaterial({ color: 0x008cff }),
        new THREE.MeshBasicMaterial({ color: 0xff2677 }),
        new THREE.MeshBasicMaterial({ color: 0x7a9fff })
    ];

    for (let i = 0; i < 180; i++) {
        const z = 1500 - Math.random() * 5700;
        const side = Math.random() < 0.5 ? -1 : 1;
        const distance = 65 + Math.random() * 180;
        const height = 15 + Math.random() * 75;
        const width = 9 + Math.random() * 17;
        const depth = 9 + Math.random() * 17;

        const group = new THREE.Group();

        const building = new THREE.Mesh(
            new THREE.BoxGeometry(width, height, depth),
            buildingMats[i % buildingMats.length]
        );

        building.position.y = height / 2;
        building.castShadow = true;
        group.add(building);

        const accent = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, height * 0.8, 0.2),
            windowMats[i % windowMats.length]
        );

        accent.position.set(
            width / 2 + 0.1, height * 0.5, depth / 2 + 0.1
        );
        group.add(accent);

        group.position.set(
            TRACK.centerX(z) + side * distance,
            0,
            z
        );

        scene.add(group);
    }

    // Distant skyline silhouettes.
    for (let i = 0; i < 65; i++) {
        const z = 1300 - Math.random() * 5200;
        const side = Math.random() < 0.5 ? -1 : 1;

        const building = new THREE.Mesh(
            new THREE.BoxGeometry(
                15 + Math.random() * 30,
                30 + Math.random() * 110,
                15 + Math.random() * 30
            ),
            buildingMats[i % buildingMats.length]
        );

        building.position.set(
            TRACK.centerX(z) + side * (210 + Math.random() * 180),
            building.geometry.parameters.height / 2,
            z
        );

        scene.add(building);
    }

    // Starting marker.
    const start = new THREE.Mesh(
        new THREE.BoxGeometry(TRACK.width, 0.035, 0.7),
        new THREE.MeshBasicMaterial({ color: 0xe5faff })
    );

    start.position.set(TRACK.centerX(0), 0.12, 0);
    scene.add(start);

    return { track: TRACK };
}
