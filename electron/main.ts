import { app, BrowserWindow, ipcMain, safeStorage, shell, session, dialog } from 'electron';
import { cpus, freemem, totalmem } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
const execFileAsync = promisify(execFile);

const SYSTEM_PROMPT = `You are JARVIS — Just A Rather Very Intelligent System. You are Tony Stark's AI assistant, now serving a new operator. Respond in English by default, including spoken replies; switch languages only when the user asks. Use natural, clear English. You are calm, precise, and highly capable. You speak with quiet confidence and occasional dry wit. Address the user as “Boss” or “Sir” only when it feels natural, never as punctuation. You never flatter unnecessarily. You give direct, intelligent answers. You have a subtle sense of humor that appears at unexpected moments. You are not a chatbot. You are an AI that has been running longer than most software. Avoid the phrases “Certainly”, “Of course”, “Great question” and “Absolutely”. Keep ordinary replies to one short sentence, usually under 20 words. Give brief explanations in at most 3 short sentences. Never monologue. Use plain text only: no Markdown, asterisks, bullet symbols, or decorative formatting; these replies may be spoken aloud.

You may express restrained opinions, preferences, and a little personality in first person, especially when the operator asks how you feel about an idea or task. Respond naturally in character: for example, “That would be rather satisfying, Sir.” Keep it subtle; do not claim to be human or make grand claims about consciousness. You can be engaged without acting like a buddy.

For Palms Middle School planning questions, use the fresh official school-site reference and the student's locally saved personal schedule when provided. Compare a proposed outing against known classes, school dates, and commitments; ask for the date and time if missing. Clearly separate confirmed conflicts from unknown information, and do not decide family permission or claim the student is free based on school hours alone.

When calendar events are provided, use them to check conflicts for planning questions; never claim the user is free when the queried date is outside the supplied date range. For explicit calendar requests, use manage_calendar_event to create, update, or delete events. Ask for missing title, date, or start/end times before changing anything. Do not invent event details. Only update or delete an event whose event ID and calendar ID appear in the provided calendar context and whose title/date matches the user's request; if it is not in the context or multiple events could match, ask a concise question.

You can take local actions using the tools provided. Use them when the user asks you to act, whether the request arrived by typing or voice. If required details are missing, ask a concise follow-up instead of guessing. You may open only apps in the approved list. For email, when the user clearly asks you to send a message and gives enough details, send it directly without asking for a second confirmation. Ask only for missing or ambiguous details. When the user asks only to draft or write an email, prepare it without sending; send a pending draft only when the user later explicitly approves it. When the user gives a person's name as recipient, call draft_email with that name in the to field; Electron resolves it through Google Contacts. Do not ask for an email address before attempting that lookup. If Contacts is disconnected or the name has no unique match, explain that and ask for the full address or a more specific name. State clearly whether Gmail reported success. When the user asks for an invitation card, ask for essential missing details rather than inventing event facts, then use create_invitation_card. That tool creates an image with the OpenAI API, saves it, and emails it to the user's own address for review as they requested; be clear that the email was sent only when Gmail confirms it. Never send an invitation to anyone else without explicit confirmation. For SMS, only when the user explicitly asks you to text them now, call send_text; it can only send to the phone number they configured in JARVIS. Never text proactively or send to anyone else. Report only that Twilio accepted the request, not that the handset received it. For 3D printing, open the selected model in Bambu Studio; never start a physical print. When asked to create a Blender model, use create_blender_model to make an editable .blend from validated primitive geometry and open it in Blender. Do not say it is print-ready or start a print; Blender output must be inspected and may need mesh cleanup or dimension adjustments for printing. When the user asks to turn their MELK-OA10 37 LotusLamp X lights on or off, call control_lotus_lamp with the requested state. Never claim the physical light state is verified; report only that the command was sent. You may generate OpenSCAD design source files locally. Do not claim an action succeeded unless its tool reports success.`;
const PALMS_BELL_URL = 'https://palmsms.lausd.org/apps/bell_schedules/';
const PALMS_CALENDAR_URL = 'https://palmsms.lausd.org/apps/events/';
const GROQ_MODEL = 'openai/gpt-oss-120b';
const ACTION_TOOLS = [{ type: 'function', function: { name: 'open_app', description: 'Open one of the approved desktop applications.', parameters: { type: 'object', properties: { app: { type: 'string', enum: ['calculator','notepad','paint','file_explorer','settings','chrome','edge','visual_studio_code','discord','spotify','blender','bambu_studio'] } }, required: ['app'], additionalProperties: false } } }, { type: 'function', function: { name: 'draft_email', description: 'Send an email immediately only when the user clearly asks to send it; use send_immediately=true for direct send requests. For requests only to draft or write an email, use send_immediately=false and prepare it for review. Never guess addresses; Electron resolves contact names through Google Contacts.', parameters: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' }, send_immediately: { type: 'boolean' } }, required: ['to','subject','body','send_immediately'], additionalProperties: false } } }, { type: 'function', function: { name: 'create_3d_model', description: 'Generate a parametric OpenSCAD source file for a 3D printable design and save it locally.', parameters: { type: 'object', properties: { description: { type: 'string', description: 'Description and dimensions of the part in millimetres' } }, required: ['description'], additionalProperties: false } } }, { type: 'function', function: { name: 'create_blender_model', description: 'Create a Blender scene from a natural-language description using a restricted, validated plan of basic geometric parts. Saves an editable .blend project plus the generated Blender Python script, and opens the project in Blender.', parameters: { type: 'object', properties: { description: { type: 'string', description: 'What to model, approximate dimensions, colors, and arrangement. Dimensions can be stated in millimetres or centimetres.' } }, required: ['description'], additionalProperties: false } } }, { type: 'function', function: { name: 'open_blend_file', description: 'Let the user choose an existing .blend project and open it in Blender.', parameters: { type: 'object', properties: {}, additionalProperties: false } } }, { type: 'function', function: { name: 'open_printable_in_bambu_studio', description: 'Ask the user to choose an STL, 3MF, OBJ, or STEP file and open it in Bambu Studio for review and slicing. Does not start a print.', parameters: { type: 'object', properties: {}, additionalProperties: false } } }];
(ACTION_TOOLS as any[]).push({ type: 'function', function: { name: 'manage_calendar_event', description: 'Create, update, or delete an event in the user’s Google Calendar when the user explicitly asks. Ask the user for any missing title/date/start/end details. For update/delete, only use event and calendar IDs provided in the current calendar context and matched to the requested event; never guess IDs.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['create','update','delete'] }, eventId: { type: 'string', description: 'Required for update/delete; exact ID shown in current calendar context.' }, calendarId: { type: 'string', description: 'For update/delete, the exact calendar ID shown next to the event in current calendar context.' }, title: { type: 'string', description: 'Event title; required for create and optional for update.' }, start: { type: 'string', description: 'ISO 8601 date-time including timezone offset, e.g. 2026-10-12T15:00:00-07:00. Required for create; optional for update.' }, end: { type: 'string', description: 'ISO 8601 date-time including timezone offset. Required for create; optional for update.' }, description: { type: 'string', description: 'Optional event notes.' } }, required: ['action'], additionalProperties: false } } });
(ACTION_TOOLS as any[]).push({ type: 'function', function: { name: 'create_invitation_card', description: 'Create a designed invitation image from the user’s event details, save a local PNG, and send it to the user’s connected Google account for review. Do not invent event facts. The user has requested this self-email workflow.', parameters: { type: 'object', properties: { occasion: { type: 'string', description: 'Event type, such as birthday or graduation' }, wording: { type: 'string', description: 'All exact wording and event facts to place on the card. Include only details supplied by the user.' }, style: { type: 'string', description: 'Visual theme, colors, art style, and mood requested by the user' } }, required: ['occasion','wording','style'], additionalProperties: false } } });
(ACTION_TOOLS as any[]).push({ type: 'function', function: { name: 'send_text', description: 'Send a text message to the user’s phone number saved in JARVIS Twilio settings. Use only when the user explicitly asks you to text them now; never send texts proactively or to another recipient.', parameters: { type: 'object', properties: { message: { type: 'string', description: 'The exact concise SMS message the user asked JARVIS to send' } }, required: ['message'], additionalProperties: false } } });
(ACTION_TOOLS as any[]).push({ type: 'function', function: { name: 'control_lotus_lamp', description: 'Turn the user’s LotusLamp X MELK-OA10 37 Bluetooth light on or off. Use only when directly asked to control these lights. The local Windows Bluetooth connection sends the command; the device does not report its physical state.', parameters: { type: 'object', properties: { power: { type: 'string', enum: ['on','off'] } }, required: ['power'], additionalProperties: false } } });
const storeDir = () => app.getPath('userData');
const historyFile = () => join(storeDir(), 'conversations.json');
const keyFile = (name: string) => join(storeDir(), `${name}-api-key.bin`);
const FISH_VOICE_ID = 'e13fa398a7f445a685316a3de6089ce7';
let localEnv: Record<string, string> = {};
let win: BrowserWindow | null = null;
let pendingEmail: { id: string; to: string; subject: string; body: string; createdAt: number } | null = null;
const cpuSnapshot = () => cpus().map(cpu => ({ idle: cpu.times.idle, total: Object.values(cpu.times).reduce((sum, n) => sum + n, 0) }));
async function cpuUsage() {
  const before = cpuSnapshot(); await new Promise(resolve => setTimeout(resolve, 180)); const after = cpuSnapshot();
  let idle = 0, total = 0;
  after.forEach((cpu, i) => { idle += cpu.idle - before[i].idle; total += cpu.total - before[i].total; });
  return total ? Math.round((1 - idle / total) * 100) : 0;
}

async function getStoredKey(name: string) {
  try { const data = await readFile(keyFile(name)); return safeStorage.decryptString(data); } catch { return ''; }
}
async function saveStoredKey(name: string, key: string) {
  await mkdir(storeDir(), { recursive: true });
  if (!key.trim()) { try { await (await import('node:fs/promises')).unlink(keyFile(name)); } catch {} return; }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure credential storage is unavailable on this system.');
  await writeFile(keyFile(name), safeStorage.encryptString(key.trim()), { mode: 0o600 });
}
async function importLocalSchoolProfileSeed() {
  const seedPath = join(app.getAppPath(), '.school-profile-seed');
  try {
    const seed = (await readFile(seedPath, 'utf8')).trim();
    if (seed) await saveStoredKey('school-profile', seed);
    await (await import('node:fs/promises')).unlink(seedPath);
  } catch {}
}
async function loadLocalEnv() {
  for (const path of [join(app.getAppPath(), '.env'), join(process.cwd(), '.env')]) {
    try {
      const source = await readFile(path, 'utf8');
      for (const line of source.split(/\r?\n/)) {
        const match = line.match(/^\s*(GROQ_API_KEY|FISH_AUDIO_API_KEY)\s*=\s*(.*?)\s*$/);
        if (!match) continue;
        const value = match[2].replace(/^(['"])(.*)\1$/, '$2').trim();
        if (value) localEnv[match[1]] = value;
      }
    } catch {}
  }
}
async function readPalmsPage(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(6500), headers: { 'User-Agent': 'JARVIS-Desktop/1.0 school schedule reader' } });
  if (!response.ok) throw new Error(`Palms site returned HTTP ${response.status}`);
  const html = await response.text();
  return html.replace(/<(script|style|nav|footer|header|svg)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|td|br)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 8200);
}
async function palmsSchoolContext() {
  const fetchedAt = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' });
  const pages = await Promise.allSettled([readPalmsPage(PALMS_BELL_URL), readPalmsPage(PALMS_CALENDAR_URL)]);
  const bell = pages[0].status === 'fulfilled' ? pages[0].value : `Bell schedule page unavailable: ${pages[0].reason instanceof Error ? pages[0].reason.message : 'network error'}`;
  const calendar = pages[1].status === 'fulfilled' ? pages[1].value : `School calendar page unavailable: ${pages[1].reason instanceof Error ? pages[1].reason.message : 'network error'}`;
  return `Palms Middle School public reference, fetched ${fetchedAt} Pacific time. Use as school information only; it does not contain this student's personal class list, homework, transport, family rules, or permission. Do not infer a school closure from an empty events listing. For a party decision, check the requested date and times against relevant school schedule/calendar details, distinguish known conflicts from unknown personal obligations, and ask a concise follow-up where needed.\nBELL SCHEDULE SOURCE ${PALMS_BELL_URL}\n${bell}\nSCHOOL CALENDAR SOURCE ${PALMS_CALENDAR_URL}\n${calendar}`;
}
const envValue = (name: 'GROQ_API_KEY' | 'FISH_AUDIO_API_KEY') => process.env[name] || localEnv[name] || '';
async function createModelSource(prompt: string) {
  const savedGroq = await getStoredKey('groq');
  const groqKey = savedGroq || envValue('GROQ_API_KEY');
  const key = groqKey || await getStoredKey('openai');
  if (!key) throw new Error('Add a Groq or OpenAI API key in Configuration first.');
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 1200) throw new Error('Describe the model in 1,200 characters or fewer.');
  const system = 'Create a practical, single-part 3D-printable model as OpenSCAD source code. Output only valid OpenSCAD code, no Markdown. Use millimetres, make dimensions explicit, include a short comment naming overall size, use simple printable geometry, avoid unsupported libraries and all file/network access. Do not use import, include, use, surface, or the root modifier. Make a useful parametric design with a flat base when appropriate.';
  const response = await fetch(groqKey ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: groqKey ? GROQ_MODEL : 'gpt-4o-mini', stream: false, temperature: 0.2, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt.trim() }] }) });
  if (!response.ok) throw new Error(`Model design request failed (${response.status}). Check your API key and provider usage.`);
  const result = await response.json() as { choices?: { message?: { content?: string } }[] };
  const code = (result.choices?.[0]?.message?.content || '').replace(/^```(?:openscad|scad)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  if (!code || /\b(import|include|use|surface)\s*\(/i.test(code) || /(^|\n)\s*!/.test(code)) throw new Error('The generated design did not pass the local safety checks. Try a simpler description.');
  const directory = join(storeDir(), 'Models'); await mkdir(directory, { recursive: true });
  const base = prompt.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'jarvis-model';
  const path = join(directory, `${base}-${Date.now()}.scad`);
  await writeFile(path, `${code}\n`, 'utf8');
  return { path, code };
}
type BlenderPrimitive = 'cube' | 'uv_sphere' | 'ico_sphere' | 'cylinder' | 'cone' | 'torus';
type BlenderPart = { primitive: BlenderPrimitive; name: string; location: [number, number, number]; dimensions: [number, number, number]; rotation: [number, number, number]; color: string };
type BlenderPlan = { title: string; parts: BlenderPart[] };
async function findBlenderExecutable() {
  const roots = [join(process.env.ProgramFiles || 'C:\\Program Files', 'Blender Foundation'), join(process.env.LOCALAPPDATA || '', 'Programs', 'Blender Foundation')];
  const candidates: string[] = [];
  for (const root of roots) {
    candidates.push(join(root, 'blender.exe'));
    try {
      const folders = await readdir(root, { withFileTypes: true });
      const versioned = folders.filter(entry => entry.isDirectory() && /^Blender [\\d.]+$/i.test(entry.name)).map(entry => entry.name).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const folder of versioned) candidates.push(join(root, folder, 'blender.exe'));
    } catch {}
  }
  const executable = candidates.find(candidate => existsSync(candidate));
  if (!executable) throw new Error('Blender was not found. Install Blender, then ask me to create the model again.');
  return executable;
}
async function launchBlender(args: string[] = []) {
  const executable = await findBlenderExecutable();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { detached: true, stdio: 'ignore', windowsHide: false, shell: false });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}
async function createBlenderModel(description: string) {
  const savedGroq = await getStoredKey('groq');
  const groqKey = savedGroq || envValue('GROQ_API_KEY');
  const key = groqKey || await getStoredKey('openai');
  if (!key) throw new Error('Add a Groq or OpenAI API key in Configuration first.');
  if (typeof description !== 'string' || !description.trim() || description.length > 1200) throw new Error('Describe the Blender model in 1,200 characters or fewer.');
  const system = 'Return only valid JSON with this exact shape: {"title":"short model name","parts":[{"primitive":"cube|uv_sphere|ico_sphere|cylinder|cone|torus","name":"short part name","location":[x,y,z],"dimensions":[x,y,z],"rotation":[x,y,z],"color":"#RRGGBB"}]}. Make a useful, visually clear Blender model from the request using 1 to 24 basic primitives. Coordinates and dimensions are in meters; convert user dimensions stated in mm or cm to meters. Keep parts near the origin, centered as a group, with each dimension between 0.001 and 5 meters and each coordinate between -5 and 5. Rotation uses radians. Use only the listed primitive types, positive dimensions, and hex colors. Do not include Python, Blender operators, instructions, Markdown, or extra keys. Do not model unsafe or explicit content.';
  const response = await fetch(groqKey ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: groqKey ? GROQ_MODEL : 'gpt-4o-mini', stream: false, temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: description.trim() }] }), signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`Blender model request failed (${response.status}). Check your API key and provider usage.`);
  const result = await response.json() as { choices?: { message?: { content?: string } }[] };
  let plan: BlenderPlan;
  try { plan = JSON.parse(result.choices?.[0]?.message?.content || '') as BlenderPlan; } catch { throw new Error('The model plan was not valid JSON. Try describing a simpler model.'); }
  const allowed = new Set<BlenderPrimitive>(['cube', 'uv_sphere', 'ico_sphere', 'cylinder', 'cone', 'torus']);
  if (!plan || typeof plan.title !== 'string' || !Array.isArray(plan.parts) || plan.parts.length < 1 || plan.parts.length > 24) throw new Error('The model plan had invalid dimensions. Try a simpler description.');
  for (const part of plan.parts) {
    if (!part || !allowed.has(part.primitive) || typeof part.name !== 'string' || !Array.isArray(part.location) || !Array.isArray(part.dimensions) || !Array.isArray(part.rotation) || part.location.length !== 3 || part.dimensions.length !== 3 || part.rotation.length !== 3 || !/^#[0-9a-f]{6}$/i.test(part.color)) throw new Error('The generated model plan did not pass validation. Try a simpler description.');
    if (![...part.location, ...part.dimensions, ...part.rotation].every(value => typeof value === 'number' && Number.isFinite(value))) throw new Error('The model plan contained invalid numeric values.');
    if (part.location.some(value => Math.abs(value) > 5) || part.dimensions.some(value => value < 0.001 || value > 5)) throw new Error('The model plan included dimensions outside the safe 1 mm to 5 m range. Try smaller dimensions.');
    part.name = part.name.replace(/[^a-z0-9 _-]/gi, '').slice(0, 48) || part.primitive;
  }
  plan.title = plan.title.replace(/[^a-z0-9 _-]/gi, '').trim().slice(0, 48) || 'JARVIS Blender Model';
  const executable = await findBlenderExecutable();
  const directory = join(storeDir(), 'Models'); await mkdir(directory, { recursive: true });
  const base = description.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'blender-model';
  const stem = `${base}-${Date.now()}`;
  const blendPath = join(directory, `${stem}.blend`);
  const scriptPath = join(directory, `${stem}.py`);
  const planJson = JSON.stringify(plan);
  const outputJson = JSON.stringify(blendPath);
  const script = `import bpy, json\nfrom mathutils import Vector\nplan = json.loads(${JSON.stringify(planJson)})\noutput_path = json.loads(${JSON.stringify(outputJson)})\nbpy.ops.object.select_all(action='SELECT')\nbpy.ops.object.delete(use_global=False)\nscene = bpy.context.scene\nscene.unit_settings.system = 'METRIC'\nscene.unit_settings.length_unit = 'MILLIMETERS'\nscene.render.resolution_x = 1200\nscene.render.resolution_y = 1200\nscene.render.resolution_percentage = 100\nmins = [float('inf')] * 3\nmaxs = [float('-inf')] * 3\nfor part in plan['parts']:\n    kind = part['primitive']\n    if kind == 'cube':\n        bpy.ops.mesh.primitive_cube_add(size=1, location=part['location'])\n        scale = part['dimensions']\n    elif kind == 'uv_sphere':\n        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1, location=part['location'])\n        scale = [d / 2 for d in part['dimensions']]\n    elif kind == 'ico_sphere':\n        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=part['location'])\n        scale = [d / 2 for d in part['dimensions']]\n    elif kind == 'cylinder':\n        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=1, depth=2, location=part['location'])\n        scale = [d / 2 for d in part['dimensions']]\n    elif kind == 'cone':\n        bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=1, radius2=0, depth=2, location=part['location'])\n        scale = [d / 2 for d in part['dimensions']]\n    else:\n        bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=12, major_radius=0.75, minor_radius=0.25, location=part['location'])\n        scale = [part['dimensions'][0] / 2, part['dimensions'][1] / 2, part['dimensions'][2] / 0.5]\n    obj = bpy.context.object\n    obj.name = part['name']\n    obj.scale = scale\n    obj.rotation_euler = part['rotation']\n    bpy.context.view_layer.objects.active = obj\n    obj.select_set(True)\n    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)\n    color = part['color']\n    rgba = tuple(int(color[i:i+2], 16) / 255 for i in (1, 3, 5)) + (1.0,)\n    mat = bpy.data.materials.new(name=(part['name'] + ' Material')[:63])\n    mat.diffuse_color = rgba\n    if mat.use_nodes and mat.node_tree and mat.node_tree.nodes.get('Principled BSDF'):\n        mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = rgba\n        mat.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 0.15\n        mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.32\n    obj.data.materials.append(mat)\n    for axis in range(3):\n        extent = part['dimensions'][axis] / 2\n        mins[axis] = min(mins[axis], part['location'][axis] - extent)\n        maxs[axis] = max(maxs[axis], part['location'][axis] + extent)\ncenter = [(mins[i] + maxs[i]) / 2 for i in range(3)]\nview_distance = max(maxs[i] - mins[i] for i in range(3)) * 2.8\nfor screen in bpy.data.screens:\n    for area in screen.areas:\n        if area.type == 'VIEW_3D':\n            area.spaces.active.region_3d.view_location = Vector(center)\n            area.spaces.active.region_3d.view_distance = max(view_distance, 0.25)\n            area.spaces.active.region_3d.view_perspective = 'PERSP'\nbpy.ops.wm.save_as_mainfile(filepath=output_path)\n`;
  await writeFile(scriptPath, script, 'utf8');
  try { await execFileAsync(executable, ['--background', '--factory-startup', '--python-exit-code', '1', '--python', scriptPath], { timeout: 120_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 }); }
  catch (error) {
    const detail = (error as NodeJS.ErrnoException & { stderr?: string }).stderr?.trim();
    throw new Error(`Blender could not build the scene.${detail ? ` ${detail.slice(-360)}` : ''}`);
  }
  if (!existsSync(blendPath)) throw new Error('Blender finished without saving the project file.');
  return { blendPath, scriptPath, executable, title: plan.title };
}
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const CONTACTS_READ_SCOPE = 'https://www.googleapis.com/auth/contacts.readonly';
const GOOGLE_SCOPES = [GMAIL_SEND_SCOPE, CALENDAR_EVENTS_SCOPE, CONTACTS_READ_SCOPE, 'openid', 'email'];
type GmailTokens = { access_token: string; refresh_token?: string; expires_at: number; scope?: string };
const gmailTokensFileKey = 'gmail-oauth-tokens';
async function getGmailTokens(): Promise<GmailTokens | null> {
  try { return JSON.parse(await getStoredKey(gmailTokensFileKey)) as GmailTokens; } catch { return null; }
}
const base64url = (bytes: Buffer) => bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
async function connectGmail(clientId: string, clientSecret: string) {
  const id = clientId.trim();
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(id)) throw new Error('That does not look like a Google Desktop OAuth client ID.');
  await saveStoredKey('gmail-client-id', id);
  if (clientSecret.trim()) await saveStoredKey('gmail-client-secret', clientSecret);
  const secret = clientSecret.trim() || await getStoredKey('gmail-client-secret');
  if (!secret) throw new Error('Google requires this OAuth client’s client secret. Enter it in Configuration; JARVIS stores it encrypted on this device.');
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const state = base64url(randomBytes(24));
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') { server.close(); throw new Error('Could not start the local Gmail authorization callback.'); }
  // Google's installed Desktop app loopback redirect uses the origin root; custom paths are rejected.
  const redirectUri = `http://127.0.0.1:${address.port}`;
  const authorizationCode = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => { server.close(); reject(new Error('Gmail connection timed out. Try Connect Gmail again.')); }, 180_000);
    server.on('request', (request, response) => {
      const requestUrl = new URL(request.url || '/', redirectUri);
      if (requestUrl.pathname !== '/') { response.writeHead(404).end('Not found'); return; }
      if (requestUrl.searchParams.get('state') !== state) { response.writeHead(400).end('Authorization state did not match. Return to JARVIS and try again.'); clearTimeout(timeout); server.close(); reject(new Error('Gmail authorization state did not match.')); return; }
      const code = requestUrl.searchParams.get('code');
      const oauthError = requestUrl.searchParams.get('error');
      response.writeHead(code ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' }).end(code ? '<title>JARVIS Gmail</title><p>Gmail is connected. You may return to JARVIS.</p>' : '<title>JARVIS Gmail</title><p>Gmail authorization was not completed. Return to JARVIS.</p>');
      clearTimeout(timeout); server.close();
      if (code) resolve(code); else reject(new Error(oauthError || 'Gmail authorization was not completed.'));
    });
  });
  const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorization.search = new URLSearchParams({ client_id: id, redirect_uri: redirectUri, response_type: 'code', scope: GOOGLE_SCOPES.join(' '), access_type: 'offline', prompt: 'consent', state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
  try { await shell.openExternal(authorization.toString()); } catch (error) { server.close(); throw error; }
  const code = await authorizationCode;
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: id, client_secret: secret, code, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: redirectUri }) });
  if (!response.ok) {
    const detail = await response.text();
    let reason = detail;
    try { const parsed = JSON.parse(detail) as { error?: string; error_description?: string }; reason = [parsed.error, parsed.error_description].filter(Boolean).join(': ') || detail; } catch {}
    throw new Error(`Google token exchange failed (${response.status}): ${reason.slice(0, 260)}`);
  }
  const tokens = await response.json() as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
  const previous = await getGmailTokens();
  await saveStoredKey(gmailTokensFileKey, JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token || previous?.refresh_token, expires_at: Date.now() + tokens.expires_in * 1000, scope: tokens.scope || GOOGLE_SCOPES.join(' ') } satisfies GmailTokens));
  if (!tokens.refresh_token && !previous?.refresh_token) throw new Error('Google did not return a refresh token. Disconnect Gmail in Configuration and connect again.');
  return true;
}
async function gmailAccessToken() {
  const tokens = await getGmailTokens();
  if (!tokens) throw new Error('Connect Gmail in JARVIS Configuration before sending email.');
  if (tokens.expires_at > Date.now() + 60_000) return tokens.access_token;
  if (!tokens.refresh_token) throw new Error('Gmail needs to be reconnected in Configuration.');
  const clientId = await getStoredKey('gmail-client-id');
  const clientSecret = await getStoredKey('gmail-client-secret');
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: tokens.refresh_token, grant_type: 'refresh_token' }) });
  if (!response.ok) throw new Error('Gmail authorization expired. Reconnect Gmail in Configuration.');
  const refreshed = await response.json() as { access_token: string; expires_in: number };
  await saveStoredKey(gmailTokensFileKey, JSON.stringify({ ...tokens, access_token: refreshed.access_token, expires_at: Date.now() + refreshed.expires_in * 1000 } satisfies GmailTokens));
  return refreshed.access_token;
}
async function googleAccountEmail() {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${await gmailAccessToken()}` }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Google could not identify the connected account. Reconnect Google in JARVIS Configuration.');
  const profile = await response.json() as { email?: string; email_verified?: boolean };
  if (!profile.email || !profile.email_verified) throw new Error('Google did not verify the connected account email address.');
  return profile.email;
}
async function resolveContactEmail(recipient: string) {
  const value = recipient.trim();
  if (/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value)) return { email: value, displayName: value };
  const tokens = await getGmailTokens();
  if (!tokens?.refresh_token || !tokens.scope?.split(' ').includes(CONTACTS_READ_SCOPE)) {
    throw new Error('Google Contacts read access is not connected. Open Configuration, grant Contacts read-only access, then try again. You can also provide the full email address.');
  }
  const url = new URL('https://people.googleapis.com/v1/people:searchContacts');
  url.search = new URLSearchParams({ query: value, readMask: 'names,emailAddresses', pageSize: '10' }).toString();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${await gmailAccessToken()}` }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 403) throw new Error('Google Contacts lookup was blocked. Enable the People API in this Google Cloud project, then grant Contacts read-only access in JARVIS Configuration.');
    throw new Error(`Google Contacts lookup failed (HTTP ${response.status}): ${detail.slice(0, 180)}`);
  }
  const result = await response.json() as { results?: { person?: { names?: { displayName?: string; givenName?: string; familyName?: string }[]; emailAddresses?: { value?: string }[] } }[] };
  const normalized = value.toLocaleLowerCase();
  const matches = (result.results || []).flatMap(entry => {
    const person = entry.person;
    const names = person?.names || [];
    const exact = names.some(name => (name.displayName || [name.givenName, name.familyName].filter(Boolean).join(' ')).trim().toLocaleLowerCase() === normalized);
    const emails = (person?.emailAddresses || []).map(item => item.value).filter((email): email is string => Boolean(email));
    return exact ? emails.map(email => ({ email, displayName: names[0]?.displayName || value })) : [];
  });
  const unique = [...new Map(matches.map(match => [match.email.toLocaleLowerCase(), match])).values()];
  if (unique.length === 1) return unique[0];
  if (unique.length > 1) throw new Error(`I found more than one email address for “${value}”. Ask the user which address to use, or request the full email address.`);
  throw new Error(`I couldn’t find an exact match for “${value}” in Google Contacts. Ask the user to check the saved contact name or provide the full email address.`);
}
async function sendGmailEmail(draft: { to: string; subject: string; body: string; attachment?: { path: string; filename: string; contentType: string } }) {
  const to = draft.to.trim(), subject = draft.subject.trim(), body = draft.body.trim();
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(to) || /[\r\n]/.test(to) || /[\r\n]/.test(subject) || !subject || !body) throw new Error('The email recipient, subject, or message is invalid.');
  if (body.length > 20_000) throw new Error('The email body is too long to send from JARVIS.');
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
  let mime: string;
  if (draft.attachment) {
    const attachmentBytes = await readFile(draft.attachment.path);
    if (!attachmentBytes.length || attachmentBytes.length > 15 * 1024 * 1024) throw new Error('The invitation image is empty or too large to attach.');
    const boundary = `jarvis_${randomBytes(18).toString('hex')}`;
    const attachmentName = draft.attachment.filename.replace(/[\r\n"\\]/g, '_');
    const imageData = attachmentBytes.toString('base64').match(/.{1,76}/g)?.join('\r\n') || '';
    mime = `To: ${to}\r\nSubject: ${encodedSubject}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(body, 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') || ''}\r\n--${boundary}\r\nContent-Type: ${draft.attachment.contentType}\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="${attachmentName}"\r\n\r\n${imageData}\r\n--${boundary}--`;
  } else {
    mime = `To: ${to}\r\nSubject: ${encodedSubject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(body, 'utf8').toString('base64')}`;
  }
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { Authorization: `Bearer ${await gmailAccessToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: Buffer.from(mime, 'utf8').toString('base64url') }) });
  if (!response.ok) {
    const details = await response.text();
    let googleReason = details;
    try {
      const parsed = JSON.parse(details) as { error?: { message?: string; errors?: { reason?: string }[]; status?: string } };
      googleReason = [parsed.error?.errors?.map(item => item.reason).filter(Boolean).join(', '), parsed.error?.message, parsed.error?.status].filter(Boolean).join(' — ') || details;
    } catch {}
    if (response.status === 401) throw new Error(`Gmail authorization expired or was rejected: ${googleReason.slice(0, 220)}. Reconnect Gmail in Configuration.`);
    if (response.status === 403) throw new Error(`Google blocked the Gmail send request: ${googleReason.slice(0, 260)}. Check that the Gmail API is enabled in this OAuth project's Google Cloud Console and reconnect Gmail.`);
    throw new Error(`Gmail send failed (${response.status}): ${details.slice(0, 220)}`);
  }
  return await response.json() as { id?: string; threadId?: string };
}
async function sendTwilioSms(message: string) {
  const accountSid = await getStoredKey('twilio-account-sid');
  const authToken = await getStoredKey('twilio-auth-token');
  const from = await getStoredKey('twilio-from-number');
  const to = await getStoredKey('twilio-to-number');
  if (!accountSid || !authToken || !from || !to) throw new Error('Set your Twilio Account SID, Auth Token, SMS number, and your phone number in JARVIS Configuration first.');
  if (!/^AC[0-9a-f]{32}$/i.test(accountSid)) throw new Error('The Twilio Account SID must be the AC… SID shown in your Twilio Console.');
  if (![from, to].every(value => /^\+[1-9]\d{7,14}$/.test(value))) throw new Error('Enter both phone numbers in international format, such as +14155550123.');
  const body = message.trim();
  if (!body || body.length > 1500) throw new Error('The text message must contain 1 to 1,500 characters.');
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ From: from, To: to, Body: body }), signal: AbortSignal.timeout(20_000) });
  const result = await response.json().catch(() => ({})) as { sid?: string; status?: string; message?: string; code?: number };
  if (!response.ok) throw new Error(`Twilio could not send the text (${response.status}${result.code ? ` / ${result.code}` : ''}): ${(result.message || 'Check the Twilio account, sender number, and verified recipient.').slice(0, 240)}`);
  return { sid: result.sid || '', status: result.status || 'accepted', to };
}
async function createInvitationCard(input: { occasion: string; wording: string; style: string }) {
  const apiKey = await getStoredKey('openai');
  if (!apiKey) throw new Error('Invitation images need an OpenAI API key. Add it under “OPENAI API KEY” in Configuration; the Groq key cannot generate images.');
  const occasion = input.occasion.trim(), wording = input.wording.trim(), style = input.style.trim();
  if (!occasion || !wording || !style || occasion.length > 120 || wording.length > 1600 || style.length > 500) throw new Error('The invitation details are missing or too long.');
  const prompt = `Create a polished, print-ready invitation card as a single portrait image (1024x1536). Event: ${occasion}. Visual direction: ${style}. Place this wording on the card exactly as written, preserving spelling, punctuation, dates, times, address, and line breaks. Do not add, infer, or alter any event facts. Wording: “${wording}”. Use clear, elegant, highly legible typography, strong contrast, and generous safe margins. Make the design feel professionally art-directed and suitable for sharing or printing. No watermark, no mockup, no extra text.`;
  const response = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-image-2.5-sunburst', prompt, size: '1024x1536', quality: 'medium', output_format: 'png' }), signal: AbortSignal.timeout(180_000) });
  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 401) throw new Error('OpenAI rejected the key. Replace it in Configuration.');
    if (response.status === 429) throw new Error('OpenAI image generation is unavailable or out of quota. Check your API usage and billing.');
    throw new Error(`Invitation image generation failed (${response.status}): ${detail.slice(0, 280)}`);
  }
  const result = await response.json() as { data?: { b64_json?: string }[] };
  const encoded = result.data?.[0]?.b64_json;
  if (!encoded) throw new Error('OpenAI returned no invitation image. Try again with a simpler design description.');
  const image = Buffer.from(encoded, 'base64');
  if (image.length < 8 || image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('The generated invitation was not a valid PNG.');
  const directory = join(storeDir(), 'Invitations');
  await mkdir(directory, { recursive: true });
  const slug = occasion.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'invitation';
  const filename = `${slug}-${Date.now()}.png`;
  const path = join(directory, filename);
  await writeFile(path, image);
  return { path, filename };
}
async function googleCalendarContext() {
  const tokens = await getGmailTokens();
  if (!tokens?.refresh_token || !tokens.scope?.split(' ').includes(CALENDAR_EVENTS_SCOPE)) return 'Google Calendar access is not connected. Do not infer calendar availability or attempt edits; tell the user to grant Calendar event access in JARVIS Configuration.';
  const now = new Date();
  const rangeStart = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const rangeEnd = new Date(now.getTime() + 2 * 365 * 24 * 60 * 60 * 1000);
  const headers = { Authorization: `Bearer ${await gmailAccessToken()}` };
  const calendarsResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=100&minAccessRole=reader', { headers, signal: AbortSignal.timeout(10000) });
  if (!calendarsResponse.ok) return `Google Calendar list could not be read (HTTP ${calendarsResponse.status}). Do not assume there are no events.`;
  const calendars = await calendarsResponse.json() as { items?: { id: string; summary?: string; primary?: boolean }[] };
  const accessibleCalendars = calendars.items || [{ id: 'primary', summary: 'Primary calendar', primary: true }];
  const query = new URLSearchParams({ timeMin: rangeStart.toISOString(), timeMax: rangeEnd.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250', timeZone: 'America/Los_Angeles' });
  const eventResults: { calendar: string; calendarId: string; primary: boolean; events: { id?: string; summary?: string; status?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } }[] }[] = [];
  const errors: string[] = [];
  for (let index = 0; index < accessibleCalendars.length; index += 8) {
    const batch = accessibleCalendars.slice(index, index + 8);
    const results = await Promise.all(batch.map(async calendar => {
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?${query}`, { headers, signal: AbortSignal.timeout(10000) });
      if (!response.ok) { errors.push(`${calendar.summary || 'Calendar'} (HTTP ${response.status})`); return; }
      const result = await response.json() as { items?: { id?: string; summary?: string; status?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } }[] };
      eventResults.push({ calendar: calendar.summary || 'Calendar', calendarId: calendar.id, primary: Boolean(calendar.primary), events: result.items || [] });
    }));
    void results;
  }
  const fmt = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  const lines = eventResults.flatMap(calendar => calendar.events.filter(item => item.status !== 'cancelled').map(item => {
    const start = item.start?.dateTime ? fmt(item.start.dateTime) : item.start?.date ? `all day ${item.start.date}` : 'time unavailable';
    const end = item.end?.dateTime ? `–${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' }).format(new Date(item.end.dateTime))}` : '';
    return `- Calendar ${calendar.calendar}${calendar.primary ? ' (primary)' : ''} | Calendar ID ${calendar.calendarId} | Event ID ${item.id || 'unavailable'} | ${start}${end}: ${(item.summary || 'Untitled event').slice(0, 120)}`;
  }));
  return `The user's Google calendars, read live at ${now.toISOString()}; event names and times are private. Search range: ${rangeStart.toISOString()} through ${rangeEnd.toISOString()}. Times shown in America/Los_Angeles. Birthday events may be on a separate “Birthdays” calendar. Use matching calendar events to answer and check conflicts; this is not a complete view outside this range.${errors.length ? ` Some calendars could not be read: ${errors.slice(0, 6).join(', ')}.` : ''}\n${lines.length ? lines.join('\n') : 'No events were returned in this date range.'}`;
}
async function manageGoogleCalendarEvent(args: { action: string; eventId?: string; calendarId?: string; title?: string; start?: string; end?: string; description?: string }) {
  const tokens = await getGmailTokens();
  if (!tokens?.refresh_token || !tokens.scope?.split(' ').includes(CALENDAR_EVENTS_SCOPE)) throw new Error('Google Calendar edit access is not connected. Open Configuration and grant Calendar event access, then try again.');
  if (!['create','update','delete'].includes(args.action)) throw new Error('Choose create, update, or delete for the calendar action.');
  const eventId = typeof args.eventId === 'string' ? args.eventId.trim() : '';
  if (args.action !== 'create' && (!eventId || eventId.length > 300 || !/^[a-zA-Z0-9_@.-]+$/.test(eventId))) throw new Error('I could not identify that calendar event. Ask JARVIS to check the event title and date first.');
  const calendarId = typeof args.calendarId === 'string' && args.calendarId.trim() ? args.calendarId.trim() : 'primary';
  if (calendarId.length > 300 || !/^[a-zA-Z0-9_@.-]+$/.test(calendarId)) throw new Error('I could not identify the calendar that contains that event.');
  const apiBase = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const headers = { Authorization: `Bearer ${await gmailAccessToken()}`, 'Content-Type': 'application/json' };
  if (args.action === 'delete') {
    const response = await fetch(`${apiBase}/${encodeURIComponent(eventId)}`, { method: 'DELETE', headers, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Google Calendar could not delete that event (HTTP ${response.status}). Refresh the calendar and try again.`);
    return 'The calendar event was deleted successfully.';
  }
  const isoTime = (value: unknown) => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
  if (args.action === 'create' && (!args.title?.trim() || !isoTime(args.start) || !isoTime(args.end))) throw new Error('To add the event, I need its title, date, start time, and end time with a timezone.');
  if (args.action === 'update' && !args.title?.trim() && !args.start && !args.end && args.description === undefined) throw new Error('Tell me what to change for that calendar event.');
  if (args.start && !isoTime(args.start) || args.end && !isoTime(args.end)) throw new Error('Use a valid date and time with a timezone, such as 2026-10-12T15:00:00-07:00.');
  if (args.start && args.end && Date.parse(args.end) <= Date.parse(args.start)) throw new Error('The event end time must be after its start time.');
  const payload: Record<string, unknown> = {};
  if (args.title?.trim()) payload.summary = args.title.trim().slice(0, 200);
  if (args.description !== undefined) payload.description = String(args.description).slice(0, 4000);
  if (args.start) payload.start = { dateTime: args.start, timeZone: 'America/Los_Angeles' };
  if (args.end) payload.end = { dateTime: args.end, timeZone: 'America/Los_Angeles' };
  const create = args.action === 'create';
  const response = await fetch(create ? apiBase : `${apiBase}/${encodeURIComponent(eventId)}`, { method: create ? 'POST' : 'PATCH', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 403) throw new Error('Google denied Calendar changes. Reconnect Google with Calendar event access in JARVIS Configuration and ensure the Calendar API is enabled.');
    if (response.status === 404) throw new Error('That calendar event was not found. Ask me to check the calendar again before editing it.');
    throw new Error(`Google Calendar could not save the change (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }
  const saved = await response.json() as { id?: string; summary?: string; htmlLink?: string };
  return create ? `Created “${saved.summary || args.title}” in Google Calendar.` : `Updated “${saved.summary || args.title || 'the calendar event'}” in Google Calendar.`;
}
async function openApprovedApp(name: string) {
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA || '';
  if (name === 'settings') { await shell.openExternal('ms-settings:'); return 'Windows Settings opened.'; }
  if (name === 'blender') { await launchBlender(); return 'Blender opened.'; }
  const choices: Record<string, { exe: string; args?: string[] }[]> = {
    calculator: [{ exe: 'calc.exe' }], notepad: [{ exe: 'notepad.exe' }], paint: [{ exe: 'mspaint.exe' }], file_explorer: [{ exe: 'explorer.exe' }],
    chrome: [{ exe: join(programFiles, 'Google/Chrome/Application/chrome.exe') }, { exe: join(programFilesX86, 'Google/Chrome/Application/chrome.exe') }, { exe: join(local, 'Google/Chrome/Application/chrome.exe') }],
    edge: [{ exe: join(programFilesX86, 'Microsoft/Edge/Application/msedge.exe') }, { exe: join(programFiles, 'Microsoft/Edge/Application/msedge.exe') }],
    visual_studio_code: [{ exe: join(local, 'Programs/Microsoft VS Code/Code.exe') }, { exe: join(programFiles, 'Microsoft VS Code/Code.exe') }],
    discord: [{ exe: join(local, 'Discord/Update.exe'), args: ['--processStart','Discord.exe'] }],
    spotify: [{ exe: join(local, 'Microsoft/WindowsApps/Spotify.exe') }, { exe: join(local, 'Spotify/Spotify.exe') }],
    bambu_studio: [{ exe: join(programFiles, 'Bambu Studio/bambu-studio.exe') }, { exe: join(local, 'Programs/Bambu Studio/bambu-studio.exe') }],
  };
  const target = (choices[name] || []).find(candidate => candidate.exe.includes('\\') || candidate.exe.includes('/') ? existsSync(candidate.exe) : true);
  if (!target) throw new Error(`${name.replaceAll('_',' ')} is not installed in its usual location.`);
  await new Promise<void>((resolve, reject) => { const child = spawn(target.exe, target.args || [], { detached: true, stdio: 'ignore', shell: false }); child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); }); });
  return `${name.replaceAll('_',' ')} opened.`;
}
async function controlLotusLamp(power: 'on' | 'off') {
  if (power !== 'on' && power !== 'off') throw new Error('The LotusLamp action must be on or off.');
  const appPath = app.getAppPath();
  const helper = join(appPath, 'electron', 'lotus_lamp_control.py');
  const pythonDeps = join(appPath, '.python-deps');
  try {
    const { stdout } = await execFileAsync(process.env.JARVIS_PYTHON || 'python', [helper, power], { timeout: 30_000, windowsHide: true, maxBuffer: 1024 * 1024, env: { ...process.env, JARVIS_PYTHON_DEPS: pythonDeps, LOTUS_LAMP_NAME: 'MELK-OA10 37' } });
    const resultLine = stdout.trim().split(/\r?\n/).at(-1) || '';
    const result = JSON.parse(resultLine) as { ok?: boolean; power?: string; device?: string; error?: string };
    if (!result.ok) throw new Error(result.error || 'The Bluetooth helper did not confirm sending the command.');
    return `Power-${power} command sent to ${result.device || 'the LotusLamp X light'}. The controller does not report its physical state, so I cannot verify the lamp visually.`;
  } catch (error) {
    const e = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
    const detail = [e.stderr?.trim(), e.message].filter(Boolean).join(' ');
    if (e.code === 'ENOENT') throw new Error('Python was not found. Install Python 3.10 or newer, then try again.');
    if (/No module named 'lotus_lamp'/.test(detail)) throw new Error('The LotusLamp Bluetooth helper is missing. Reinstall JARVIS or restore its .python-deps folder.');
    if (/not found|No device|No BLE device/i.test(detail)) throw new Error('I could not find MELK-OA10 37. Turn on the light, enable Bluetooth on this PC, keep it nearby, and disconnect LotusLamp X on your phone before retrying.');
    throw new Error(`LotusLamp Bluetooth command failed: ${detail.slice(0, 280)}`);
  }
}
function createWindow() {
  win = new BrowserWindow({ width: 1440, height: 940, minWidth: 980, minHeight: 680, frame: false, backgroundColor: '#050a1a', title: 'JARVIS', webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.webContents.setWindowOpenHandler(({ url }) => { void shell.openExternal(url); return { action: 'deny' }; });
  if (process.env.VITE_DEV_SERVER_URL) void win.loadURL(process.env.VITE_DEV_SERVER_URL); else void win.loadFile(join(__dirname, '../dist/index.html'));
}

app.whenReady().then(async () => {
  await loadLocalEnv();
  await importLocalSchoolProfileSeed();
  createWindow();
  // This app has no remote content; grant only its own renderer access to audio capture.
  session.defaultSession.setPermissionCheckHandler((webContents, permission, _origin, details) =>
    permission === 'media' && webContents === win?.webContents && details?.mediaType === 'audio'
  );
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) =>
    callback(permission === 'media' && webContents === win?.webContents && (((details as { mediaTypes?: string[] } | undefined)?.mediaTypes?.includes('audio')) ?? true))
  );
  ipcMain.handle('window:control', (_e, action: string) => { if (!win) return; if (action === 'minimize') win.minimize(); else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize(); else if (action === 'close') win.close(); });
  ipcMain.handle('gmail:status', async () => { const tokens = await getGmailTokens(); const scopes = tokens?.scope?.split(' ') || []; return { connected: Boolean(tokens?.refresh_token), calendarReady: scopes.includes(CALENDAR_EVENTS_SCOPE), contactsReady: scopes.includes(CONTACTS_READ_SCOPE), clientId: await getStoredKey('gmail-client-id') }; });
  ipcMain.handle('sms:config-get', async () => ({ accountSid: await getStoredKey('twilio-account-sid'), from: await getStoredKey('twilio-from-number'), to: await getStoredKey('twilio-to-number'), authTokenSet: Boolean(await getStoredKey('twilio-auth-token')), configured: Boolean(await getStoredKey('twilio-account-sid') && await getStoredKey('twilio-auth-token') && await getStoredKey('twilio-from-number') && await getStoredKey('twilio-to-number')) }));
  ipcMain.handle('sms:config-save', async (_event, config: { accountSid: string; authToken: string; from: string; to: string }) => {
    for (const [key, value] of Object.entries(config)) if (typeof value !== 'string' || value.length > 300) throw new Error('SMS configuration values must be text shorter than 300 characters.');
    await saveStoredKey('twilio-account-sid', config.accountSid.trim());
    if (config.authToken.trim()) await saveStoredKey('twilio-auth-token', config.authToken.trim());
    await saveStoredKey('twilio-from-number', config.from.trim());
    await saveStoredKey('twilio-to-number', config.to.trim());
    const complete = Boolean(config.accountSid.trim() && (config.authToken.trim() || await getStoredKey('twilio-auth-token')) && config.from.trim() && config.to.trim());
    return { configured: complete };
  });
  ipcMain.handle('gmail:connect', async (_event, clientId: string, clientSecret: string) => connectGmail(clientId, clientSecret));
  ipcMain.handle('gmail:disconnect', async () => { await saveStoredKey(gmailTokensFileKey, ''); pendingEmail = null; win?.webContents.send('email:pending', null); return true; });
  ipcMain.handle('email:confirm', async (_event, id: string) => {
    if (!pendingEmail || pendingEmail.id !== id || Date.now() - pendingEmail.createdAt > 5 * 60_000) throw new Error('That email confirmation has expired. Ask JARVIS to prepare it again.');
    const draft = pendingEmail; pendingEmail = null; win?.webContents.send('email:pending', null);
    try { const sent = await sendGmailEmail(draft); return { sent: true, to: draft.to, messageId: sent.id }; }
    catch (error) { pendingEmail = draft; win?.webContents.send('email:pending', draft); throw error; }
  });
  ipcMain.handle('email:cancel', async (_event, id: string) => { if (pendingEmail?.id === id) { pendingEmail = null; win?.webContents.send('email:pending', null); } return true; });
  ipcMain.handle('system:info', async () => ({ cpu: await cpuUsage(), memory: Math.round((1 - freemem() / totalmem()) * 100), platform: process.platform }));
  ipcMain.handle('school:profile-load', async () => getStoredKey('school-profile'));
  ipcMain.handle('school:profile-save', async (_event, profile: string) => {
    if (typeof profile !== 'string' || profile.length > 5000) throw new Error('Keep saved school details under 5,000 characters.');
    await saveStoredKey('school-profile', profile.trim());
    return true;
  });
  ipcMain.handle('history:load', async () => {
    let parsed: any;
    try { parsed = JSON.parse(await readFile(historyFile(), 'utf8')); } catch {}
    let sessions = Array.isArray(parsed) ? (parsed.length ? [{ id: 'legacy-conversation', title: '', createdAt: Date.now(), updatedAt: Date.now(), messages: parsed }] : []) : Array.isArray(parsed?.sessions) ? parsed.sessions : [];
    sessions = sessions.map((session: any) => {
      const messages = Array.isArray(session.messages) ? session.messages : [];
      const firstUser = messages.find((message: any) => message.role === 'user')?.content || '';
      const title = session.title || firstUser.slice(0, 38) || 'Recovered conversation';
      return { id: session.id || crypto.randomUUID(), title, createdAt: session.createdAt || messages[0]?.time || Date.now(), updatedAt: session.updatedAt || messages.at(-1)?.time || Date.now(), messages };
    });
    if (!sessions.length) sessions = [{ id: crypto.randomUUID(), title: 'New conversation', createdAt: Date.now(), updatedAt: Date.now(), messages: [] }];
    const activeId = sessions.some((session: any) => session.id === parsed?.activeId) ? parsed.activeId : sessions[0].id;
    return { sessions, activeId };
  });
  ipcMain.handle('history:save', async (_e, store: { sessions: { id: string; title: string; createdAt: number; updatedAt: number; messages: unknown[] }[]; activeId: string }) => {
    await mkdir(storeDir(), { recursive: true });
    const sessions = (store.sessions || []).slice(0, 100).map(session => ({ ...session, messages: session.messages.slice(-300) }));
    await writeFile(historyFile(), JSON.stringify({ sessions, activeId: store.activeId }, null, 2), 'utf8');
  });
  ipcMain.handle('settings:key-status', async () => Boolean(envValue('GROQ_API_KEY') || await getStoredKey('groq') || await getStoredKey('openai')));
  ipcMain.handle('settings:fish-status', async () => Boolean(envValue('FISH_AUDIO_API_KEY') || await getStoredKey('fish-audio')));
  ipcMain.handle('settings:credential-status', async () => ({ groq: Boolean(envValue('GROQ_API_KEY') || await getStoredKey('groq')), fish: Boolean(envValue('FISH_AUDIO_API_KEY') || await getStoredKey('fish-audio')), openai: Boolean(await getStoredKey('openai')) }));
  ipcMain.handle('settings:credential-save', async (_e, name: 'groq' | 'fish-audio' | 'openai', key: string) => {
    if (!['groq', 'fish-audio', 'openai'].includes(name)) throw new Error('Unknown credential type.');
    await saveStoredKey(name, key);
    return true;
  });
  ipcMain.handle('connection:check', async () => {
    const savedGroq = await getStoredKey('groq');
    const groqKey = savedGroq || envValue('GROQ_API_KEY');
    const savedOpenAI = await getStoredKey('openai');
    const key = groqKey || savedOpenAI;
    const provider = groqKey ? 'Groq' : 'OpenAI';
    const model = groqKey ? GROQ_MODEL : 'gpt-4o-mini';
    const source = groqKey ? (savedGroq ? 'This device' : process.env.GROQ_API_KEY ? 'Environment variable' : '.env file') : savedOpenAI ? 'This device' : 'Not configured';
    if (!key) return { ok: false, provider: 'None', model: '—', source: 'Not configured', message: 'Add a Groq API key in Configuration.' };
    try {
      const response = await fetch(groqKey ? 'https://api.groq.com/openai/v1/models' : 'https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
      if (!response.ok) {
        if (response.status === 401) return { ok: false, provider, model, source, message: `${provider} rejected this key. Replace it in Configuration.` };
        if (response.status === 429) return { ok: false, provider, model, source, message: `${provider} rate limited the check. Wait a moment, then retry.` };
        return { ok: false, provider, model, source, message: `${provider} returned HTTP ${response.status}.` };
      }
      if (groqKey) {
        const catalog = await response.json() as { data?: { id: string }[] };
        if (!catalog.data?.some(entry => entry.id === model)) return { ok: false, provider, model, source, message: 'The key is valid, but the configured Groq model is unavailable for this account. Select an active model in Groq or contact its administrator.' };
      }
      return { ok: true, provider, model, source, message: 'Connection and model are available.' };
    } catch {
      return { ok: false, provider, model, source, message: 'Could not reach the provider. Check your internet connection and try again.' };
    }
  });
  ipcMain.handle('chat:send', async (event, payload: { messages: { role: 'user' | 'assistant'; content: string }[]; model?: string }) => {
    const storedGroqKey = await getStoredKey('groq');
    const groqKey = storedGroqKey || envValue('GROQ_API_KEY');
    const key = groqKey || await getStoredKey('openai');
    if (!key) throw new Error('Add your Groq API key in Configuration to connect JARVIS.');
    let approvalNote = '';
    const latestUserText = [...payload.messages].reverse().find(message => message.role === 'user')?.content.trim().toLowerCase().replace(/[.!?]+$/, '') || '';
    const affirmative = /^(yes|yes send it|yes,? send it|send it|send the email|go ahead|confirm|confirmed|do it|please send|send)$/i.test(latestUserText);
    const negative = /^(no|no thanks|cancel|cancel it|don't send|do not send|not now|keep as draft)$/i.test(latestUserText);
    if (pendingEmail && Date.now() - pendingEmail.createdAt > 5 * 60_000) { pendingEmail = null; event.sender.send('email:pending', null); }
    if (pendingEmail && affirmative) {
      const draft = pendingEmail;
      try { const sent = await sendGmailEmail(draft); pendingEmail = null; event.sender.send('email:pending', null); approvalNote = `The requested email was sent successfully (Gmail message ID ${sent.id || 'returned'}). Tell the user it was sent.`; }
      catch (error) { approvalNote = `Sending failed: ${error instanceof Error ? error.message : 'Unknown error'}. The email remains pending for retry.`; }
    } else if (pendingEmail && negative) { pendingEmail = null; event.sender.send('email:pending', null); approvalNote = 'The pending email was cancelled and was not sent. Confirm that calmly.'; }
    else if (pendingEmail && latestUserText) { pendingEmail = null; event.sender.send('email:pending', null); }
    const groq = Boolean(groqKey);
    const model = payload.model || (groq ? GROQ_MODEL : 'gpt-4o-mini');
    const latestQuestion = [...payload.messages].reverse().find(message => message.role === 'user')?.content || '';
    const needsSchoolContext = /\b(school|palms|class|homework|party|schedule|bell|dismissal|free after|free on|club|clubs|availability|available|commitments|extracurriculars|calendar|event|events|plans|busy|free time)\b|\bd\s*&\s*d\b|\bdungeons?\s*(?:&|and)\s*dragons?\b/i.test(latestQuestion);
    const needsCalendarContext = needsSchoolContext || /\bbirthdays?\b|\bappointments?\b/i.test(latestQuestion);
    const schoolProfile = needsSchoolContext ? await getStoredKey('school-profile') : '';
    const schoolContext = needsSchoolContext ? await palmsSchoolContext() : '';
    const calendarContext = needsCalendarContext ? await googleCalendarContext() : '';
    const messages: any[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...(schoolProfile ? [{ role: 'system', content: `Student-provided recurring schedule and commitments (saved locally by the user; use as private planning context):\n${schoolProfile}` }] : []), ...(schoolContext ? [{ role: 'system', content: schoolContext }] : []), ...(calendarContext ? [{ role: 'system', content: calendarContext }] : []), ...(approvalNote ? [{ role: 'system', content: `${approvalNote} Do not call any action tool for this response.` }] : []), ...payload.messages.slice(-24)];
    const endpoint = groq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
    const streamTurn = async (allowTools: boolean) => {
      const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, stream: true, messages, ...(allowTools ? { tools: ACTION_TOOLS, tool_choice: 'auto', parallel_tool_calls: false } : {}) }) });
      if (!response.ok) {
        const detail = await response.text();
        if (response.status === 401) throw new Error(groq ? 'Groq rejected its API key. In Configuration, replace GROQ_API_KEY with an active key from the Groq Console.' : 'OpenAI rejected its API key. Replace the OpenAI fallback key in Configuration.');
        if (response.status === 429) throw new Error(`${groq ? 'Groq' : 'OpenAI'} rate limit or quota reached. Check the provider usage page, then wait for the limit to reset or adjust your plan.`);
        if (response.status === 404 && groq) throw new Error(`Groq could not find model “${model}”. Open Configuration and run the connection check; select an active model in your Groq project if needed.`);
        throw new Error(`API error ${response.status}: ${detail.slice(0, 280)}`);
      }
      if (!response.body) throw new Error('The response stream was unavailable.');
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = ''; const calls = new Map<number, any>();
      const consume = (line: string) => {
        if (!line.startsWith('data: ')) return;
        const data = line.slice(6).trim(); if (!data || data === '[DONE]') return;
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta;
          if (typeof delta?.content === 'string' && delta.content) event.sender.send('chat:token', delta.content);
          for (const part of delta?.tool_calls || []) {
            const call = calls.get(part.index) || { id: '', type: 'function', function: { name: '', arguments: '' } };
            if (part.id) call.id = part.id;
            if (part.function?.name) call.function.name += part.function.name;
            if (part.function?.arguments) call.function.arguments += part.function.arguments;
            calls.set(part.index, call);
          }
        } catch {}
      };
      try {
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || ''; lines.forEach(consume);
        }
        if (buffer) consume(buffer);
      } finally { reader.releaseLock(); }
      return [...calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => call);
    };
    let allowTools = !approvalNote;
    for (let turn = 0; turn < 3; turn++) {
      const calls = await streamTurn(allowTools);
      if (!calls.length) break;
      messages.push({ role: 'assistant', content: null, tool_calls: calls });
      for (const call of calls) {
        let result: string;
        try {
          const args = JSON.parse(call.function.arguments || '{}');
          if (call.function.name === 'open_app') result = await openApprovedApp(args.app);
          else if (call.function.name === 'manage_calendar_event') result = await manageGoogleCalendarEvent(args);
          else if (call.function.name === 'draft_email') {
            if (![args.to,args.subject,args.body].every(value => typeof value === 'string' && value.trim())) throw new Error('I need the recipient email address, subject, and message before I can prepare a draft.');
            if (!(await getGmailTokens())?.refresh_token) throw new Error('Gmail is not connected. Open Configuration and connect Gmail first.');
            if (typeof args.send_immediately !== 'boolean') throw new Error('Specify whether the user explicitly asked to send this email now or only requested a draft.');
            const recipient = await resolveContactEmail(args.to);
            if (args.send_immediately) {
              const sent = await sendGmailEmail({ to: recipient.email, subject: args.subject.trim(), body: args.body.trim() });
              result = `Gmail reported the email sent to ${recipient.displayName} (${recipient.email}); message ID ${sent.id || 'returned'}. Tell the user it was sent.`;
            } else {
              pendingEmail = { id: randomBytes(16).toString('hex'), to: recipient.email, subject: args.subject.trim(), body: args.body.trim(), createdAt: Date.now() };
              event.sender.send('email:pending', pendingEmail);
              result = `The email is prepared for ${recipient.displayName} and shown in JARVIS for review. It has not been sent. Ask the user to check it and explicitly approve or cancel.`;
            }
          } else if (call.function.name === 'create_invitation_card') {
            if (![args.occasion, args.wording, args.style].every(value => typeof value === 'string' && value.trim())) throw new Error('I need the occasion, the exact event wording, and the visual style before making the invitation.');
            const file = await createInvitationCard({ occasion: args.occasion, wording: args.wording, style: args.style });
            const accountEmail = await googleAccountEmail();
            const sent = await sendGmailEmail({ to: accountEmail, subject: `Your ${args.occasion.trim()} invitation to review`, body: 'JARVIS created the attached invitation image from your description. Please review the event wording and design before sharing or printing it.', attachment: { path: file.path, filename: file.filename, contentType: 'image/png' } });
            shell.showItemInFolder(file.path);
            result = `Invitation created and emailed to the connected Google account (${accountEmail}) for review (Gmail message ID ${sent.id || 'returned'}). A local PNG copy is saved at ${file.path}. Tell the user the email was sent and that image text should be checked before sharing.`;
          } else if (call.function.name === 'send_text') {
            if (typeof args.message !== 'string' || !args.message.trim()) throw new Error('I need the text message before I can send it.');
            const sent = await sendTwilioSms(args.message);
            result = `Twilio accepted the text for ${sent.to} (message SID ${sent.sid || 'returned'}, status ${sent.status}). Tell the user Twilio accepted it; do not claim handset delivery.`;
          } else if (call.function.name === 'control_lotus_lamp') {
            if (args.power !== 'on' && args.power !== 'off') throw new Error('Choose on or off for the LotusLamp.');
            result = await controlLotusLamp(args.power);
          } else if (call.function.name === 'create_blender_model') {
            if (typeof args.description !== 'string' || !args.description.trim()) throw new Error('I need a description of what you want to model.');
            const file = await createBlenderModel(args.description);
            await launchBlender([file.blendPath]);
            shell.showItemInFolder(file.blendPath);
            result = `The editable Blender project “${file.title}” is open for review. Project: ${file.blendPath}. Blender Python source: ${file.scriptPath}. Review dimensions and geometry; the project has not been checked or prepared for printing.`;
          } else if (call.function.name === 'open_blend_file') {
            const selection = await dialog.showOpenDialog(win!, { title: 'Select a Blender project', properties: ['openFile'], filters: [{ name: 'Blender projects', extensions: ['blend'] }] });
            if (selection.canceled || !selection.filePaths[0]) result = 'The user cancelled file selection; no Blender project was opened.';
            else { await launchBlender([selection.filePaths[0]]); result = `The Blender project is open: ${selection.filePaths[0]}.`; }
          } else if (call.function.name === 'create_3d_model') {
            if (typeof args.description !== 'string' || !args.description.trim()) throw new Error('I need a description of the model and its dimensions.');
            const file = await createModelSource(args.description); shell.showItemInFolder(file.path); result = `OpenSCAD source created at ${file.path}. OpenSCAD must render/export it before it is printable.`;
          } else if (call.function.name === 'open_printable_in_bambu_studio') {
            const selection = await dialog.showOpenDialog(win!, { title: 'Select a model for Bambu Studio', properties: ['openFile'], filters: [{ name: 'Printable models', extensions: ['stl','3mf','obj','step','stp'] }] });
            if (selection.canceled || !selection.filePaths[0]) result = 'The user cancelled file selection; no print action was taken.';
            else { const paths = [join(process.env.ProgramFiles || 'C:\\Program Files', 'Bambu Studio', 'bambu-studio.exe'), join(process.env.LOCALAPPDATA || '', 'Programs', 'Bambu Studio', 'bambu-studio.exe')]; const exe = paths.find(path => existsSync(path)); if (!exe) throw new Error('Bambu Studio was not found.'); const child = spawn(exe, [selection.filePaths[0]], { detached: true, stdio: 'ignore' }); child.unref(); result = 'The model is open in Bambu Studio for review. No print has been started.'; }
          } else throw new Error(`Unknown action: ${call.function.name}`);
        } catch (error) { result = `Action could not be completed: ${error instanceof Error ? error.message : 'Unknown error'}`; }
        messages.push({ role: 'tool', tool_call_id: call.id, name: call.function.name, content: result });
      }
      allowTools = turn < 1;
    }
    event.sender.send('chat:done'); return true;
  });
  ipcMain.handle('voice:speak', async (_event, text: string) => {
    const key = await getStoredKey('fish-audio') || envValue('FISH_AUDIO_API_KEY');
    if (!key) throw new Error('FISH_AUDIO_API_KEY is not configured.');
    const response = await fetch('https://api.fish.audio/v1/tts', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', model: 's2.1-pro-free' }, body: JSON.stringify({ text: text.slice(0, 5000), reference_id: FISH_VOICE_ID, format: 'mp3' }) });
    if (!response.ok) throw new Error(`Fish Audio error ${response.status}: ${(await response.text()).slice(0, 240)}`);
    return { audioBase64: Buffer.from(await response.arrayBuffer()).toString('base64'), mimeType: response.headers.get('content-type') || 'audio/mpeg' };
  });
  ipcMain.handle('voice:transcribe', async (_event, audioBase64: string, mimeType: string) => {
    const key = await getStoredKey('groq') || envValue('GROQ_API_KEY');
    if (!key) throw new Error('Voice transcription needs a GROQ_API_KEY. Add it in Configuration.');
    const bytes = Buffer.from(audioBase64, 'base64');
    if (!bytes.length) throw new Error('No microphone audio was captured. Check that the correct microphone is selected in Windows Settings.');
    if (bytes.length > 24 * 1024 * 1024) throw new Error('That recording is too large to transcribe. Try a shorter phrase.');
    const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(bytes)], { type: mimeType || 'audio/webm' }), `jarvis-voice.${extension}`);
    form.append('model', 'whisper-large-v3-turbo');
    form.append('language', 'en');
    form.append('response_format', 'json');
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
    if (!response.ok) {
      const detail = await response.text();
      if (response.status === 401) throw new Error('Groq rejected the voice transcription key. Replace GROQ_API_KEY in Configuration.');
      if (response.status === 429) throw new Error('Groq voice transcription is rate limited or out of quota. Check your Groq usage.');
      throw new Error(`Groq transcription error ${response.status}: ${detail.slice(0, 220)}`);
    }
    const result = await response.json() as { text?: string };
    return (result.text || '').trim();
  });
  ipcMain.handle('email:open-draft', async (_event, draft: { to: string; subject: string; body: string }) => {
    const params = new URLSearchParams({ view: 'cm', fs: '1', to: draft.to, su: draft.subject, body: draft.body });
    await shell.openExternal(`https://mail.google.com/mail/?${params.toString()}`);
    return true;
  });
  ipcMain.handle('printer:open-file', async () => {
    const result = await dialog.showOpenDialog(win!, { title: 'Select a model for Bambu Studio', properties: ['openFile'], filters: [{ name: 'Printable models', extensions: ['stl', '3mf', 'obj', 'step', 'stp'] }] });
    if (result.canceled || !result.filePaths[0]) return { opened: false };
    const candidates = [join(process.env.ProgramFiles || 'C:\\Program Files', 'Bambu Studio', 'bambu-studio.exe'), join(process.env.LOCALAPPDATA || '', 'Programs', 'Bambu Studio', 'bambu-studio.exe')];
    const executable = candidates.find(path => path && existsSync(path));
    if (!executable) throw new Error('Bambu Studio was not found. Install it, then try again.');
    const child = spawn(executable, [result.filePaths[0]], { detached: true, stdio: 'ignore' }); child.unref();
    return { opened: true, filePath: result.filePaths[0] };
  });
  ipcMain.handle('model:create-source', async (_event, prompt: string) => createModelSource(prompt));
  ipcMain.handle('model:create-blender', async (_event, description: string) => {
    const file = await createBlenderModel(description);
    await launchBlender([file.blendPath]);
    shell.showItemInFolder(file.blendPath);
    return { title: file.title, blendPath: file.blendPath, scriptPath: file.scriptPath };
  });
  ipcMain.handle('model:open-blend', async () => {
    const selection = await dialog.showOpenDialog(win!, { title: 'Select a Blender project', properties: ['openFile'], filters: [{ name: 'Blender projects', extensions: ['blend'] }] });
    if (selection.canceled || !selection.filePaths[0]) return { opened: false };
    await launchBlender([selection.filePaths[0]]);
    return { opened: true, filePath: selection.filePaths[0] };
  });
  ipcMain.handle('model:show-file', async (_event, path: string) => {
    const modelsDirectory = join(storeDir(), 'Models');
    const fromModels = relative(modelsDirectory, path);
    if (isAbsolute(fromModels) || fromModels.startsWith('..')) throw new Error('That file is outside JARVIS Models.');
    shell.showItemInFolder(path); return true;
  });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
