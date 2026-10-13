import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { BOHR_ANGSTROM } from '../data/parameters.js';
import type { OrbitalField } from '../engine/field.js';
import type { SystemState, Vec3 } from '../engine/types.js';
import { positionsAngstrom } from './model.js';

function release(group: THREE.Group): void {
  group.traverse(object => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const material of materials) {
      const map = (material as THREE.SpriteMaterial).map;
      map?.dispose(); material.dispose();
    }
  });
  group.clear();
}

/** Display radii / connectors are drawing heuristics, never computed bond assignments. */
export class MolecularViewer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.01, 2000);
  private readonly controls: OrbitControls;
  private readonly atoms = new THREE.Group();
  private readonly surfaces = new THREE.Group();
  private atomMeshes: THREE.Mesh[] = [];
  private state: SystemState | null = null;
  private dark = true;
  private field: OrbitalField | null = null;
  private mode = 'surface';
  private isovalue = 0.04;
  private moveEnabled = false;
  private placeEnabled = false;
  onPlace: ((position: Vec3) => void) | null = null;
  private dragging: { id: string; plane: THREE.Plane; offset: THREE.Vector3 } | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private framePending = false;
  readonly onMove: (id: string, positionAngstrom: Vec3) => void;

  constructor(private readonly container: HTMLElement, onMove: (id: string, position: Vec3) => void) {
    this.onMove = onMove;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.container.prepend(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.addEventListener('change', () => this.render());
    this.scene.add(this.atoms, this.surfaces, new THREE.AmbientLight(0xffffff, 2));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(3, 7, 5); this.scene.add(light);
    new ResizeObserver(() => this.resize()).observe(container);
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', event => this.pointerDown(event), { capture: true });
    canvas.addEventListener('pointermove', event => this.pointerMove(event));
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, () => {
      this.dragging = null; this.controls.enabled = true;
    });
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); document.getElementById('viewer-unavailable')!.hidden = false; });
    this.setTheme(true); this.resize();
  }

  setTheme(dark: boolean): void {
    this.dark = dark;
    this.scene.background = new THREE.Color(dark ? 0x101010 : 0xffffff);
    if (this.state) this.setGeometry(this.state, false);
    if (this.field) this.setField(this.field, this.isovalue, this.mode);
    this.render();
  }

  private resize(): void {
    const { width, height } = this.container.getBoundingClientRect();
    this.renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    this.camera.aspect = width / Math.max(1, height); this.camera.updateProjectionMatrix(); this.render();
  }

  render(): void {
    if (this.framePending) return;
    this.framePending = true;
    requestAnimationFrame(() => { this.framePending = false; this.renderer.render(this.scene, this.camera); });
  }

  private label(text: string, size = 0.45): THREE.Sprite {
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = this.dark ? '#f2f2f2' : '#171717';
    context.strokeStyle = this.dark ? '#101010' : '#ffffff'; context.lineWidth = 4;
    context.font = '500 34px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.strokeText(text, 64, 34);
    context.fillText(text, 64, 34);
    const map = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false }));
    sprite.scale.set(size * 2, size, 1); return sprite;
  }

  setGeometry(state: SystemState, reset = false): void {
    this.state = structuredClone(state); release(this.atoms); this.atomMeshes = [];
    const positions = positionsAngstrom(state);
    const ink = this.dark ? 0xf2f2f2 : 0x171717;
    const sizes: Record<string, number> = { H: 0.10, He: 0.13, C: 0.17, N: 0.16, O: 0.15, F: 0.14 };
    state.atoms.forEach((atom, i) => {
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(sizes[atom.element] ?? 0.15, 20, 14), new THREE.MeshStandardMaterial({ color: ink, roughness: 0.5 }));
      sphere.position.set(...positions[i]); sphere.userData.atomId = atom.id; this.atoms.add(sphere); this.atomMeshes.push(sphere);
      sphere.name = `atom_${atom.element}_${atom.id}`;
      const label = this.label(atom.element, 0.30); label.position.copy(sphere.position).add(new THREE.Vector3(0, 0.28, 0)); this.atoms.add(label);
      for (let j = 0; j < i; j++) {
        const a = new THREE.Vector3(...positions[j]), b = new THREE.Vector3(...positions[i]);
        const distance = a.distanceTo(b);
        const cutoff = atom.element === 'H' || state.atoms[j].element === 'H' ? 1.35 : 1.85;
        if (distance > cutoff || distance < 0.15) continue;
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, distance, 10), new THREE.MeshStandardMaterial({ color: ink }));
        stick.position.copy(a).add(b).multiplyScalar(0.5);
        stick.name = `proximity_connector_${state.atoms[j].id}_${atom.id}`;
        stick.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize()); this.atoms.add(stick);
      }
    });
    if (reset) this.resetCamera(); this.render();
  }

  resetCamera(): void {
    const box = new THREE.Box3().setFromObject(this.atoms);
    const center = box.getCenter(new THREE.Vector3());
    const distance = Math.max(5.5, box.getSize(new THREE.Vector3()).length() * 1.7);
    this.controls.target.copy(center); this.camera.position.copy(center).add(new THREE.Vector3(distance * 0.7, distance * 0.4, distance));
    this.controls.update(); this.render();
  }

  clearField(): void { this.field = null; release(this.surfaces); this.container.dataset.vertices = '0'; delete this.container.dataset.surfaceOrbital; this.render(); }

  setField(field: OrbitalField, isovalue: number, mode: string): { vertices: number; clipped: boolean } {
    this.field = field; this.isovalue = isovalue; this.mode = mode; release(this.surfaces);
    if (mode === 'molecule') { this.render(); return { vertices: 0, clipped: false }; }
    const ink = this.dark ? 0xf2f2f2 : 0x171717;
    let vertices = 0;
    for (const sign of [1, -1]) {
      const phase = new THREE.Group(); phase.name = sign > 0 ? 'phase_positive' : 'phase_negative';
      if (mode === 'surface') {
        const material = new THREE.MeshStandardMaterial({ color: ink, side: THREE.DoubleSide, transparent: true, opacity: sign > 0 ? 0.38 : 0.28, wireframe: sign < 0, depthWrite: false, roughness: 0.8 });
        const cubes = new MarchingCubes(field.resolution, material, false, false, 50000);
        cubes.field.set(sign > 0 ? field.values : field.values.map(x => -x));
        cubes.isolation = isovalue; cubes.update();
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(cubes.positionArray.slice(0, cubes.count * 3), 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(cubes.normalArray.slice(0, cubes.count * 3), 3));
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = sign > 0 ? 'phase_positive' : 'phase_negative'; mesh.userData = { phase: sign, renderStyle: sign > 0 ? 'solid' : 'wireframe' };
        mesh.scale.setScalar(field.extentBohr * BOHR_ANGSTROM / 2);
        mesh.position.set(...field.centerBohr.map(x => x * BOHR_ANGSTROM) as [number, number, number]);
        phase.add(mesh); vertices += cubes.count; cubes.geometry.dispose();
      } else {
        const coordinates: number[] = [];
        let seed = 12345;
        for (let i = 0; i < field.values.length && coordinates.length < 12000; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          const psi = field.values[i];
          if (psi * sign <= 0 || seed / 4294967296 > (psi / field.maxAbs) ** 2) continue;
          const x = i % field.resolution, y = Math.floor(i / field.resolution) % field.resolution, z = Math.floor(i / field.resolution ** 2);
          coordinates.push(...[x, y, z].map((cell, d) => (field.centerBohr[d] + field.extentBohr * (cell / field.resolution - 0.5)) * BOHR_ANGSTROM));
        }
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
        const context = canvas.getContext('2d')!; context.strokeStyle = context.fillStyle = this.dark ? '#fff' : '#000';
        context.lineWidth = 4; context.beginPath(); context.arc(16, 16, 11, 0, Math.PI * 2);
        if (sign > 0) context.fill(); else context.stroke();
        const map = new THREE.CanvasTexture(canvas);
        const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(coordinates, 3));
        phase.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xffffff, map, size: 0.085, transparent: true, opacity: 0.55, depthWrite: false, alphaTest: 0.1 })));
        vertices += coordinates.length / 3;
      }
      let peak = -1, peakValue = isovalue;
      field.values.forEach((value, i) => { if (value * sign > peakValue) { peak = i; peakValue = value * sign; } });
      if (peak >= 0) {
        const cells = [peak % field.resolution, Math.floor(peak / field.resolution) % field.resolution, Math.floor(peak / field.resolution ** 2)];
        const label = this.label(sign > 0 ? '+' : '−', 0.32);
        label.position.set(...cells.map((cell, d) => (field.centerBohr[d] + field.extentBohr * (cell / field.resolution - 0.5)) * BOHR_ANGSTROM) as [number, number, number]);
        phase.add(label);
      }
      this.surfaces.add(phase);
    }
    this.container.dataset.vertices = String(vertices); this.render();
    return { vertices, clipped: field.boundaryMax >= isovalue };
  }

  setMoveEnabled(enabled: boolean): void { this.moveEnabled = enabled; this.renderer.domElement.style.cursor = enabled ? 'crosshair' : 'grab'; }
  setPlaceEnabled(enabled: boolean): void { this.placeEnabled = enabled; this.renderer.domElement.style.cursor = enabled ? 'crosshair' : 'grab'; }

  cameraState(): { position: [number, number, number]; target: [number, number, number] } {
    return { position: this.camera.position.toArray() as [number, number, number], target: this.controls.target.toArray() as [number, number, number] };
  }
  restoreCamera(camera: { position: [number, number, number]; target: [number, number, number] }): void {
    this.camera.position.set(...camera.position); this.controls.target.set(...camera.target); this.controls.update(); this.render();
  }
  capture(theme: 'dark' | 'light'): string {
    const previous = this.dark; this.setTheme(theme === 'dark');
    this.renderer.render(this.scene, this.camera);
    const canvas = document.createElement('canvas'); const source = this.renderer.domElement;
    const ratio = Math.min(1, 1100 / source.width, 800 / source.height); canvas.width = Math.round(source.width * ratio); canvas.height = Math.round(source.height * ratio);
    canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL('image/png'); this.setTheme(previous); this.renderer.render(this.scene, this.camera); return image;
  }
  exportRoot(): THREE.Group {
    this.scene.updateMatrixWorld(true); const root = new THREE.Group();
    for (const source of [this.atoms, ...this.surfaces.children]) {
      const group = new THREE.Group(); group.name = source === this.atoms ? 'atoms_and_proximity_connectors' : source.name;
      source.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh && !(object as THREE.Points).isPoints) return;
        const copy = object.clone(false); copy.matrix.copy(object.matrixWorld); copy.matrixAutoUpdate = false; group.add(copy);
      });
      root.add(group);
    }
    return root;
  }

  private ray(event: PointerEvent): THREE.Raycaster {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), this.camera);
    return this.raycaster;
  }

  private pointerDown(event: PointerEvent): void {
    if (this.placeEnabled && event.button === 0) {
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new THREE.Vector3()), this.controls.target);
      const position = new THREE.Vector3();
      if (this.ray(event).ray.intersectPlane(plane, position)) { event.stopImmediatePropagation(); this.onPlace?.(position.toArray() as [number, number, number]); }
      return;
    }
    if (!this.moveEnabled || event.button !== 0) return;
    const hit = this.ray(event).intersectObjects(this.atomMeshes)[0];
    if (!hit) return;
    event.stopImmediatePropagation();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new THREE.Vector3()), hit.object.position);
    this.dragging = { id: hit.object.userData.atomId, plane, offset: hit.object.position.clone().sub(hit.point) };
    this.controls.enabled = false; this.renderer.domElement.setPointerCapture(event.pointerId);
  }

  private pointerMove(event: PointerEvent): void {
    if (!this.dragging) return;
    const position = new THREE.Vector3();
    if (this.ray(event).ray.intersectPlane(this.dragging.plane, position)) {
      position.add(this.dragging.offset); this.onMove(this.dragging.id, position.toArray() as [number, number, number]);
    }
  }
}
