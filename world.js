
import * as THREE from 'three';

// NIGHTSHIFT//LITE — OPTIMIZED HIGHWAY WORLD
// Instanced geometry, minimal lighting, low draw calls.

const ROAD_LENGTH = 6000;

export const TRACK = {
    width: 24,
    startZ: 0,
    roadStart: 1800,
    roadEnd: -4200,
    length: ROAD_LENGTH,

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

    // --------------------------------------------------
    // MATERIALS
    // --------------------------------------------------

    const mats = {
        road: new THREE.MeshStandardMaterial({
            color: 0x111725,
            roughness: 0.65,
            metalness: 0.12
        }),

        ground: new THREE.MeshBasicMaterial({
            color: 0x070b14
        }),

        blue: new THREE.MeshBasicMaterial({
            color: 0x008cff
        }),

        pink: new THREE.MeshBasicMaterial({
            color: 0xff176f
        }),

        metal: new THREE.MeshStandardMaterial({
            color: 0x26334b,
            metalness: 0.35,
            roughness: 0.55
        }),

        whiteLine: new THREE.MeshBasicMaterial({
            color: 0xd7e9ff
        }),

        yellowLine: new THREE.MeshBasicMaterial({
            color: 0xffd36a
        })
    };

    // Lighting is managed by game.js.
    // Do not create duplicate lights here.

    scene.background = new THREE.Color(0x050713);
    scene.fog = new THREE.FogExp2(0x080d1c, 0.00065);

    // --------------------------------------------------
    // INSTANCING HELPERS
    // --------------------------------------------------

    const dummy = new THREE.Object3D();

    function createInstances(
        geometry,
        material,
        transforms,
        name
    ) {
        if (!transforms.length) return null;

        const mesh = new THREE.InstancedMesh(
            geometry,
            material,
            transforms.length
        );

        mesh.name = name;
        mesh.frustumCulled = true;

        for (let i = 0; i < transforms.length; i++) {
            const t = transforms[i];

            dummy.position.set(
                t.x,
                t.y,
                t.z
            );

            dummy.rotation.set(
                0,
                t.angle || 0,
                0
            );

            dummy.scale.set(
                t.sx ?? 1,
                t.sy ?? 1,
                t.sz ?? 1
            );

            dummy.updateMatrix();

            mesh.setMatrixAt(i, dummy.matrix);
        }

        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();

        scene.add(mesh);

        return mesh;
    }

    // --------------------------------------------------
    // GROUND
    // --------------------------------------------------

    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(1800, ROAD_LENGTH + 1000),
        mats.ground
    );

    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.35, -1200);

    scene.add(ground);

    // --------------------------------------------------
    // ROAD RIBBON
    // --------------------------------------------------

    function makeRoadRibbon(
        width,
        material,
        height,
        offset = 0
    ) {
        const segments = 600;
        const positions = [];
        const indices = [];

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

        const mesh = new THREE.Mesh(
            geometry,
            material
        );

        mesh.frustumCulled = true;

        scene.add(mesh);
    }

    makeRoadRibbon(TRACK.width + 2.5, mats.metal, 0);
    makeRoadRibbon(TRACK.width, mats.road, 0.055);

    // Continuous curved yellow edge markings.
    makeRoadRibbon(0.2, mats.yellowLine, 0.105, -11.35);
    makeRoadRibbon(0.2, mats.yellowLine, 0.105, 11.35);

    // --------------------------------------------------
    // DASHED LANE MARKINGS
    // --------------------------------------------------

    const dashGeometry = new THREE.BoxGeometry(
        0.12,
        0.035,
        5
    );

    const leftDashes = [];
    const rightDashes = [];

    for (
        let z = TRACK.roadStart;
        z > TRACK.roadEnd;
        z -= 10
    ) {
        const mid = z - 2.5;
        const angle = TRACK.roadYaw(mid);

        const common = {
            y: 0.105,
            z: mid,
            angle,
            sx: 1,
            sy: 1,
            sz: 1
        };

        leftDashes.push({
            ...common,
            x: TRACK.centerX(mid) +
                Math.cos(angle) * -4
        });

        rightDashes.push({
            ...common,
            x: TRACK.centerX(mid) +
                Math.cos(angle) * 4
        });
    }

    createInstances(
        dashGeometry,
        mats.whiteLine,
        leftDashes,
        'Left Lane Markings'
    );

    createInstances(
        dashGeometry,
        mats.whiteLine,
        rightDashes,
        'Right Lane Markings'
    );

    // --------------------------------------------------
    // ROADSIDE BARRIERS
    // --------------------------------------------------

    const railGeometry = new THREE.BoxGeometry(
        0.45, 0.75, 8.2
    );

    const neonGeometry = new THREE.BoxGeometry(
        0.12, 0.09, 8.1
    );

    const rails = [];
    const blueNeons = [];
    const pinkNeons = [];

    for (const side of [-1, 1]) {

        for (
            let z = TRACK.roadStart;
            z > TRACK.roadEnd;
            z -= 8
        ) {
            const mid = z - 4;
            const angle = TRACK.roadYaw(mid);

            const offset = side * 13.2;

            const x = TRACK.centerX(mid) +
                Math.cos(angle) * offset;

            const zz = mid + Math.sin(angle) * offset;

            rails.push({
                x,
                y: 0.65,
                z: zz,
                angle
            });

            const neon = {
                x,
                y: 1.03,
                z: zz,
                angle
            };

            if (side < 0) {
                blueNeons.push(neon);
            } else {
                pinkNeons.push(neon);
            }
        }
    }

    createInstances(
        railGeometry,
        mats.metal,
        rails,
        'Highway Barriers'
    );

    createInstances(
        neonGeometry,
        mats.blue,
        blueNeons,
        'Blue Barrier Lights'
    );

    createInstances(
        neonGeometry,
        mats.pink,
        pinkNeons,
        'Pink Barrier Lights'
    );

    // --------------------------------------------------
    // STREETLIGHTS
    // --------------------------------------------------

    const poleGeometry = new THREE.CylinderGeometry(
        0.09, 0.13, 9, 6
    );

    const armGeometry = new THREE.BoxGeometry(
        2.8, 0.12, 0.12
    );

    const bulbGeometry = new THREE.SphereGeometry(
        0.2, 5, 5
    );

    const poles = [];
    const arms = [];
    const blueBulbs = [];
    const pinkBulbs = [];

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

            poles.push({
                x,
                y: 4.5,
                z: zz
            });

            arms.push({
                x: x - side * 1.2,
                y: 8.7,
                z: zz
            });

            const bulb = {
                x: x - side * 2.1,
                y: 8.3,
                z: zz
            };

            if (side < 0) {
                blueBulbs.push(bulb);
            } else {
                pinkBulbs.push(bulb);
            }
        }
    }

    createInstances(
        poleGeometry,
        mats.metal,
        poles,
        'Streetlight Poles'
    );

    createInstances(
        armGeometry,
        mats.metal,
        arms,
        'Streetlight Arms'
    );

    createInstances(
        bulbGeometry,
        mats.blue,
        blueBulbs,
        'Blue Streetlight Bulbs'
    );

    createInstances(
        bulbGeometry,
        mats.pink,
        pinkBulbs,
        'Pink Streetlight Bulbs'
    );

    // No hundreds of dynamic PointLights.
    // Emissive bulbs preserve the neon appearance.

    // --------------------------------------------------
    // PROCEDURAL CITY
    // --------------------------------------------------

    const buildingMats = [
        new THREE.MeshStandardMaterial({
            color: 0x111d35,
            metalness: 0.3,
            roughness: 0.65
        }),

        new THREE.MeshStandardMaterial({
            color: 0x1b1934,
            metalness: 0.3,
            roughness: 0.65
        }),

        new THREE.MeshStandardMaterial({
            color: 0x102638,
            metalness: 0.3,
            roughness: 0.65
        })
    ];

    const windowMats = [
        new THREE.MeshBasicMaterial({
            color: 0x008cff
        }),

        new THREE.MeshBasicMaterial({
            color: 0xff2677
        }),

        new THREE.MeshBasicMaterial({
            color: 0x7a9fff
        })
    ];

    // All buildings use one unit cube geometry.
    const buildingGeometry = new THREE.BoxGeometry(1, 1, 1);

    const accentGeometry = new THREE.BoxGeometry(1, 1, 1);

    const buildingInstances = [[], [], []];
    const accentInstances = [[], [], []];

    for (let i = 0; i < 180; i++) {

        const z = 1500 - Math.random() * 5700;

        const side = Math.random() < 0.5 ? -1 : 1;

        const distance = 65 + Math.random() * 180;

        const height = 15 + Math.random() * 75;
        const width = 9 + Math.random() * 17;
        const depth = 9 + Math.random() * 17;

        const x = TRACK.centerX(z) + side * distance;

        const type = i % 3;

        buildingInstances[type].push({
            x,
            y: height / 2,
            z,
            sx: width,
            sy: height,
            sz: depth
        });

        accentInstances[type].push({
            x: x + width / 2 + 0.1,
            y: height * 0.5,
            z: z + depth / 2 + 0.1,
            sx: 0.18,
            sy: height * 0.8,
            sz: 0.2
        });
    }

    for (let i = 0; i < 3; i++) {

        createInstances(
            buildingGeometry,
            buildingMats[i],
            buildingInstances[i],
            `City Buildings ${i}`
        );

        createInstances(
            accentGeometry,
            windowMats[i],
            accentInstances[i],
            `City Neon ${i}`
        );
    }

    // --------------------------------------------------
    // DISTANT SKYLINE
    // --------------------------------------------------

    const distantInstances = [[], [], []];

    for (let i = 0; i < 65; i++) {

        const z = 1300 - Math.random() * 5200;

        const side = Math.random() < 0.5 ? -1 : 1;

        const width = 15 + Math.random() * 30;
        const height = 30 + Math.random() * 110;
        const depth = 15 + Math.random() * 30;

        const type = i % 3;

        distantInstances[type].push({
            x: TRACK.centerX(z) +
                side * (210 + Math.random() * 180),

            y: height / 2,
            z,

            sx: width,
            sy: height,
            sz: depth
        });
    }

    for (let i = 0; i < 3; i++) {
        createInstances(
            buildingGeometry,
            buildingMats[i],
            distantInstances[i],
            `Distant Skyline ${i}`
        );
    }

    // --------------------------------------------------
    // START MARKER
    // --------------------------------------------------

    const start = new THREE.Mesh(
        new THREE.BoxGeometry(
            TRACK.width, 0.035, 0.7
        ),
        mats.whiteLine
    );

    start.position.set(
        TRACK.centerX(0),
        0.12,
        0
    );

    scene.add(start);

    // --------------------------------------------------
    // RETURN
    // --------------------------------------------------

    return {
        track: TRACK
    };
}
