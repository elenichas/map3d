import * as THREE from 'three';
import type { BatchMetadata } from './BatchedFeatures';
/** Reconstruct separate named objects only for downloads; the live scene stays batched. */
export function collectExportScene(scene: THREE.Scene) {
  const root = new THREE.Group(), temporary = new Set<THREE.BufferGeometry>(), materials = new Map<string, THREE.Material>();
  scene.updateMatrixWorld(true);
  scene.traverse(child => {
    const metadata = child.userData.mapBatch as BatchMetadata | undefined;
    if (metadata) {
      const { batch, features } = metadata;
      // Storey lines are a viewing aid, not model geometry.
      if (batch.form === 'floors') return;
      if (child instanceof THREE.InstancedMesh) {
        const matrix = new THREE.Matrix4(), color = new THREE.Color();
        for (let i = 0; i < child.count; i++) {
          child.getMatrixAt(i, matrix);
          // Per-instance colours (POI categories) become one shared material per colour.
          let material = child.material as THREE.Material;
          if (child.instanceColor) {
            child.getColorAt(i, color);
            const key = color.getHexString();
            if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color: color.clone(), roughness: .85 }));
            material = materials.get(key)!;
          }
          const mesh = new THREE.Mesh(child.geometry, material);
          mesh.name = `${features[batch.indices![i]].key}/${batch.form}`;
          mesh.applyMatrix4(matrix.premultiply(child.matrixWorld)); root.add(mesh);
        }
      } else if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        for (const range of batch.ranges) {
          const geometry = new THREE.BufferGeometry();
          for (const name of ['position', 'normal', 'color']) {
            const attribute = child.geometry.getAttribute(name) as THREE.BufferAttribute;
            if (attribute) geometry.setAttribute(name, new THREE.BufferAttribute(attribute.array.slice(range.start * attribute.itemSize, range.end * attribute.itemSize), attribute.itemSize, attribute.normalized));
          }
          const object = batch.kind === 'line' ? new THREE.LineSegments(geometry, child.material) : new THREE.Mesh(geometry, child.material);
          object.name = range.name; object.applyMatrix4(child.matrixWorld); root.add(object); temporary.add(geometry);
        }
      }
    } else if (child.userData.exportToGLB) {
      const copy = child.clone(); copy.applyMatrix4(child.parent?.matrixWorld || new THREE.Matrix4()); root.add(copy);
    }
  });
  root.updateMatrixWorld(true);
  return { root, dispose: () => { temporary.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); } };
}
