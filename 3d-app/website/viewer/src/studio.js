import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(128, 128, 2, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(155,223,255,.8)');
  gradient.addColorStop(.18, 'rgba(81,164,218,.25)');
  gradient.addColorStop(.5, 'rgba(29,117,173,.08)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

/** A physical presentation stage with a reflected floor and distant light rigs. */
export function createStudio(scene, renderer, mobile) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene.fog = new THREE.FogExp2(0x06111d, 0.11);

  // Photographic garment lighting: neutral key and fill, soft cool rims for separation.
  const key = new THREE.DirectionalLight(0xfff6ec, 2.3);
  key.position.set(-2, 2.4, 1.9);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -1.2, right: 1.2, top: 1.6, bottom: -.9, near: .1, far: 8 });
  key.shadow.bias = -.0002;
  key.shadow.normalBias = .008;
  const fill = new THREE.DirectionalLight(0xdce8f4, .45);
  fill.position.set(1.6, .9, 2);
  // Cool stadium floodlights, high behind the kit: they trace the edges and the fabric's sheen.
  const rimR = new THREE.DirectionalLight(0xbfe3ff, 1.6);
  rimR.position.set(1.4, 2.6, -2);
  const rimL = new THREE.DirectionalLight(0xc8dcff, 1.15);
  rimL.position.set(-1.6, 2.4, -1.8);
  const top = new THREE.DirectionalLight(0xffffff, .5);
  top.position.set(0, 3, .2);
  scene.add(key, fill, rimR, rimL, top, new THREE.HemisphereLight(0x7aadd3, 0x071017, .2));

  // The stage floor: a round reflecting floor that fades out into the stadium photo's own floor, so it has no far
  // edge to show as a line. Round and centred on the stage the camera turns around, it looks the same from every side.
  const FADE = [.95, 2.75];
  const floor = new Reflector(new THREE.CircleGeometry(FADE[1] + .05, 128), {
    clipBias: .003, textureWidth: mobile ? 512 : 768, textureHeight: mobile ? 512 : 768,
    color: 0x38444d, multisample: 0,
  });
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.172;
  floor.material.transparent = true;
  // Under the glow pool, the contact shadow and the podium's rings.
  floor.renderOrder = -1;
  floor.material.vertexShader = floor.material.vertexShader
    .replace('varying vec4 vUv;', 'varying vec4 vUv;\nvarying vec2 vStage;')
    .replace('vUv = textureMatrix * vec4( position, 1.0 );', 'vUv = textureMatrix * vec4( position, 1.0 );\nvStage = position.xy;');
  // Soften the reflection as light spreads across a satin rather than mirror floor.
  floor.material.fragmentShader = floor.material.fragmentShader
    .replace('varying vec4 vUv;', 'varying vec4 vUv;\nvarying vec2 vStage;')
    .replace(
      'vec4 base = texture2DProj( tDiffuse, vUv );',
      `vec2 uv = vUv.xy / vUv.w;
     float blur = .0017 + .002 * abs(sin(uv.y * 24.0));
     vec4 base = texture2D(tDiffuse, uv) * .28;
     base += texture2D(tDiffuse, uv + vec2(blur, 0.0)) * .18;
     base += texture2D(tDiffuse, uv - vec2(blur, 0.0)) * .18;
     base += texture2D(tDiffuse, uv + vec2(0.0, blur * 1.5)) * .18;
     base += texture2D(tDiffuse, uv - vec2(0.0, blur * 1.5)) * .18;`,
    )
    .replace(
      'gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );',
      `gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 - smoothstep(${FADE[0].toFixed(2)}, ${FADE[1].toFixed(2)}, length(vStage)) );`,
    );
  scene.add(floor);

  const podium = new THREE.Group();
  podium.position.y = -.115;
  const metal = new THREE.MeshPhysicalMaterial({ color: 0x04090e, metalness: .82, roughness: .34, clearcoat: .14, clearcoatRoughness: .4 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.48, .51, .065, 128), metal);
  base.receiveShadow = true;
  base.castShadow = true;
  const topPlate = new THREE.Mesh(new THREE.CylinderGeometry(.465, .465, .015, 128), new THREE.MeshStandardMaterial({ color: 0x03070c, roughness: .5, metalness: .85 }));
  topPlate.position.y = .04;
  topPlate.receiveShadow = true;
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x09d6f1).multiplyScalar(3.2), toneMapped: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.476, .0028, 10, 160), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = .026;
  const ringLower = new THREE.Mesh(new THREE.TorusGeometry(.50, .0015, 8, 160), ringMat);
  ringLower.rotation.x = -Math.PI / 2;
  ringLower.position.y = -.026;
  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(.625, .0014, 8, 160), new THREE.MeshBasicMaterial({ color: 0x1b507a, transparent: true, opacity: .72 }));
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = -.047;
  podium.add(base, topPlate, ring, ringLower, outerRing);
  scene.add(podium);

  // Soft garment contact darkening on the stage.
  const contact = document.createElement('canvas');
  contact.width = contact.height = 128;
  const contactCtx = contact.getContext('2d');
  const fade = contactCtx.createRadialGradient(64, 64, 4, 64, 64, 64);
  fade.addColorStop(0, 'rgba(0,0,0,.6)'); fade.addColorStop(.6, 'rgba(0,0,0,.2)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
  contactCtx.fillStyle = fade; contactCtx.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(.65, .42), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(contact), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .049;
  podium.add(shadow);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(.8, 64), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x007c98, transparent: true, opacity: .14, depthWrite: false, blending: THREE.AdditiveBlending }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = -.169;
  scene.add(pool);

  return { podium, ringMat, outerRing, pool, shadow };
}
