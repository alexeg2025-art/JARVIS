import { useState } from 'react';
import { Box, Mail, Printer, X, FolderOpen } from 'lucide-react';

type ActionCenterProps = { onClose: () => void };

export function ActionCenter({ onClose }: ActionCenterProps) {
  const [design, setDesign] = useState('');
  const [designFile, setDesignFile] = useState('');
  const [blenderDesign, setBlenderDesign] = useState('');
  const [blendFile, setBlendFile] = useState('');
  const [blenderScript, setBlenderScript] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('');
  const [failure, setFailure] = useState(false);

  const run = async (action: string, task: () => Promise<void>) => {
    setBusy(action); setStatus(''); setFailure(false);
    try { await task(); } catch (err) { setFailure(true); setStatus(err instanceof Error ? err.message : 'The action failed.'); }
    finally { setBusy(''); }
  };

  const createModel = () => run('model', async () => {
    const result = await window.jarvis.createModelSource(design);
    setDesignFile(result.path); setStatus(`Design source saved: ${result.path}. Open it in OpenSCAD, render it, then export STL for Bambu Studio.`);
  });
  const createBlender = () => run('blender', async () => {
    const result = await window.jarvis.createBlenderModel(blenderDesign);
    setBlendFile(result.blendPath); setBlenderScript(result.scriptPath);
    setStatus(`${result.title} is open in Blender. JARVIS saved an editable .blend project and a constrained Python source script. Inspect dimensions and geometry before using it for 3D printing.`);
  });
  const openBlend = () => run('blend-file', async () => {
    const result = await window.jarvis.openBlendFile();
    if (result.opened) { setBlendFile(result.filePath || ''); setStatus('Blender project opened for editing.'); }
  });
  const openDraft = () => run('email', async () => {
    await window.jarvis.openGmailDraft({ to, subject, body });
    setStatus('Gmail opened with your draft. Review the recipient and message there before sending.');
  });
  const openPrinter = () => run('printer', async () => {
    const result = await window.jarvis.openPrintableInSlicer();
    if (result.opened) setStatus('Model opened in Bambu Studio. Review the printer, filament, and slice preview before starting a print.');
  });

  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="settings-modal" style={{ width: 'min(760px, 94vw)', padding: 26 }}>
      <div className="modal-header"><div><span className="panel-label">LOCAL ACTIONS</span><h2>JARVIS workbench</h2></div><button onClick={onClose} aria-label="Close workbench"><X size={18}/></button></div>
      <p className="modal-copy">Designs are saved locally. Email opens as a Gmail draft for your review. A print file opens in Bambu Studio; JARVIS will not start the printer without a separate confirmation.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <section style={{ border: '1px solid rgba(0,212,255,.2)', padding: 16, background: 'rgba(4,14,31,.55)' }}>
          <div className="field-label"><Box size={14} style={{ verticalAlign: 'middle', marginRight: 7 }}/>CREATE A 3D DESIGN</div>
          <p className="modal-copy" style={{ margin: '8px 0 12px' }}>Describe the part and its dimensions. JARVIS generates a parametric OpenSCAD source file.</p>
          <textarea value={design} onChange={event => setDesign(event.target.value)} placeholder="A 60 mm cable organizer with six rounded slots…" rows={4} style={{ width: '100%', resize: 'vertical', padding: 10, background: '#050d1c', border: '1px solid #26425b', outline: 0, color: '#d7efff', font: "11px 'Share Tech Mono'" }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}><button className="credential-save" disabled={!design.trim() || !!busy} onClick={() => void createModel()}>{busy === 'model' ? 'DESIGNING…' : 'GENERATE MODEL SOURCE'}</button>{designFile && <button className="credential-save" onClick={() => void window.jarvis.showModelFile(designFile)}><FolderOpen size={12}/> SHOW FILE</button>}</div>
        </section>
        <section style={{ border: '1px solid rgba(0,212,255,.2)', padding: 16, background: 'rgba(4,14,31,.55)' }}>
          <div className="field-label"><Mail size={14} style={{ verticalAlign: 'middle', marginRight: 7 }}/>PREPARE GMAIL DRAFT</div>
          <input aria-label="Recipient" value={to} onChange={event => setTo(event.target.value)} placeholder="To" style={{ marginBottom: 8 }}/>
          <input aria-label="Subject" value={subject} onChange={event => setSubject(event.target.value)} placeholder="Subject" style={{ marginBottom: 8 }}/>
          <textarea aria-label="Email message" value={body} onChange={event => setBody(event.target.value)} placeholder="Message" rows={4} style={{ width: '100%', resize: 'vertical', padding: 10, background: '#050d1c', border: '1px solid #26425b', outline: 0, color: '#d7efff', font: "11px 'Share Tech Mono'" }}/>
          <button className="credential-save" disabled={!to.trim() || !subject.trim() || !body.trim() || !!busy} onClick={() => void openDraft()}>{busy === 'email' ? 'OPENING GMAIL…' : 'OPEN REVIEWABLE DRAFT'}</button>
        </section>
      </div>
      <section style={{ marginTop: 18, border: '1px solid rgba(0,212,255,.2)', padding: 16, background: 'rgba(4,14,31,.55)' }}>
        <div className="field-label"><Box size={14} style={{ verticalAlign: 'middle', marginRight: 7 }}/>CREATE IN BLENDER</div>
        <p className="modal-copy" style={{ margin: '8px 0 12px' }}>Describe what you want JARVIS to build. He creates an editable Blender project using a constrained set of geometric parts and opens it in Blender. The model is not automatically checked for 3D printing.</p>
        <textarea value={blenderDesign} onChange={event => setBlenderDesign(event.target.value)} placeholder="A small rocket model, about 120 mm tall, with a silver body, blue fins, and a rounded nose cone…" rows={3} style={{ width: '100%', resize: 'vertical', padding: 10, background: '#050d1c', border: '1px solid #26425b', outline: 0, color: '#d7efff', font: "11px 'Share Tech Mono'" }}/>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          <button className="credential-save" disabled={!blenderDesign.trim() || !!busy} onClick={() => void createBlender()}>{busy === 'blender' ? 'BUILDING IN BLENDER…' : 'CREATE BLENDER PROJECT'}</button>
          <button className="credential-save" disabled={!!busy} onClick={() => void openBlend()}>{busy === 'blend-file' ? 'OPENING…' : 'OPEN EXISTING .BLEND'}</button>
          {blendFile && <button className="credential-save" onClick={() => void window.jarvis.showModelFile(blendFile)}><FolderOpen size={12}/> SHOW PROJECT</button>}
          {blenderScript && <button className="credential-save" onClick={() => void window.jarvis.showModelFile(blenderScript)}><FolderOpen size={12}/> SHOW PYTHON SOURCE</button>}
        </div>
      </section>
      <section style={{ marginTop: 18, border: '1px solid rgba(0,212,255,.2)', padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, background: 'rgba(4,14,31,.55)' }}>
        <div><div className="field-label"><Printer size={14} style={{ verticalAlign: 'middle', marginRight: 7 }}/>BAMBU LAB P2S COMBO</div><p className="modal-copy" style={{ margin: '7px 0 0' }}>Open an STL, 3MF, OBJ, or STEP file in Bambu Studio to inspect and slice it.</p></div>
        <button className="credential-save" disabled={!!busy} onClick={() => void openPrinter()}>{busy === 'printer' ? 'OPENING…' : 'CHOOSE MODEL FILE'}</button>
      </section>
      {status && <div className={`connection-result ${failure ? 'failure' : 'success'}`}><p>{status}</p></div>}
      <div className="modal-actions"><button className="cancel-btn" onClick={onClose}>CLOSE</button></div>
    </div>
  </div>;
}
