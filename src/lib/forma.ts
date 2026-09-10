import { BoxGeometry, Euler, Matrix4 } from 'three';
import { finalizeAsset, type Asset, type FormaProject, type Part, type Vec3 } from './scene';

type RecordValue = Record<string, unknown>;
export function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
}
const text = (value: unknown, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback;
function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
}
function vector(value: unknown, label: string, positive = false): Vec3 {
  const item = record(value);
  return ['x_mm', 'y_mm', 'z_mm'].map(key => {
    const n = finite(item[key], `${label}.${key}`);
    if (positive && n <= 0) throw new Error(`${label}.${key} must be greater than zero.`);
    return n;
  }) as Vec3;
}

export type FormaDocument = {
  name: string; projectId?: string; version: string; mechanical: RecordValue;
  cad: unknown; definitions: RecordValue[]; components: RecordValue[]; artifacts: RecordValue[]; project: FormaProject;
};

function artifactRecords(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.map(record).filter(item => typeof item.path === 'string') : [];
}

export function readFormaDocument(input: unknown, filename: string): FormaDocument {
  let root = record(input);
  if (Object.keys(root).length === 0) throw new Error('Expected a Forma project JSON object.');
  if (root.response) root = record(root.response);
  if (root.format && root.format !== 'forma-project') throw new Error(`Unsupported project format: ${root.format}`);
  if (root.format === 'forma-project' && root.version !== 1) throw new Error(`Unsupported Forma manifest version: ${root.version}. Expected 1.`);
  const object = record(root.project_object ?? (root.object_type ? root : undefined));
  let ir = record(root.project_ir ?? root.hardware_ir ?? root);
  let source: FormaProject['source'] = root.project_ir ? 'project_ir' : root.hardware_ir ? 'hardware_ir' : 'namespace';
  let projectId = text(root.project_id);
  let version: string;
  if (Object.keys(object).length && !root.project_ir && !root.hardware_ir) {
    if (object.object_type !== 'forma.project') throw new Error('Unsupported project object type. Expected forma.project.');
    // Forma object/namespace versions are revision counters, not schema versions.
    if (!Number.isInteger(object.version) || Number(object.version) < 1) throw new Error('Invalid Forma project revision.');
    if (!Array.isArray(object.namespaces)) throw new Error('Forma project namespaces must be an array.');
    const namespaces = object.namespaces.map(record);
    const payload = (name: string) => record(namespaces.find(n => n.name === name)?.payload);
    const meta = payload('project.meta');
    const schema = text(meta.hardware_ir_version, '0.2');
    if (!['0.1', '0.2'].includes(schema)) throw new Error(`Unsupported Hardware IR version: ${schema}. Expected 0.1 or 0.2.`);
    ir = { ...payload('product.mech'), ...payload('product.overview'), ...payload('product.electrical') };
    source = 'namespace';
    projectId = text(object.object_id);
    version = `${schema} / revision ${object.version}`;
  } else {
    version = text(ir.hardware_ir_version, '0.1');
    if (!['0.1', '0.2'].includes(version)) throw new Error(`Unsupported Hardware IR version: ${version}. Expected 0.1 or 0.2.`);
  }
  const metadata = record(ir.assembly_metadata);
  const overview = record(ir.overview);
  const project: FormaProject = { projectId: projectId || undefined, revision: version, hardwareIrVersion: version.split(' / ')[0], ir, source };
  return {
    name: text(root.title, text(overview.title, filename.replace(/\.json$/i, ''))),
    projectId: projectId || text(metadata.project_id) || undefined,
    version,
    mechanical: record(ir.mechanical),
    cad: ir.cad_model,
    definitions: Array.isArray(ir.part_definitions) ? ir.part_definitions.map(record) : [],
    components: Array.isArray(ir.components) ? ir.components.map(record) : [], artifacts: artifactRecords(root.artifacts ?? ir.artifacts), project,
  };
}

export function cadFileReference(cad: unknown): string | undefined {
  if (typeof cad === 'string') return cad;
  const source = record(cad);
  for (const key of ['path', 'file_path', 'model_path', 'url', 'file_url', 'download_url', 'filename']) {
    if (typeof source[key] === 'string') return source[key] as string;
  }
  for (const key of ['adapter', 'model', 'payload']) {
    if (source[key]) { const nested = cadFileReference(source[key]); if (nested) return nested; }
  }
}

function meshRecords(cad: unknown): unknown[] | undefined {
  if (Array.isArray(cad)) return cad;
  const source = record(cad);
  if (source.vertices || source.faces) return [source];
  for (const key of ['meshes', 'mesh_payloads', 'render_meshes', 'mesh', 'adapter', 'model', 'payload']) {
    if (source[key]) { const nested = meshRecords(source[key]); if (nested) return nested; }
  }
}

export function importForma(input: unknown, filename: string, digest: string): Asset {
  const doc = readFormaDocument(input, filename);
  const id = `forma-${digest}`;
  const parts: Part[] = [];
  const warnings: string[] = [];
  const meshes = meshRecords(doc.cad);
  if (meshes?.length) {
    for (const [index, value] of meshes.entries()) {
      const mesh = record(value);
      if (!Array.isArray(mesh.vertices) || !Array.isArray(mesh.faces)) throw new Error('CAD meshes require vertices and faces arrays.');
      const source = mesh.vertices.map(v => finite(v, 'CAD vertex'));
      const vertices: number[] = [];
      for (let i = 0; i < source.length; i += 3) vertices.push(source[i] / 1000, source[i + 2] / 1000, -source[i + 1] / 1000);
      parts.push({ id: `${id}/mesh/${index}`, name: text(mesh.name, `CAD part ${index + 1}`), vertices,
        indices: mesh.faces.map(v => finite(v, 'CAD face')), metadata: { representation: 'CAD mesh', sourceId: text(mesh.shapeId ?? mesh.shape_id ?? mesh.id) } });
    }
  } else {
    const placements = doc.mechanical.component_placements;
    if (placements !== undefined && !Array.isArray(placements)) throw new Error('Mechanical component_placements must be an array.');
    if (Array.isArray(placements) && placements.length) {
      for (const value of placements) {
        const item = record(value);
        const ref = text(item.ref_des);
        if (!ref) throw new Error('Each mechanical placement needs a ref_des.');
        const component = doc.components.find(c => c.ref_des === ref) ?? {};
        const definition = doc.definitions.find(d => d.part_definition_id === component.part_definition_id) ?? component;
        const size = vector(item.size, `${ref} size`, true);
        const position = vector(item.position, `${ref} position`);
        const rotation = record(item.orientation_deg);
        const angles = ['x_deg', 'y_deg', 'z_deg'].map(key => finite(rotation[key] ?? 0, `${ref} ${key}`) * Math.PI / 180);
        const geometry = new BoxGeometry(...size);
        geometry.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(angles[0], angles[1], angles[2], 'XYZ')));
        geometry.translate(...position);
        geometry.rotateX(-Math.PI / 2);
        geometry.scale(0.001, 0.001, 0.001);
        parts.push({ id: `${id}/placement/${ref}`, name: text(item.label, text(definition.name, ref)),
          vertices: Array.from(geometry.attributes.position.array), indices: Array.from(geometry.index!.array),
          metadata: { ref, category: text(item.category, text(definition.category)), layer: text(item.layer),
            partNumber: text(definition.part_number), representation: 'Approximate component envelope' } });
        geometry.dispose();
      }
      warnings.push('Showing approximate component envelopes from Forma mechanical placements, not fabrication-ready CAD surfaces.');
    } else if (doc.mechanical.render_dimensions) {
      const geometry = new BoxGeometry(...vector(doc.mechanical.render_dimensions, 'render_dimensions', true));
      geometry.rotateX(-Math.PI / 2); geometry.scale(0.001, 0.001, 0.001);
      parts.push({ id: `${id}/envelope`, name: doc.name, vertices: Array.from(geometry.attributes.position.array),
        indices: Array.from(geometry.index!.array), metadata: { representation: 'Approximate overall envelope' } });
      geometry.dispose();
      warnings.push('Only overall dimensions are available. Showing an approximate envelope.');
    }
    if (doc.cad) warnings.push('Referenced CAD is unavailable or unsupported. Select its STEP file together with the JSON to resolve local geometry.');
  }
  if (!parts.length) throw new Error('This Forma project has no usable geometry. Include its referenced STEP file, inline CAD meshes, or mechanical placements.');
  const hierarchy = { id: `${id}/root`, name: doc.name, partIds: [], children: parts.map(part => ({ id: part.id, name: part.name, partIds: [part.id], children: [] })) };
  return finalizeAsset({ id, name: doc.name, source: { kind: 'forma', filename, digest, projectId: doc.projectId, version: doc.version }, parts,
    formaProject: doc.project,
    hierarchy, warnings });
}
