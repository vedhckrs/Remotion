import { useAssetUrl } from './AssetUrls';
import React, { useMemo } from 'react';
import { ThreeCanvas } from '@remotion/three';
import { useCurrentFrame, useVideoConfig, staticFile } from 'remotion';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { Scene, SceneSpec, Entity } from '@nuradi/schemas/index';
import { stateAt } from './motion';
function Asset({ path, type }: {
    path: string;
    type: string;
}) { const assetUrl = useAssetUrl(); const model = useLoader(GLTFLoader, assetUrl(path)); return <primitive object={model.scene.clone()} scale={.7}/>; }
function Extruded({ path }: {
    path: string;
}) { const assetUrl = useAssetUrl(); const svg = useLoader(SVGLoader, assetUrl(path)); const shapes = useMemo(() => svg.paths.flatMap(p => SVGLoader.createShapes(p)).map(s => new THREE.ExtrudeGeometry(s, { depth: 8, bevelEnabled: true, bevelSize: 1, bevelThickness: 1, bevelSegments: 2 })), [svg]); return <group scale={.008}>{shapes.map((geometry, i) => <mesh key={i} geometry={geometry}><meshStandardMaterial color="#ffd34f" metalness={.4} roughness={.3}/></mesh>)}</group>; }
function Icon({ entity }: {
    entity: Entity;
}) {
    const color = entity.kind === 'shield' ? '#77debc' : '#ffd34f';
    const material = <meshStandardMaterial color={color} metalness={.45} roughness={.25}/>;
    const box = (position: [
        number,
        number,
        number
    ], size: [
        number,
        number,
        number
    ], key = 0) => <mesh key={key} position={position}><boxGeometry args={size}/>{material}</mesh>;
    const ball = (p: [
        number,
        number,
        number
    ], r: number, key = 0) => <mesh key={key} position={p}><sphereGeometry args={[r, 24, 16]}/>{material}</mesh>;
    switch (entity.kind) {
        case 'cloud': return <group>{ball([0, 0, 0], .5)}{ball([-.45, -.12, 0], .32, 1)}{ball([.45, -.12, 0], .32, 2)}</group>;
        case 'globe': return <group>{ball([0, 0, 0], .55)}<mesh><sphereGeometry args={[.56, 16, 8]}/><meshBasicMaterial color="#172238" wireframe/></mesh></group>;
        case 'orb': return <mesh><icosahedronGeometry args={[.6, 1]}/><meshStandardMaterial color="#a18aff" emissive="#31205b" metalness={.6} roughness={.15}/></mesh>;
        case 'database': return <group>{[0, 1, 2].map(n => <mesh key={n} position={[0, .3 - n * .3, 0]}><cylinderGeometry args={[.55, .55, .22, 24]}/>{material}</mesh>)}</group>;
        case 'shield': {
            const shape = new THREE.Shape();
            shape.moveTo(0, .65);
            shape.lineTo(.55, .4);
            shape.lineTo(.4, -.35);
            shape.lineTo(0, -.65);
            shape.lineTo(-.4, -.35);
            shape.lineTo(-.55, .4);
            shape.closePath();
            return <mesh><extrudeGeometry args={[shape, { depth: .15, bevelEnabled: true, bevelSize: .04, bevelThickness: .04, bevelSegments: 2 }]}/>{material}</mesh>;
        }
        case 'chip': return <group>{box([0, 0, 0], [.9, .8, .3])}{[-1, 1].flatMap(side => [0, 1, 2, 3].map(n => box([side * .55, n * .2 - .3, 0], [.25, .08, .12], side * 10 + n)))}</group>;
        case 'router': return <group>{box([0, -.2, 0], [1.2, .3, .6])}{[-1, 1].map(side => box([side * .45, .2, 0], [.07, .65, .07], side))}</group>;
        case 'wifi': return <group>{[0, 1, 2].map(n => <mesh key={n} rotation={[0, 0, Math.PI * .15]} position={[0, -.3, 0]}><torusGeometry args={[.25 + n * .2, .045, 8, 32, Math.PI * .7]}/>{material}</mesh>)}{ball([0, -.3, 0], .08)}</group>;
        case 'arrow': return <group rotation={[0, 0, -Math.PI / 2]}><mesh><cylinderGeometry args={[.09, .09, .7, 12]}/>{material}</mesh><mesh position={[0, .5, 0]}><coneGeometry args={[.28, .4, 16]}/>{material}</mesh></group>;
        case 'currency': return <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.55, .55, .13, 32]}/>{material}</mesh>;
        case 'stack': return <group>{[0, 1, 2].map(n => box([n * .05, .4 - n * .4, 0], [1, .18, .7], n))}</group>;
        case 'phone':
        case 'client': return <group>{box([0, 0, 0], [.65, 1.1, .16])}{box([0, .03, .09], [.5, .8, .02], 1)}</group>;
        default: return <group>{box([0, 0, 0], [1, .9, .45])}{[0, 1, 2].map(n => <mesh key={n} position={[0, .25 - n * .25, .235]}><boxGeometry args={[.65, .06, .03]}/><meshStandardMaterial color="#142036"/></mesh>)}</group>;
    }
}
export function ThreeScene({ scene, spec }: {
    scene: Scene;
    spec: SceneSpec;
}) { const frame = useCurrentFrame(); const { fps, width, height } = useVideoConfig(); const time = frame / fps; return <ThreeCanvas width={width} height={Math.round(height * .65)} camera={{ position: [0, 0, width < height ? 8 : 5], fov: 45 }}><ambientLight intensity={1.1}/><directionalLight position={[3, 4, 4]} intensity={3}/><pointLight position={[-3, -2, 3]} color="#739dff" intensity={25}/>{scene.entities.map(entity => { const s = stateAt(scene, entity, time), asset = spec.assets.find(a => a.id === entity.assetId); return <group key={entity.id} position={[(s.x - .5) * 6, (.5 - s.y) * 3, 0]} scale={s.scale * s.opacity} rotation={[Math.sin(time * .5) * .1, time * .35, s.rotation * Math.PI / 180]}>{asset?.type === 'glb' ? <Asset path={asset.path} type={asset.type}/> : asset?.type === 'svg' ? <Extruded path={asset.path}/> : <Icon entity={entity}/>}</group>; })}</ThreeCanvas>; }
