import { cadFileReference, importForma, readFormaDocument, record } from './forma';
import { checkFile, digestBytes, type Asset } from './scene';
import { convertStep, stepToAsset, type StepOptions, type StepResult } from './step';

// Cache final assets, not the much larger source + intermediate CAD representations.
export class ImportService {
  private cache = new Map<string, Asset>();
  constructor(private converter: typeof convertStep = convertStep) {}

  async step(file: File, options: StepOptions, progress: (message: string) => void): Promise<Asset> {
    checkFile(file);
    const bytes = await file.arrayBuffer();
    const digest = await digestBytes(bytes);
    const key = `${digest}/${options.upAxis}/${options.scale}`;
    const cached = this.cache.get(key);
    if (cached) { progress('Reusing converted geometry…'); return { ...cached, name: file.name.replace(/\.(step|stp)$/i, ''), source: { ...cached.source, filename: file.name } }; }
    const hasUnits = /SI_UNIT\s*\([^)]*\.METRE\.|CONVERSION_BASED_UNIT\s*\(/i.test(new TextDecoder().decode(bytes));
    const result: StepResult = await this.converter(bytes, progress);
    const asset = stepToAsset(result, file.name, digest, options, hasUnits);
    if (this.cache.size >= 8) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, asset);
    return asset;
  }

  async files(files: File[], options: StepOptions, progress: (message: string) => void): Promise<Asset[]> {
    const inputs = files.filter(f => /\.(json|step|stp)$/i.test(f.name));
    if (!inputs.length) throw new Error('Choose a Forma .json project or a .step / .stp file.');
    if (inputs.reduce((sum, f) => sum + f.size, 0) > 75 * 1024 * 1024) throw new Error('Import batch exceeds 75 MiB. Import fewer files at a time.');
    const jsonFiles = inputs.filter(f => /\.json$/i.test(f.name));
    // A folder may contain unrelated JSON; the canonical manifest is its entry point.
    const projects = jsonFiles.some(f => f.name === 'forma-project.json') ? jsonFiles.filter(f => f.name === 'forma-project.json') : jsonFiles;
    const used = new Set<File>();
    const assets: Asset[] = [];
    for (const file of projects) {
      checkFile(file);
      progress(`Reading ${file.name}…`);
      const bytes = await file.arrayBuffer();
      let input: unknown;
      try { input = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error(`${file.name} is not valid JSON.`); }
      const digest = await digestBytes(bytes);
      const doc = readFormaDocument(input, file.name);
      const reference = cadFileReference(doc.cad);
      const normalized = reference?.replace(/\\/g, '/').split('?')[0];
      const isRemoteReference = normalized ? /^(?:[a-z]+:)?\/\//i.test(normalized) : false;
      const cadInputs = inputs.filter(f => /\.(step|stp)$/i.test(f.name));
      const normalizedReference = normalized?.replace(/^\.\//, '');
      const exactCandidates = normalizedReference && !isRemoteReference ? cadInputs.filter(f => {
        const path = (f.webkitRelativePath || f.name).replace(/\\/g, '/').replace(/^\.\//, '');
        return path === normalizedReference;
      }) : [];
      const basename = normalizedReference?.split('/').pop();
      const basenameCandidates = basename && !isRemoteReference ? cadInputs.filter(f => f.name === basename) : [];
      const candidates = exactCandidates.length ? exactCandidates : basenameCandidates;
      if (candidates.length > 1) throw new Error(`Multiple files match ${normalized}. Select only the intended CAD artifact.`);
      if (candidates.length === 1) {
        const cad = candidates[0];
        const declaration = doc.artifacts.find(a => String(a.path).replace(/\\/g, '/').replace(/^\.\//, '') === normalizedReference || String(a.path).split('/').pop() === cad.name);
        if (declaration?.sha256 && declaration.sha256 !== await digestBytes(await cad.arrayBuffer())) {
          throw new Error(`Integrity check failed for ${cad.name}: bytes do not match the Forma manifest SHA-256.`);
        }
        // Forma mechanical data is always Z-up; standalone STEP options do not change that contract.
        const geometry = await this.step(cad, { upAxis: 'Z', scale: 1 }, progress);
        assets.push({ ...geometry, id: `forma-${digest}-${geometry.source.digest}`, name: doc.name,
          source: { kind: 'forma', filename: file.name, digest, projectId: doc.projectId, version: doc.version } });
        used.add(cad);
      } else {
        assets.push(importForma(input, file.name, digest));
      }
    }
    for (const file of inputs.filter(f => /\.(step|stp)$/i.test(f.name) && !used.has(f))) assets.push(await this.step(file, options, progress));
    return assets;
  }
}
