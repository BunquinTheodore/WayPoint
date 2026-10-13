import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Building, Point, Room, Route } from './types';
import { containsRoom } from './geometry';
import { displayedPoint, floorLayout, type FloorLayout } from './floor-layout';
import { routeDashes } from './route-presentation';
import { batchModel, releaseModel } from './model-optimization';

export type ZoomMode = 'building' | 'floor' | 'room';
export class BuildingViewer {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  private root?: THREE.Group;
  private loadSequence = 0;
  private selectedFloor = 0;
  private mode: ZoomMode = 'building';
  private modelMeshes: THREE.Mesh[] = [];
  private routeGroup = new THREE.Group();
  private marker = new THREE.Group();
  private destinationMarker = new THREE.Group();
  private labelElements = new Map<string, HTMLButtonElement>();
  // Elevator and stairs landings get their own chips so visitors can see and tap them.
  private connectionLabels = new Map<
    string,
    { element: HTMLButtonElement; node: Building['nodes'][number] }
  >();
  private cameraTween?: {
    start: number;
    from: THREE.Vector3;
    to: THREE.Vector3;
    targetFrom: THREE.Vector3;
    targetTo: THREE.Vector3;
  };
  private clipping = new THREE.Plane(new THREE.Vector3(0, -1, 0), 30);
  private clipHeight = 30;
  private lastTime = 0;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private needsFrame = true;
  private settlingUntil = 0;
  private requestFrame = () => {
    this.needsFrame = true;
    this.settlingUntil = performance.now() + 800;
  };
  private previousOpacity = new Map<THREE.Object3D, number>();
  private alive = true;
  private building?: Building;
  private selectedRoom?: string;
  private selectionGroup = new THREE.Group();
  private flat = false;
  private resizeObserver: ResizeObserver;
  private modelCenter = new THREE.Vector3(0, 4, 0);
  private overviewDistance = 70;
  private floorDistance = 36;
  private fullHeight = 30;
  private decorations = new THREE.Group();
  private exploded = false;
  private overviewActive = true;
  private backdrop = new THREE.Group();
  private layout: FloorLayout = { offsets: new Map(), visible: new Set() };
  private floorRoots = new Map<number, { object: THREE.Object3D; position: THREE.Vector3 }>();
  private floorClips = new Map<number, THREE.Plane>();
  private floorLabels = new Map<number, HTMLElement>();
  private modelWidth = 84;
  private sceneBounds = new THREE.Box3();
  private location?: { point: Point; floor: number };
  private routePath: Route | null = null;
  private routeEmergency = false;
  private hoveredFloor?: number;
  private gestureFloor?: number;
  private interacting = false;
  private hoverRay = new THREE.Raycaster();
  private hoverPointer?: THREE.Vector2;
  private hoverOutlineGroup = new THREE.Group();
  private hoverOutlines = new Map<THREE.Mesh, THREE.LineSegments>();
  private hoverOutlineMaterial = new THREE.LineBasicMaterial({
    color: '#34728b',
    depthTest: false,
    depthWrite: false,
  });
  private hoverGlow = new THREE.Color(0.035, 0.055, 0.07);
  private noGlow = new THREE.Color(0, 0, 0);
  private contentTop = 0;
  private contentBottom = Infinity;

  get isExploded() {
    return this.exploded;
  }

  constructor(
    private container: HTMLElement,
    private labels: HTMLElement,
    private onMode: (mode: ZoomMode) => void,
    private onRoom: (room: Room) => void,
    private onFloor: (floor: number) => void,
    private onNode: (node: Building['nodes'][number]) => void = () => {},
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        window.matchMedia('(pointer: coarse)').matches ? 1.25 : 1.5,
      ),
    );
    this.renderer.setClearColor('#ffffff', 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.localClippingEnabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Interactive 3D building. Hover to preview a floor; click or tap it to open. Drag to rotate; pinch or scroll to zoom.',
    );
    this.renderer.domElement.setAttribute('role', 'img');
    container.append(this.renderer.domElement);
    this.camera.position.set(43, 36, 44);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 4, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.085;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 220;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minPolarAngle = 0.05;
    this.controls.zoomToCursor = false;
    this.controls.touches.ONE = THREE.TOUCH.ROTATE;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    this.controls.addEventListener('change', this.requestFrame);
    this.reducedMotion.addEventListener('change', this.requestFrame);
    this.controls.addEventListener('start', () => {
      this.requestFrame();
      this.cameraTween = undefined;
      this.gestureFloor = this.hoveredFloor;
      this.interacting = true;
      this.hoveredFloor = undefined;
      this.renderer.domElement.style.cursor = '';
    });
    this.controls.addEventListener('end', () => {
      this.interacting = false;
      this.updateHover();
    });
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 1.55));
    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
    sun.position.set(18, 35, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -35;
    sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.29;
    ground.receiveShadow = true;
    this.backdrop.add(ground);
    const grid = new THREE.GridHelper(180, 90, '#e5e5e5', '#f0f0f0');
    grid.position.y = -0.28;
    this.backdrop.add(grid);
    this.scene.add(this.backdrop);
    const gardenMaterial = new THREE.MeshStandardMaterial({ color: '#dedede', roughness: 1 });
    for (const [x, z, width, depth] of [
      [-23, -10, 5, 14],
      [24, 7, 5, 13],
      [-3, -17, 25, 3],
    ]) {
      const garden = new THREE.Mesh(new THREE.BoxGeometry(width, 0.18, depth), gardenMaterial);
      garden.position.set(x, -0.17, z);
      garden.receiveShadow = true;
      this.decorations.add(garden);
    }
    for (const x of [-19, 19]) {
      const circle = new THREE.Mesh(
        new THREE.RingGeometry(1, 1.06, 64),
        new THREE.MeshBasicMaterial({ color: '#666666', side: THREE.DoubleSide }),
      );
      circle.rotation.x = -Math.PI / 2;
      circle.position.set(x, 0.025, 0);
      this.decorations.add(circle);
    }
    const locationDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.22, 48),
      new THREE.MeshBasicMaterial({ color: '#2563eb', side: THREE.DoubleSide }),
    );
    const locationBorder = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.27, 48),
      new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }),
    );
    const locationHalo = new THREE.Mesh(
      new THREE.RingGeometry(0.27, 0.35, 48),
      new THREE.MeshBasicMaterial({
        color: '#2563eb',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
      }),
    );
    for (const circle of [locationDot, locationBorder, locationHalo]) {
      circle.rotation.x = -Math.PI / 2;
      circle.position.y = 0.025;
      this.marker.add(circle);
    }
    this.marker.name = 'Blue location circle';
    this.marker.visible = false;
    const icon = document.createElement('canvas');
    icon.width = 128;
    icon.height = 160;
    const ink = icon.getContext('2d')!;
    ink.beginPath();
    ink.moveTo(64, 151);
    ink.bezierCurveTo(44, 120, 13, 85, 13, 57);
    ink.arc(64, 57, 51, Math.PI, 0);
    ink.bezierCurveTo(115, 85, 84, 120, 64, 151);
    ink.fillStyle = '#111111';
    ink.fill();
    ink.lineWidth = 5;
    ink.strokeStyle = '#ffffff';
    ink.stroke();
    ink.beginPath();
    ink.arc(64, 55, 18, 0, Math.PI * 2);
    ink.fillStyle = '#ffffff';
    ink.fill();
    const destination = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(icon), depthTest: false }),
    );
    destination.center.set(0.5, 0);
    destination.scale.set(1.4, 1.75, 1);
    destination.position.y = 0.1;
    destination.renderOrder = 15;
    this.destinationMarker.add(destination);
    this.destinationMarker.visible = false;
    this.scene.add(
      this.decorations,
      this.routeGroup,
      this.marker,
      this.destinationMarker,
      this.selectionGroup,
      this.hoverOutlineGroup,
    );
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
    let down: { id: number; x: number; y: number; floor?: number } | undefined;
    const pointers = new Set<number>();
    let multiPointer = false;
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      pointers.add(e.pointerId);
      if (pointers.size > 1) {
        multiPointer = true;
        return;
      }
      multiPointer = false;
      const rect = this.renderer.domElement.getBoundingClientRect();
      down = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        floor:
          (e.pointerType === 'mouse' ? this.gestureFloor : undefined) ??
          this.pickFloor(
            new THREE.Vector2(
              ((e.clientX - rect.left) / rect.width) * 2 - 1,
              1 - ((e.clientY - rect.top) / rect.height) * 2,
            ),
          ),
      };
    });
    this.renderer.domElement.addEventListener('pointermove', (e) => {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.hoverPointer =
        e.pointerType === 'mouse'
          ? new THREE.Vector2(
              ((e.clientX - rect.left) / rect.width) * 2 - 1,
              1 - ((e.clientY - rect.top) / rect.height) * 2,
            )
          : undefined;
      this.updateHover();
    });
    this.renderer.domElement.addEventListener('pointerleave', () => {
      this.requestFrame();
      this.hoverPointer = undefined;
      this.hoveredFloor = undefined;
      this.renderer.domElement.style.cursor = '';
    });
    this.renderer.domElement.addEventListener('pointercancel', (e) => {
      pointers.delete(e.pointerId);
      down = undefined;
    });
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      pointers.delete(e.pointerId);
      if (
        !down ||
        e.pointerId !== down.id ||
        multiPointer ||
        Math.hypot(e.clientX - down.x, e.clientY - down.y) > 7
      )
        return;
      const floor = down.floor;
      down = undefined;
      if (floor !== undefined && (this.mode === 'building' || floor !== this.selectedFloor)) {
        this.onFloor(floor);
        return;
      }
      if (this.mode === 'building') return;
      const rect = this.container.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        this.camera,
      );
      const plane = new THREE.Plane(
        new THREE.Vector3(0, 1, 0),
        -(
          (this.building?.floors.find((floor) => floor.id === this.selectedFloor)?.height ?? 0) +
          (this.layout.offsets.get(this.selectedFloor) ?? 0) +
          0.1
        ),
      );
      const point = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, point)) return;
      const room = this.building?.rooms.find(
        (r) => r.floor === this.selectedFloor && containsRoom(r, point.x, point.z),
      );
      if (room) this.onRoom(room);
    });
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.onMode('floor');
      container.dispatchEvent(new CustomEvent('viewer-error'));
    });
  }

  private updateHover() {
    const previous = this.hoveredFloor;
    this.hoveredFloor =
      this.hoverPointer && !this.interacting && !this.cameraTween
        ? this.pickFloor(this.hoverPointer)
        : undefined;
    if (previous !== this.hoveredFloor) this.requestFrame();
    this.renderer.domElement.style.cursor = this.hoveredFloor !== undefined ? 'pointer' : '';
  }
  private pickFloor(pointer: THREE.Vector2): number | undefined {
    this.hoverRay.setFromCamera(pointer, this.camera);
    // Pick actual model geometry so rotated and exploded floors keep their
    // hover targets. Faded floors stay pickable; clipped geometry does not.
    for (const hit of this.hoverRay.intersectObjects(this.modelMeshes, false)) {
      const mesh = hit.object as THREE.Mesh;
      if (!mesh.visible) continue;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const material = materials[hit.face?.materialIndex ?? 0] ?? materials[0];
      if (material.clippingPlanes?.some((plane) => plane.distanceToPoint(hit.point) < 0)) continue;
      const floor = mesh.userData.viewerFloor as number | undefined;
      if (floor !== undefined) return floor;
      if (mesh.userData.viewerRoof) {
        return this.building?.floors.reduce((top, floor) =>
          floor.height > top.height ? floor : top,
        ).id;
      }
    }
  }

  async load(building: Building, data: Uint8Array) {
    const sequence = ++this.loadSequence;
    if (!this.alive || sequence !== this.loadSequence) return;
    this.clearHoverOutlines();
    if (this.root) {
      this.scene.remove(this.root);
      releaseModel(this.root);
      this.root = undefined;
    }
    this.clearSelection();
    this.modelMeshes = [];
    this.previousOpacity.clear();
    this.hoveredFloor = undefined;
    this.gestureFloor = undefined;
    this.hoverPointer = undefined;
    this.floorRoots.clear();
    this.floorClips.clear();
    this.floorLabels.clear();
    this.location = undefined;
    this.routePath = null;
    this.destinationMarker.visible = false;
    this.labels.replaceChildren();
    this.labelElements.clear();
    this.building = building;
    const gltf = await new GLTFLoader().parseAsync(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
      '',
    );
    if (!this.alive || sequence !== this.loadSequence) {
      releaseModel(gltf.scene);
      return;
    }
    batchModel(gltf.scene);
    this.root = gltf.scene;
    this.scene.add(this.root);
    const bounds = new THREE.Box3().setFromObject(this.root);
    const size = bounds.getSize(new THREE.Vector3());
    bounds.getCenter(this.modelCenter);
    this.sceneBounds.copy(bounds);
    // The fixed 240 m platform was smaller than this long mall. Keep a generous
    // margin and position it below the lowest slab without affecting camera fit.
    const groundWidth = building.id === 'robinsons-manila' ? size.x + 90 : 240;
    const groundDepth = building.id === 'robinsons-manila' ? size.z + 90 : 240;
    this.backdrop.scale.set(groundWidth / 240, 1, groundDepth / 240);
    this.backdrop.position.set(
      this.modelCenter.x,
      Math.min(0, bounds.min.y - 0.08 + 0.29),
      this.modelCenter.z,
    );
    this.modelWidth = Math.max(size.x, size.z);
    this.overviewDistance = Math.max(
      70,
      Math.max(size.x, size.y, size.z) * (this.camera.aspect > 1.25 ? 1.75 : 2.1),
    );
    this.floorDistance = Math.max(
      36,
      Math.max(size.x, size.z) * (building.floors.length === 1 ? 1.6 : 1.08),
    );
    this.fullHeight = bounds.max.y + 5;
    this.clipHeight = this.fullHeight;
    this.clipping.constant = this.fullHeight;
    this.controls.maxDistance = this.overviewDistance * 5;
    this.camera.far = Math.max(400, this.controls.maxDistance * 2);
    this.camera.updateProjectionMatrix();
    this.selectedRoom = undefined;
    this.marker.visible = false;
    this.decorations.visible = building.id === 'demo-001';
    const originalMaterials = new Set<THREE.Material>();
    const originalTextures = new Set<THREE.Texture>();
    this.root.traverse((o) => {
      if (o.userData.floor_id !== undefined) {
        const id = Number(o.userData.floor_id);
        if (!this.floorRoots.has(id))
          this.floorRoots.set(id, { object: o, position: o.position.clone() });
      }
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
          originalMaterials.add(material);
          for (const value of Object.values(material))
            if (value instanceof THREE.Texture) originalTextures.add(value);
        }
        o.material = Array.isArray(o.material)
          ? o.material.map((m) => m.clone())
          : o.material.clone();
        for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
          material.clippingPlanes = [this.clipping];
          if (
            material instanceof THREE.MeshStandardMaterial ||
            material instanceof THREE.MeshBasicMaterial
          ) {
            // Preserve a restrained blue accent for glazing; keep other surfaces neutral.
            const gray =
              material.color.r * 0.2126 + material.color.g * 0.7152 + material.color.b * 0.0722;
            const glass = /glass|glaz/i.test(material.name);
            if (glass) material.color.set('#a3c7dc');
            else if (!material.name.startsWith('Reference:'))
              material.color.setRGB(gray, gray, gray);
            // Imported color textures can reintroduce chromatic colors into the scene.
            material.map = null;
            if (material instanceof THREE.MeshStandardMaterial) {
              material.emissive.setScalar(0);
              material.emissiveMap = null;
              if (glass) {
                material.roughness = 0.25;
                material.metalness = 0.12;
              }
            }
            material.needsUpdate = true;
          }
        }
        this.modelMeshes.push(o);
        let parent: THREE.Object3D | null = o;
        while (parent) {
          if (parent.userData.floor_id !== undefined)
            o.userData.viewerFloor = parent.userData.floor_id;
          // glTF can split a furnishing into several material meshes. Inherit
          // its detail flag so every part fades together with its floor.
          if (parent.userData.illustrative_detail || parent.userData.asset_name)
            o.userData.viewerDetail = true;
          if (parent.userData.shell) o.userData.viewerShell = true;
          if (parent.name === 'Roof' || parent.userData.roof) o.userData.viewerRoof = true;
          parent = parent.parent;
        }
        if (
          o.userData.viewerFloor !== undefined &&
          /floor.slab|atrium.*floor|concept.wing|estimated.floor.outline/i.test(o.name)
        ) {
          const outline = new THREE.LineSegments(
            new THREE.EdgesGeometry(o.geometry),
            this.hoverOutlineMaterial,
          );
          outline.matrixAutoUpdate = false;
          outline.visible = false;
          outline.renderOrder = 11;
          this.hoverOutlineGroup.add(outline);
          this.hoverOutlines.set(o, outline);
        }
      }
    });
    const usedTextures = new Set<THREE.Texture>();
    for (const mesh of this.modelMeshes)
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
        for (const value of Object.values(material))
          if (value instanceof THREE.Texture) usedTextures.add(value);
    for (const material of originalMaterials) material.dispose();
    for (const texture of originalTextures) if (!usedTextures.has(texture)) texture.dispose();
    this.renderer.shadowMap.needsUpdate = true;
    const labelMeasure = document.createElement('canvas').getContext('2d')!;
    labelMeasure.font = '500 10px Arial';
    for (const room of building.rooms) {
      const button = document.createElement('button');
      button.className = 'room-label';
      button.textContent = room.name;
      button.title = room.name;
      button.setAttribute('aria-label', room.name);
      // Match the compact CSS chip without measuring DOM layout during animation.
      button.style.width = `${Math.min(104, Math.ceil(labelMeasure.measureText(room.name).width) + 12)}px`;
      button.dataset.room = room.id;
      button.addEventListener('click', () => this.onRoom(room));
      this.labels.append(button);
      this.labelElements.set(room.id, button);
    }
    this.connectionLabels.clear();
    const landings = new Map<string, 'elevator' | 'stairs'>();
    for (const edge of building.edges)
      if (edge.kind === 'elevator' || edge.kind === 'stairs')
        for (const id of [edge.from, edge.to]) landings.set(id, edge.kind);
    for (const node of building.nodes) {
      const kind = landings.get(node.id);
      if (!kind) continue;
      const button = document.createElement('button');
      button.className = `room-label connection ${kind}`;
      button.textContent = kind === 'elevator' ? 'Elevator' : 'Stairs';
      button.title = `${node.label} · tap for a route`;
      button.setAttribute('aria-label', `Route to ${node.label}`);
      button.style.width = `${Math.ceil(labelMeasure.measureText(button.textContent).width) + 24}px`;
      button.dataset.node = node.id;
      button.addEventListener('click', () => this.onNode(node));
      this.labels.append(button);
      this.connectionLabels.set(node.id, { element: button, node });
    }
    for (const floor of building.floors) {
      const label = document.createElement('span');
      label.className = 'floor-stack-label';
      label.textContent = floor.id === 0 ? 'G' : String(floor.id + 1).padStart(2, '0');
      label.setAttribute('aria-hidden', 'true');
      this.labels.append(label);
      this.floorLabels.set(floor.id, label);
    }
    this.selectedFloor = building.floors[0]?.id ?? 0;
    this.overview();
  }

  setFloor(floor: number, focus = true) {
    this.selectedFloor = floor;
    this.applyFloorLayout();
    if (
      this.selectedRoom &&
      this.building?.rooms.find((room) => room.id === this.selectedRoom)?.floor !== floor
    )
      this.clearSelection();
    if (focus) this.overviewActive = false;
    if (focus)
      this.fly(
        [
          this.modelCenter.x,
          (this.building?.floors.find((f) => f.id === floor)?.height ?? 0) +
            (this.layout.offsets.get(floor) ?? 0) +
            0.5,
          this.modelCenter.z,
        ],
        this.floorDistance,
      );
  }
  focusRoom(room: Room) {
    this.overviewActive = false;
    this.selectedFloor = room.floor;
    this.applyFloorLayout();
    this.highlightRoom(room);
    this.selectionGroup.position.y = this.layout.offsets.get(room.floor) ?? 0;
    this.fly(
      displayedPoint(room.position, room.floor, this.layout),
      Math.max(17, Math.max(...room.size) * 2),
    );
  }
  clearSelection() {
    this.requestFrame();
    this.selectedRoom = undefined;
    this.selectionGroup.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material])
          material.dispose();
      }
    });
    this.selectionGroup.clear();
    this.selectionGroup.position.y = 0;
  }
  private highlightRoom(room: Room) {
    this.clearSelection();
    this.selectedRoom = room.id;
    const [x, y, z] = room.position;
    const [width, depth] = room.size;
    const footprint = room.footprint ?? [
      [x - width / 2, z - depth / 2],
      [x + width / 2, z - depth / 2],
      [x + width / 2, z + depth / 2],
      [x - width / 2, z + depth / 2],
    ];
    const shape = new THREE.Shape(footprint.map(([px, pz]) => new THREE.Vector2(px, -pz)));
    const fill = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({
        color: '#111111',
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = y + 0.08;
    this.selectionGroup.add(fill);
    // Geometry outlines remain visible on mobile where WebGL line width is limited.
    for (let i = 0; i < footprint.length; i++) {
      const a = new THREE.Vector3(footprint[i][0], y + 0.1, footprint[i][1]);
      const next = footprint[(i + 1) % footprint.length];
      const b = new THREE.Vector3(next[0], y + 0.1, next[1]);
      const direction = b.clone().sub(a);
      if (direction.length() < 0.001) continue;
      for (const [radius, color, order] of [
        [0.12, '#ffffff', 12],
        [0.055, '#111111', 13],
      ] as const) {
        const edge = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, direction.length(), 8),
          new THREE.MeshBasicMaterial({ color, depthTest: false }),
        );
        edge.position.copy(a).add(b).multiplyScalar(0.5);
        edge.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction.clone().normalize(),
        );
        edge.renderOrder = order;
        this.selectionGroup.add(edge);
      }
    }
  }
  toggleExploded() {
    if (!this.floorRoots.size) return;
    this.overview(!this.exploded);
  }
  private applyFloorLayout() {
    this.requestFrame();
    if (!this.building || !this.root) return;
    this.hoveredFloor = undefined;
    this.backdrop.visible = !this.exploded;
    this.decorations.visible = !this.exploded && this.building.id === 'demo-001';
    this.layout = floorLayout(this.building.floors, this.selectedFloor, this.exploded);
    for (const [id, entry] of this.floorRoots) {
      const offset = this.layout.offsets.get(id) ?? 0;
      const inverse = entry.object.parent!.matrixWorld.clone().invert();
      const localOffset = new THREE.Vector3(0, offset, 0)
        .applyMatrix4(inverse)
        .sub(new THREE.Vector3().applyMatrix4(inverse));
      entry.object.position.copy(entry.position).add(localOffset);
      const height = (this.building.floors.find((floor) => floor.id === id)?.height ?? 0) + offset;
      let clip = this.floorClips.get(id);
      if (!clip) {
        clip = new THREE.Plane(new THREE.Vector3(0, -1, 0));
        this.floorClips.set(id, clip);
      }
      clip.constant = height + 1.5;
    }
    this.root.updateMatrixWorld(true);
    this.renderer.shadowMap.needsUpdate = true;
    for (const [mesh, outline] of this.hoverOutlines) outline.matrix.copy(mesh.matrixWorld);
    const bounds = new THREE.Box3();
    for (const mesh of this.modelMeshes) {
      const floor = mesh.userData.viewerFloor as number | undefined;
      if (this.exploded && (mesh.userData.viewerRoof || mesh.userData.viewerShell)) continue;
      if (this.exploded && (floor === undefined || !this.layout.visible.has(floor))) continue;
      bounds.expandByObject(mesh);
    }
    if (bounds.isEmpty()) bounds.copy(this.sceneBounds);
    bounds.getCenter(this.modelCenter);
    const fittedDistance = (box: THREE.Box3) => {
      const center = box.getCenter(new THREE.Vector3());
      const direction = this.overviewDirection();
      const right = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
      const up = direction.clone().cross(right).normalize();
      const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
      const tanH = tanV * this.camera.aspect;
      let distance = 0;
      for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
          for (const z of [box.min.z, box.max.z]) {
            const corner = new THREE.Vector3(x, y, z).sub(center);
            distance = Math.max(
              distance,
              corner.dot(direction) +
                Math.max(Math.abs(corner.dot(right)) / tanH, Math.abs(corner.dot(up)) / tanV),
            );
          }
      return Math.max(30, distance * 1.08) / Math.max(1, 0.95 / this.camera.aspect);
    };
    this.overviewDistance = fittedDistance(bounds);
    const selectedBounds = new THREE.Box3();
    for (const mesh of this.modelMeshes)
      if (mesh.userData.viewerFloor === this.selectedFloor && !mesh.userData.viewerShell)
        selectedBounds.expandByObject(mesh);
    if (!selectedBounds.isEmpty()) this.floorDistance = fittedDistance(selectedBounds);
    this.marker.scale.setScalar(Math.max(1, this.modelWidth / 20));
    this.destinationMarker.scale.copy(this.marker.scale);
    this.controls.maxDistance = Math.max(220, this.overviewDistance * 5);
    this.camera.far = this.controls.maxDistance * 2;
    this.camera.updateProjectionMatrix();
    for (const mesh of this.modelMeshes) {
      const floor = mesh.userData.viewerFloor as number | undefined;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
        material.clippingPlanes = [
          this.exploded && floor !== undefined ? this.floorClips.get(floor)! : this.clipping,
        ];
    }
    if (this.location)
      this.marker.position.set(
        ...displayedPoint(this.location.point, this.location.floor, this.layout),
      );
    const room = this.building.rooms.find((room) => room.id === this.selectedRoom);
    this.selectionGroup.position.y = room ? (this.layout.offsets.get(room.floor) ?? 0) : 0;
    this.setRoute(this.routePath, this.routeEmergency);
  }
  overview(exploded = false) {
    this.exploded = exploded && this.floorRoots.size > 0;
    this.overviewActive = true;
    this.clearSelection();
    this.flat = false;
    this.applyFloorLayout();
    this.fly(this.modelCenter.toArray() as Point, this.overviewDistance);
    this.onMode('building');
  }
  zoom(factor: number) {
    this.cameraTween = undefined;
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.multiplyScalar(factor);
    offset.clampLength(this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
  }
  toggleFlat() {
    this.overviewActive = false;
    this.flat = !this.flat;
    this.fly(
      [
        this.modelCenter.x,
        (this.building?.floors.find((f) => f.id === this.selectedFloor)?.height ?? 0) +
          (this.layout.offsets.get(this.selectedFloor) ?? 0) +
          0.2,
        this.modelCenter.z,
      ],
      this.floorDistance,
    );
  }
  locate(position: Point, floor = this.selectedFloor) {
    this.requestFrame();
    this.location = { point: [...position], floor };
    this.marker.position.set(...displayedPoint(position, floor, this.layout));
    this.marker.visible = true;
  }
  setRoute(path: Route | null, emergency = false) {
    this.requestFrame();
    this.routePath = path;
    this.routeEmergency = emergency;
    this.routeGroup.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        if (o instanceof THREE.InstancedMesh) o.dispose();
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.routeGroup.clear();
    this.destinationMarker.visible = false;
    if (!path) return;
    if (['sm-marikina', 'estancia-main-gf'].includes(this.building?.id ?? '')) {
      this.dashedRoute(path, emergency);
      return;
    }
    const material = new THREE.MeshStandardMaterial({
      color: '#111111',
      emissive: '#111111',
      emissiveIntensity: 0,
      roughness: 0.6,
      depthTest: false,
    });
    for (let i = 0; i < path.nodes.length - 1; i++) {
      const a = new THREE.Vector3(
        ...displayedPoint(path.nodes[i].position, path.nodes[i].floor, this.layout),
      ).add(new THREE.Vector3(0, 0.1, 0));
      const b = new THREE.Vector3(
        ...displayedPoint(path.nodes[i + 1].position, path.nodes[i + 1].floor, this.layout),
      ).add(new THREE.Vector3(0, 0.1, 0));
      const direction = b.clone().sub(a);
      if (direction.length() < 0.001) continue;
      const line = new THREE.Mesh(
        new THREE.CylinderGeometry(
          emergency ? 0.11 : 0.07,
          emergency ? 0.11 : 0.07,
          direction.length(),
          10,
        ),
        material,
      );
      line.position.copy(a).add(b).multiplyScalar(0.5);
      line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      line.renderOrder = 10;
      line.userData.floorA = path.nodes[i].floor;
      line.userData.floorB = path.nodes[i + 1].floor;
      this.routeGroup.add(line);
      if (i % 2 === 0) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), material);
        dot.position.copy(a);
        dot.renderOrder = 11;
        dot.userData.floorA = path.nodes[i].floor;
        dot.userData.floorB = path.nodes[i].floor;
        this.routeGroup.add(dot);
      }
    }
    const destination = path.nodes.at(-1)!;
    this.destinationMarker.position.set(
      ...displayedPoint(destination.position, destination.floor, this.layout),
    );
    this.destinationMarker.visible = true;
  }

  private dashedRoute(path: Route, emergency: boolean) {
    const points = path.nodes.map((node) => {
      const point = displayedPoint(node.position, node.floor, this.layout);
      return [point[0], point[1] + 0.1, point[2]] as Point;
    });
    const distance = path.edges.reduce((sum, edge) => sum + edge.distance, 0);
    const dash = Math.max(0.6, this.modelWidth / 70, distance / 1000);
    const parts = routeDashes(points, dash, dash * 0.55);
    // Instance repeated cylinders by floor pair to keep mobile draw calls bounded.
    const groups = new Map<string, typeof parts>();
    for (const part of parts) {
      const key = `${path.nodes[part.segment].floor}:${path.nodes[part.segment + 1].floor}`;
      const group = groups.get(key) ?? [];
      group.push(part);
      groups.set(key, group);
    }
    const radius = Math.max(0.07, this.modelWidth / 420) * (emergency ? 1.3 : 1);
    for (const [key, group] of groups) {
      for (const [size, color, order] of [
        [radius * 1.7, '#ffffff', 10],
        [radius, '#111111', 11],
      ] as const) {
        const mesh = new THREE.InstancedMesh(
          new THREE.CylinderGeometry(size, size, 1, 8),
          new THREE.MeshBasicMaterial({ color, depthTest: false }),
          group.length,
        );
        group.forEach((part, i) => {
          const a = new THREE.Vector3(...part.from),
            b = new THREE.Vector3(...part.to);
          const direction = b.clone().sub(a);
          const transform = new THREE.Matrix4().compose(
            a.clone().add(b).multiplyScalar(0.5),
            new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              direction.clone().normalize(),
            ),
            new THREE.Vector3(1, direction.length(), 1),
          );
          mesh.setMatrixAt(i, transform);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.renderOrder = order;
        [mesh.userData.floorA, mesh.userData.floorB] = key.split(':').map(Number);
        this.routeGroup.add(mesh);
      }
    }
    const destination = path.nodes.at(-1)!;
    this.destinationMarker.position.set(
      ...displayedPoint(destination.position, destination.floor, this.layout),
    );
    this.destinationMarker.visible = true;
  }

  dispose() {
    this.clearHoverOutlines();
    this.hoverOutlineMaterial.dispose();
    this.setRoute(null);
    const pin = this.destinationMarker.children[0] as THREE.Sprite;
    pin.material.map?.dispose();
    pin.material.dispose();
    this.clearSelection();
    this.alive = false;
    this.loadSequence++;
    this.resizeObserver.disconnect();
    this.renderer.setAnimationLoop(null);
    this.controls.dispose();
    this.reducedMotion.removeEventListener('change', this.requestFrame);
    releaseModel(this.marker);
    if (this.root) releaseModel(this.root);
    releaseModel(this.backdrop);
    releaseModel(this.decorations);
    this.root = undefined;
    this.modelMeshes = [];
    this.labelElements.clear();
    this.floorLabels.clear();
    this.floorRoots.clear();
    this.previousOpacity.clear();
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
  }
  private clearHoverOutlines() {
    for (const outline of this.hoverOutlines.values()) outline.geometry.dispose();
    this.hoverOutlines.clear();
    this.hoverOutlineGroup.clear();
  }
  private overviewDirection() {
    // View the long Robinsons wings from their broad side and entrance frontage.
    return new THREE.Vector3(
      this.building?.id === 'robinsons-manila' ? -1 : 1,
      0.92,
      1.15,
    ).normalize();
  }
  private fly(target: Point, distance: number) {
    const targetTo = new THREE.Vector3(...target);
    const direction = this.flat
      ? new THREE.Vector3(0, 1, 0.05).normalize()
      : this.overviewDirection();
    this.cameraTween = {
      start: performance.now(),
      from: this.camera.position.clone(),
      to: targetTo
        .clone()
        .addScaledVector(direction, distance * Math.max(1, 0.95 / this.camera.aspect)),
      targetFrom: this.controls.target.clone(),
      targetTo,
    };
  }
  refreshViewport() {
    this.resize();
  }
  private resize() {
    const width = this.container.clientWidth,
      height = this.container.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    const map = this.container.parentElement!;
    const dock = Number.parseFloat(getComputedStyle(map).getPropertyValue('--dock-height')) || 0;
    const mapTop = map.getBoundingClientRect().top;
    const headerBottom = Math.max(
      ...['.map-heading', '.view-chip'].map((selector) => {
        const element = map.querySelector<HTMLElement>(selector);
        return element?.getClientRects().length ? element.getBoundingClientRect().bottom : mapTop;
      }),
    );
    const top = Math.max(0, headerBottom - mapTop + 8);
    this.contentTop = top;
    this.contentBottom = height - dock;
    const visibleHeight = Math.max(80, height - top - dock);
    if (top > 0 || dock > 0) {
      // Frame the building between the floating header and panels while drawing
      // the scene across the entire screen behind both overlays.
      this.camera.setViewOffset(width, visibleHeight, 0, -top, width, height);
    } else {
      this.camera.clearViewOffset();
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
    if (this.building) {
      this.applyFloorLayout();
      if (this.mode === 'building' && !this.selectedRoom && !this.routePath)
        this.fly(this.modelCenter.toArray() as Point, this.overviewDistance);
    }
  }
  private frame() {
    if (!this.alive) return;
    if (document.hidden) return;
    const now = performance.now();
    if (!this.needsFrame && !this.cameraTween && !this.interacting && now > this.settlingUntil)
      return;
    const frameInterval = this.interacting || this.cameraTween ? 1000 / 60 : 1000 / 30;
    if (now - this.lastTime < frameInterval - 1) return;
    const delta = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    if (this.cameraTween) {
      const t = this.reducedMotion.matches ? 1 : Math.min((now - this.cameraTween.start) / 750, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      this.camera.position.lerpVectors(this.cameraTween.from, this.cameraTween.to, eased);
      this.controls.target.lerpVectors(
        this.cameraTween.targetFrom,
        this.cameraTween.targetTo,
        eased,
      );
      if (t === 1) this.cameraTween = undefined;
    }
    this.controls.update();
    const distance =
      this.camera.position.distanceTo(this.controls.target) /
      Math.max(1, 0.95 / this.camera.aspect);
    // Keep the complete exterior while zooming. Only explicit floor/room
    // selection or top-down view enables the interior cutaway.
    const buildingThreshold = this.floorDistance * 1.44;
    const mode: ZoomMode =
      this.overviewActive || distance > buildingThreshold
        ? 'building'
        : distance > this.floorDistance * 0.69
          ? 'floor'
          : 'room';
    if (mode !== this.mode) {
      this.mode = mode;
      this.onMode(mode);
    }
    const floorHeight = this.building?.floors.find((f) => f.id === this.selectedFloor)?.height ?? 0;
    const reveal =
      mode === 'building'
        ? 1
        : THREE.MathUtils.smoothstep(distance, this.floorDistance * 0.94, buildingThreshold);
    const targetHeight = THREE.MathUtils.lerp(floorHeight + 1.25, this.fullHeight, reveal);
    this.clipHeight = THREE.MathUtils.damp(this.clipHeight, targetHeight, 9, delta);
    this.clipping.constant = this.clipHeight;
    for (const mesh of this.modelMeshes) {
      const floor = mesh.userData.viewerFloor as number | undefined;
      const roof = mesh.userData.viewerRoof;
      let targetOpacity = this.exploded
        ? roof ||
          mesh.userData.viewerShell ||
          (floor !== undefined && !this.layout.visible.has(floor))
          ? 0
          : floor !== undefined && floor !== this.selectedFloor
            ? 0.28
            : 1
        : roof || (floor !== undefined && floor > this.selectedFloor)
          ? reveal
          : 1;
      if (this.hoveredFloor !== undefined) {
        if (floor === this.hoveredFloor && targetOpacity > 0) targetOpacity = 1;
        else if (roof || floor !== undefined)
          targetOpacity = Math.min(targetOpacity, mesh.userData.viewerDetail ? 0.01 : 0.04);
      }
      const opacity = this.reducedMotion.matches
        ? targetOpacity
        : THREE.MathUtils.damp(this.previousOpacity.get(mesh) ?? 1, targetOpacity, 10, delta);
      this.previousOpacity.set(mesh, opacity);
      const visible = opacity > (mesh.userData.viewerDetail ? 0.002 : 0.02);
      const castShadow = opacity > 0.5 && !mesh.userData.viewerDetail;
      if (mesh.visible !== visible || mesh.castShadow !== castShadow)
        this.renderer.shadowMap.needsUpdate = true;
      mesh.visible = visible;
      mesh.castShadow = castShadow;
      const hovered = this.hoveredFloor !== undefined && floor === this.hoveredFloor;
      const outline = this.hoverOutlines.get(mesh);
      if (outline) outline.visible = hovered && mesh.visible;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        m.opacity = opacity;
        const transparent = opacity < 0.99;
        if (m.transparent !== transparent) {
          m.transparent = transparent;
          // Imported opaque glTF materials need a new shader variant to
          // respect opacity when they first enter a floor fade.
          m.needsUpdate = true;
        }
        m.depthWrite = opacity > 0.97;
        if (m instanceof THREE.MeshStandardMaterial)
          m.emissive.lerp(
            hovered ? this.hoverGlow : this.noGlow,
            this.reducedMotion.matches ? 1 : 1 - Math.exp(-10 * delta),
          );
      }
    }
    this.marker.visible =
      !!this.location && (!this.exploded || this.layout.visible.has(this.location.floor));
    const destination = this.routePath?.nodes.at(-1);
    this.destinationMarker.visible =
      !!destination && (!this.exploded || this.layout.visible.has(destination.floor));
    this.selectionGroup.visible =
      (this.exploded || this.mode !== 'building') &&
      this.building?.rooms.find((room) => room.id === this.selectedRoom)?.floor ===
        this.selectedFloor;
    const compactViewport = this.container.clientWidth < 600;
    const labelLimit = this.mode === 'room' ? (compactViewport ? 8 : 14) : compactViewport ? 4 : 6;
    const occupied: { x: number; y: number; w: number; h: number }[] = [];
    const orderedRooms = [...(this.building?.rooms ?? [])].sort(
      (a, b) => Number(b.id === this.selectedRoom) - Number(a.id === this.selectedRoom),
    );
    for (const room of orderedRooms) {
      const el = this.labelElements.get(room.id)!;
      const position = displayedPoint(room.position, room.floor, this.layout);
      const pos = new THREE.Vector3(position[0], position[1] + 0.4, position[2]).project(
        this.camera,
      );
      let visible =
        (this.mode !== 'building' || room.id === this.selectedRoom) &&
        room.floor === this.selectedFloor &&
        Math.abs(pos.x) < 0.98 &&
        Math.abs(pos.y) < 0.95 &&
        pos.z > -1 &&
        pos.z < 1;
      const x = ((pos.x + 1) / 2) * this.container.clientWidth;
      const y = ((-pos.y + 1) / 2) * this.container.clientHeight;
      if (visible) {
        // Reserve the destination first; apply spacing on every floor, including sparse ones.
        const w = Number.parseFloat(el.style.width),
          h = 20;
        visible =
          x > w / 2 + 4 &&
          x < this.container.clientWidth - w / 2 - 4 &&
          y > this.contentTop + h / 2 + 4 &&
          y < this.contentBottom - h / 2 - 4 &&
          occupied.length < labelLimit &&
          !occupied.some(
            (r) => Math.abs(x - r.x) < (w + r.w) / 2 + 10 && Math.abs(y - r.y) < (h + r.h) / 2 + 10,
          );
        if (visible) occupied.push({ x, y, w, h });
      }
      el.hidden = !visible;
      el.classList.toggle('selected', room.id === this.selectedRoom);
      if (visible) el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
    }
    // Vertical connections on the selected floor keep a small budget of their own.
    let connectionsShown = 0;
    for (const { element, node } of this.connectionLabels.values()) {
      let visible = this.mode !== 'building' && node.floor === this.selectedFloor;
      let x = 0,
        y = 0;
      if (visible) {
        const position = displayedPoint(node.position, node.floor, this.layout);
        const pos = new THREE.Vector3(position[0], position[1] + 0.4, position[2]).project(
          this.camera,
        );
        x = ((pos.x + 1) / 2) * this.container.clientWidth;
        y = ((-pos.y + 1) / 2) * this.container.clientHeight;
        const w = Number.parseFloat(element.style.width),
          h = 20;
        visible =
          Math.abs(pos.x) < 0.98 &&
          Math.abs(pos.y) < 0.95 &&
          pos.z > -1 &&
          pos.z < 1 &&
          y > this.contentTop + h / 2 + 4 &&
          y < this.contentBottom - h / 2 - 4 &&
          connectionsShown < 4 &&
          !occupied.some(
            (r) => Math.abs(x - r.x) < (w + r.w) / 2 + 6 && Math.abs(y - r.y) < (h + r.h) / 2 + 6,
          );
        if (visible) {
          occupied.push({ x, y, w, h });
          connectionsShown++;
        }
      }
      element.hidden = !visible;
      if (visible) element.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
    }
    for (const o of this.routeGroup.children)
      o.visible =
        (this.exploded &&
          (this.layout.visible.has(o.userData.floorA) ||
            this.layout.visible.has(o.userData.floorB))) ||
        (!this.exploded && this.mode === 'building') ||
        o.userData.floorA === this.selectedFloor ||
        o.userData.floorB === this.selectedFloor;
    for (const floor of this.building?.floors ?? []) {
      const label = this.floorLabels.get(floor.id)!;
      const position = displayedPoint(
        [
          this.sceneBounds.min.x,
          floor.height + 0.5,
          this.sceneBounds.getCenter(new THREE.Vector3()).z,
        ],
        floor.id,
        this.layout,
      );
      const projected = new THREE.Vector3(...position).project(this.camera);
      const labelY = ((-projected.y + 1) / 2) * this.container.clientHeight;
      label.hidden =
        !this.exploded ||
        !this.layout.visible.has(floor.id) ||
        labelY < this.contentTop ||
        labelY > this.contentBottom ||
        Math.abs(projected.y) > 0.95 ||
        projected.z > 1;
      label.classList.toggle('active', floor.id === this.selectedFloor);
      label.style.transform = `translate(12px, ${labelY}px)`;
    }
    this.renderer.render(this.scene, this.camera);
    this.needsFrame = false;
  }
}
