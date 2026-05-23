import { v4 as uuid } from 'uuid';

const PROJECTS_KEY  = 'echovis_projects';
const PROJECT_DATA  = (id) => `echovis_project_${id}`;
const LAST_OPEN_KEY = 'echovis_last_open';

export function listProjects() {
  try { return JSON.parse(localStorage.getItem(PROJECTS_KEY) ?? '[]'); }
  catch { return []; }
}

export function readProject(id) {
  try { return JSON.parse(localStorage.getItem(PROJECT_DATA(id))); }
  catch { return null; }
}

export function writeProject(project) {
  const updatedAt = new Date().toISOString();
  const full = { ...project, updatedAt };
  const meta = {
    id: full.id,
    name: full.name,
    createdAt: full.createdAt,
    updatedAt,
    nodeCount: full.nodes.length,
    linkCount: full.links.length,
    preview: full.preview ?? null,
  };
  const list = listProjects();
  const idx = list.findIndex(p => p.id === full.id);
  if (idx >= 0) list[idx] = meta;
  else list.unshift(meta);
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(list));
  localStorage.setItem(PROJECT_DATA(full.id), JSON.stringify(full));
  return full;
}

export function duplicateProject(id) {
  const source = readProject(id);
  if (!source) return null;
  const copy = {
    ...source,
    id: uuid(),
    name: `${source.name} (copy)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return writeProject(copy);
}

export function deleteProject(id) {
  const list = listProjects().filter(p => p.id !== id);
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(list));
  localStorage.removeItem(PROJECT_DATA(id));
}

export function createBlankProject(name = 'Untitled') {
  return {
    version: 1,
    id: uuid(),
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [],
    links: [],
  };
}

export function setLastOpen(id) {
  if (id) localStorage.setItem(LAST_OPEN_KEY, id);
  else localStorage.removeItem(LAST_OPEN_KEY);
}

export function getLastOpen() {
  return localStorage.getItem(LAST_OPEN_KEY);
}

export function downloadProjectFile(project) {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/[^a-z0-9_\-]/gi, '_')}.echoproj`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseProjectFile(jsonString) {
  const data = JSON.parse(jsonString);
  if (!Array.isArray(data.nodes) || !Array.isArray(data.links)) {
    throw new Error('Invalid project file — missing nodes or links.');
  }
  return {
    version: data.version ?? 1,
    id: data.id ?? uuid(),
    name: data.name ?? 'Imported Project',
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: data.nodes,
    links: data.links,
  };
}

export function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
