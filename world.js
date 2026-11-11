
import * as THREE from 'three';

export const TRACK = {
    rx: 82,
    rz: 49,
    width: 19,
    laps: 3
};

export function createWorld(scene) {
    const mats = {
        road: new THREE.MeshStandardMaterial({
            color: 0x111725,
            roughness: 0.3,
            metalness: 0.48
        }),
        ground: new THREE.MeshStandardMaterial({
            color: 0x070b14,
            roughness: 0.95
        }),
        blue: new THREE.MeshStandardMaterial({
            color: 0x00aaff,
            emissive: 0x0077ff,
            emissiveIntensity: 2.2
        }),
        pink: new THREE.MeshStandardMaterial({
            color: 0xff176f,
            emissive: 0xff0055,
            emissiveIntensity: 2
        }),
        metal: new THREE.MeshStandardMaterial({
            color: 0x26334b,
            metalness: 0.8,
            roughness: 0.25
        })
    };

    scene.background = new THREE.Color(0x050713);
    scene.fog = new THREE.FogExp2(0x080d1c, 0.0025);

    // Lighting
    scene.add(new THREE.HemisphereLight(
        0x9bbdff, 0x111322, 1.65
    ));

    const moon = new THREE.DirectionalLight(
        0x9acbff, 2.1
    );

    moon.position.set(-55, 90, -45);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -110;
    moon.shadow.camera.right = 110;
    moon.shadow.camera.top = 110;
    moon.shadow.camera.bottom = -110;

    scene.add(moon);

    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(600, 600),
        mats.ground
    );

    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.3;
    ground.receiveShadow = true;
    scene.add(ground);

    // Track coordinates
    function point(t, offset = 0) {
        const x = TRACK.rx * Math.cos(t);
        const z = TRACK.rz * Math.sin(t);

        const tangent = new THREE.Vector3(
            -TRACK.rx * Math.sin(t),
            0,
            TRACK.rz * Math.cos(t)
        ).normalize();

        const normal = new THREE.Vector3(
            tangent.z, 0, -tangent.x
        );

        return new THREE.Vector3(
            x + normal.x * offset,
            0,
            z + normal.z * offset
        );
    }

    // Continuous track ribbon
    function ribbon(width, material, height) {
        const positions = [];
        const indices = [];
        const segments = 360;

        for (let i = 0; i <= segments; i++) {
            const t = i / segments * Math.PI * 2;
            const center = point(t);

            const tangent = new THREE.Vector3(
                -TRACK.rx * Math.sin(t),
                0,
                TRACK.rz * Math.cos(t)
            ).normalize();

            const normal = new THREE.Vector3(
                tangent.z, 0, -tangent.x
            );

            const half = width / 2;

            positions.push(
                center.x + normal.x * half,
                height,
                center.z + normal.z * half,

                center.x - normal.x * half,
                height,
                center.z - normal.z * half
            );

            if (i < segments) {
                const a = i * 2;

                indices.push(
                    a, a + 1, a + 2,
                    a + 1, a + 3, a + 2
                );
            }
        }

        const geo = new THREE.BufferGeometry();

        geo.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        );

        geo.setIndex(indices);
        geo.computeVertexNormals();

        const mesh = new THREE.Mesh(geo, material);
        mesh.receiveShadow = true;

        scene.add(mesh);
    }

    ribbon(TRACK.width + 2, mats.metal, 0);
    ribbon(TRACK.width, mats.road, 0.045);

    // Track edge lights
    function neonEdge(offset, material) {
        const points = [];

        for (let i = 0; i <= 360; i++) {
            const p = point(i / 360 * Math.PI * 2, offset);
            p.y = 0.28;
            points.push(p);
        }

        const curve = new THREE.CatmullRomCurve3(
            points, true
        );

        const tube = new THREE.Mesh(
            new THREE.TubeGeometry(curve, 360, 0.11, 5, true),
            material
        );

        scene.add(tube);
    }

    neonEdge(9.6, mats.blue);
    neonEdge(-9.6, mats.pink);

    // Centerline markings
    const markingMat = new THREE.MeshBasicMaterial({
        color: 0x5bcfff,
        transparent: true,
        opacity: 0.6
    });

    for (let i = 0; i < 120; i++) {
        const t = i / 120 * Math.PI * 2;
        const p = point(t);

        const tangent = new THREE.Vector3(
            -TRACK.rx * Math.sin(t),
            0,
            TRACK.rz * Math.cos(t)
        );

        const dash = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.035, 1.5),
            markingMat
        );

        dash.position.set(p.x, 0.105, p.z);
        dash.rotation.y = Math.atan2(
            tangent.x, tangent.z
        );

        scene.add(dash);
    }

    // Track guardrails
    for (const side of [-1, 1]) {
        const points = [];

        for (let i = 0; i <= 360; i++) {
            const p = point(
                i / 360 * Math.PI * 2,
                side * 11
            );

            p.y = 0.75;
            points.push(p);
        }

        const curve = new THREE.CatmullRomCurve3(
            points, true
        );

        const rail = new THREE.Mesh(
            new THREE.TubeGeometry(curve, 360, 0.32, 6, true),
            mats.metal
        );

        scene.add(rail);
    }

    // City buildings
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

    for (let i = 0; i < 115; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 105 + Math.random() * 110;

        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;

        const height = 12 + Math.random() * 65;
        const width = 7 + Math.random() * 13;
        const depth = 7 + Math.random() * 13;

        const group = new THREE.Group();

        const building = new THREE.Mesh(
            new THREE.BoxGeometry(width, height, depth),
            buildingMats[i % buildingMats.length]
        );

        building.position.y = height / 2;
        group.add(building);

        // Vertical illuminated facade
        const accent = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, height * 0.8, 0.2),
            windowMats[i % windowMats.length]
        );

        accent.position.set(
            width / 2 + 0.1,
            height * 0.5,
            depth / 2 + 0.1
        );

        group.add(accent);

        // Rooftop structure
        if (i % 4 === 0) {
            const roof = new THREE.Mesh(
                new THREE.BoxGeometry(
                    width * 0.45, 2, depth * 0.45
                ),
                mats.metal
            );

            roof.position.y = height + 1;
            group.add(roof);
        }

        group.position.set(x, 0, z);
        scene.add(group);
    }

    // City light columns
    for (let i = 0; i < 20; i++) {
        const t = i / 20 * Math.PI * 2;
        const p = point(t, 15);

        const lamp = new THREE.PointLight(
            i % 2 ? 0x008cff : 0xff176f,
            95,
            42
        );

        lamp.position.set(p.x, 7, p.z);
        scene.add(lamp);

        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(
                0.08, 0.12, 7, 6
            ),
            mats.metal
        );

        pole.position.set(p.x, 3.5, p.z);
        scene.add(pole);
    }

    // Starting line
    const start = new THREE.Mesh(
        new THREE.BoxGeometry(
            0.8, 0.045, TRACK.width
        ),
        new THREE.MeshBasicMaterial({
            color: 0xe5faff
        })
    );

    start.position.set(TRACK.rx, 0.12, 0);
    start.rotation.y = Math.PI / 2;
    scene.add(start);

    return { point };
}
