import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AudioLines, VolumeX, Pause, Play, Square, ChevronDown, Command, Mic, Plus, Send, Settings2, ShieldCheck, X } from 'lucide-react';
import type { ChatMessage, ConversationSession } from './types';
import { Reactor } from './components/Reactor';
import { WindowControls } from './components/WindowControls';
import { ActionCenter } from './components/ActionCenter';

type State = 'idle' | 'listening' | 'thinking' | 'speaking';
const suggestions = ['Brief me on the day', 'Help me think through an idea', 'What can you do?'];
const cleanSpokenReply = (text: string) => text
  .replace(/```[\w-]*\s*([\s\S]*?)```/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/[*_`#~]/g, '')
  .replace(/^\s*[-+>]\s+/gm, '')
  .trim();

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [sessionSearch, setSessionSearch] = useState('');
  const [historyReady, setHistoryReady] = useState(false);
  const [input, setInput] = useState('');
  const [state, setState] = useState<State>('idle');
  const [cpu, setCpu] = useState(12); const [memory, setMemory] = useState(38);
  const [keyReady, setKeyReady] = useState(false);
  const [groqReady, setGroqReady] = useState(false);
  const [openAIReady, setOpenAIReady] = useState(false);
  const [fishReady, setFishReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [pendingEmail, setPendingEmail] = useState<PendingEmail | null>(null);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [calendarReady, setCalendarReady] = useState(false);
  const [contactsReady, setContactsReady] = useState(false);
  const [gmailClientId, setGmailClientId] = useState('');
  const [gmailClientSecret, setGmailClientSecret] = useState('');
  const [gmailBusy, setGmailBusy] = useState(false);
  const [smsConfigured, setSmsConfigured] = useState(false);
  const [twilioSid, setTwilioSid] = useState(''); const [twilioToken, setTwilioToken] = useState(''); const [twilioFrom, setTwilioFrom] = useState(''); const [twilioTo, setTwilioTo] = useState('');
  const [twilioAuthTokenSet, setTwilioAuthTokenSet] = useState(false); const [smsSaved, setSmsSaved] = useState(false);
  const [schoolProfile, setSchoolProfile] = useState('');
  const [schoolProfileSaved, setSchoolProfileSaved] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [draftGroq, setDraftGroq] = useState(''); const [draftFish, setDraftFish] = useState(''); const [draftOpenAI, setDraftOpenAI] = useState('');
  const [voiceOn, setVoiceOn] = useState(true);
  const [speechPaused, setSpeechPaused] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(new Date());
  const [listening, setListening] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef('');
  const listeningEnabledRef = useRef(false);
  const busyRef = useRef(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const lastVoiceAtRef = useRef(0);
  const recordingSpeechRef = useRef(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef('');
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechFinishRef = useRef<(() => void) | null>(null);
  const speechRequestRef = useRef(0);
  const speechPausedRef = useRef(false);

  useEffect(() => { void window.jarvis.loadHistory().then(store => { const loaded = store.sessions as ConversationSession[]; setSessions(loaded); setActiveSessionId(store.activeId); setMessages(loaded.find(session=>session.id===store.activeId)?.messages || []); }).catch(err => { setError(err instanceof Error ? `Local history could not be loaded: ${err.message}` : 'Local history could not be loaded.'); }).finally(() => setHistoryReady(true)); void window.jarvis.hasApiKey().then(setKeyReady); void window.jarvis.getCredentialStatus().then(status=>{setGroqReady(status.groq);setFishReady(status.fish);setOpenAIReady(status.openai);}); const id = window.setInterval(() => { setNow(new Date()); void window.jarvis.getSystemInfo().then(info => { setCpu(info.cpu); setMemory(info.memory); }); }, 2500); return () => clearInterval(id); }, []);
  useEffect(() => { void window.jarvis.gmailStatus().then(status => { setGmailConnected(status.connected); setCalendarReady(status.calendarReady); setContactsReady(status.contactsReady); setGmailClientId(status.clientId); }); return window.jarvis.onPendingEmail(setPendingEmail); }, []);
  useEffect(() => { void window.jarvis.smsConfig().then(config => { setSmsConfigured(config.configured); setTwilioSid(config.accountSid); setTwilioFrom(config.from); setTwilioTo(config.to); setTwilioAuthTokenSet(config.authTokenSet); }); }, []);
  useEffect(() => { void window.jarvis.loadSchoolProfile().then(setSchoolProfile); }, []);
  useEffect(() => { if (!historyReady || !activeSessionId) return; const firstUser = messages.find(message=>message.role==='user')?.content || ''; setSessions(prev=>prev.map(session=>session.id!==activeSessionId?session:{...session,title:session.title==='New conversation'&&firstUser?firstUser.slice(0,38):session.title,updatedAt:messages.at(-1)?.time || session.updatedAt,messages})); if (logRef.current && followLatestRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [messages, historyReady, activeSessionId]);
  useEffect(() => { if (historyReady) void window.jarvis.saveHistory({sessions,activeId:activeSessionId}); }, [sessions,activeSessionId,historyReady]);
useEffect(() => { const removeToken = window.jarvis.onToken(token => { streamRef.current += token; setMessages(prev => { const next = [...prev]; const last = next[next.length - 1]; if (last?.role === 'assistant' && last.id === 'streaming') next[next.length - 1] = { ...last, content: streamRef.current }; else next.push({ id: 'streaming', role: 'assistant', content: token, time: Date.now() }); return next; }); }); const removeDone = window.jarvis.onDone(() => { const answer = cleanSpokenReply(streamRef.current); setMessages(prev => prev.map(m => m.id === 'streaming' ? { ...m, id: crypto.randomUUID(), content: answer } : m)); streamRef.current = ''; busyRef.current = false; void (async () => { if (voiceOn && answer) await speak(answer); else setState('idle'); if (listeningEnabledRef.current) void startMicrophoneCapture(); })(); }); return () => { removeToken(); removeDone(); }; }, [voiceOn]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); createSession(); inputRef.current?.focus(); } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); });
  const submit = useCallback(async (text = input) => {
    const content = text.trim(); if (!content || !historyReady) return; if (state === 'speaking') stopSpeech(); if (busyRef.current || state === 'thinking') return;
    busyRef.current = true;
    followLatestRef.current = true;
    stopMicrophoneCapture();
    setError(''); setInput(''); inputRef.current?.blur(); const user: ChatMessage = { id: crypto.randomUUID(), role: 'user', content, time: Date.now() };
    const base = [...messages, user]; setMessages([...base, { id: 'streaming', role: 'assistant', content: '', time: Date.now() }]); setState('thinking'); streamRef.current = '';
    try { await window.jarvis.sendMessage(base.filter(m => m.id !== 'streaming').map(({ role, content: body }) => ({ role, content: body }))); } catch (err) { setMessages(base); busyRef.current = false; setState('idle'); setError(err instanceof Error ? err.message : 'The connection was interrupted.'); if (listeningEnabledRef.current) void startMicrophoneCapture(); }
  }, [historyReady, input, messages, state]);
  const submitRef = useRef(submit); submitRef.current = submit;
  const speak = async (text: string) => {
    const requestId = ++speechRequestRef.current;
    speechPausedRef.current = false; setSpeechPaused(false); setState('speaking');
    try {
      if (await window.jarvis.hasFishAudioKey()) {
        const { audioBase64, mimeType } = await window.jarvis.speakText(text);
        if (requestId !== speechRequestRef.current) return;
        const bytes = Uint8Array.from(atob(audioBase64), char => char.charCodeAt(0));
        const audioUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
        const audio = new Audio(audioUrl); audioPlayerRef.current = audio; audioUrlRef.current = audioUrl;
        await new Promise<void>(resolve => {
          let settled = false;
          const finish = () => { if (settled) return; settled = true; if (audioPlayerRef.current === audio) audioPlayerRef.current = null; if (audioUrlRef.current === audioUrl) { URL.revokeObjectURL(audioUrl); audioUrlRef.current = ''; } if (speechFinishRef.current === finish) speechFinishRef.current = null; resolve(); };
          speechFinishRef.current = finish; audio.onended = finish; audio.onerror = finish;
          if (speechPausedRef.current) audio.pause(); else void audio.play().catch(finish);
        });
        if (requestId === speechRequestRef.current) { speechPausedRef.current = false; setSpeechPaused(false); setState('idle'); }
        return;
      }
    } catch (err) { if (requestId !== speechRequestRef.current) return; setError(err instanceof Error ? err.message : 'Fish Audio could not synthesize the response.'); }
    if (requestId !== speechRequestRef.current) return;
    const utterance = new SpeechSynthesisUtterance(text); speechUtteranceRef.current = utterance; utterance.lang = 'en-GB'; utterance.rate = 0.94; const voice = speechSynthesis.getVoices().find(v => v.lang.startsWith('en-GB')); if (voice) utterance.voice = voice;
    await new Promise<void>(resolve => {
      let settled = false;
      const finish = () => { if (settled) return; settled = true; if (speechUtteranceRef.current === utterance) speechUtteranceRef.current = null; if (speechFinishRef.current === finish) speechFinishRef.current = null; resolve(); };
      speechFinishRef.current = finish; utterance.onend = finish; utterance.onerror = finish; speechSynthesis.speak(utterance); if (speechPausedRef.current) speechSynthesis.pause();
    });
    if (requestId === speechRequestRef.current) { speechPausedRef.current = false; setSpeechPaused(false); setState('idle'); }
  };
  const pauseSpeech = () => { speechPausedRef.current = true; setSpeechPaused(true); if (audioPlayerRef.current) audioPlayerRef.current.pause(); else if (speechUtteranceRef.current) speechSynthesis.pause(); };
  const resumeSpeech = () => { speechPausedRef.current = false; setSpeechPaused(false); if (audioPlayerRef.current) void audioPlayerRef.current.play().catch(err => setError(err instanceof Error ? err.message : 'Audio playback could not resume.')); else if (speechUtteranceRef.current) speechSynthesis.resume(); };
  const stopSpeech = () => {
    speechRequestRef.current++;
    const audio = audioPlayerRef.current; audioPlayerRef.current = null;
    if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio.currentTime = 0; }
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = ''; }
    const finish = speechFinishRef.current; speechFinishRef.current = null; speechSynthesis.cancel(); finish?.(); speechUtteranceRef.current = null;
    speechPausedRef.current = false; setSpeechPaused(false); setState('idle');
  };  const stopMicrophoneCapture = () => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    micStreamRef.current?.getTracks().forEach(track => track.stop()); micStreamRef.current = null;
    void audioContextRef.current?.close(); audioContextRef.current = null; analyserRef.current = null;
  };
  const startMicrophoneCapture = async () => {
    if (!listeningEnabledRef.current || busyRef.current || micStreamRef.current) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('This build cannot capture microphone audio.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!listeningEnabledRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      micStreamRef.current = stream;
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) throw new Error('Audio monitoring is unavailable in this build.');
      const context: AudioContext = new AudioContextClass(); audioContextRef.current = context;
      const analyser = context.createAnalyser(); analyser.fftSize = 2048; analyserRef.current = analyser;
      context.createMediaStreamSource(stream).connect(analyser);
      setListening(true); setState('listening'); setError('');
      const sample = new Float32Array(analyser.fftSize);
      const watchLevel = () => {
        if (!listeningEnabledRef.current || !micStreamRef.current || busyRef.current) return;
        analyser.getFloatTimeDomainData(sample);
        let energy = 0; for (const value of sample) energy += value * value;
        const rms = Math.sqrt(energy / sample.length);
        if (rms > 0.012) {
          lastVoiceAtRef.current = Date.now();
          if (!recordingSpeechRef.current) {
            const mimeType = ['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            recorderRef.current = recorder; audioChunksRef.current = []; recordingSpeechRef.current = true;
            recorder.ondataavailable = event => { if (event.data.size) audioChunksRef.current.push(event.data); };
            recorder.onstop = () => { recordingSpeechRef.current = false; const chunks = audioChunksRef.current; audioChunksRef.current = []; recorderRef.current = null; void handleRecordedSpeech(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })); };
            recorder.start(); setState('listening');
          }
        } else if (recordingSpeechRef.current && Date.now() - lastVoiceAtRef.current > 1100) {
          busyRef.current = true; recorderRef.current?.stop(); setState('listening');
        }
        animationFrameRef.current = requestAnimationFrame(watchLevel);
      };
      animationFrameRef.current = requestAnimationFrame(watchLevel);
    } catch (err) {
      stopMicrophoneCapture(); listeningEnabledRef.current = false; setListening(false); setState('idle');
      const detail = err instanceof Error ? err.message : 'Microphone access failed.';
      setError(detail.includes('denied') || detail.includes('Permission') ? 'Microphone permission is blocked. Check Windows Settings → Privacy & security → Microphone, then enable access for desktop apps.' : detail);
    }
  };
  const handleRecordedSpeech = async (blob: Blob) => {
    stopMicrophoneCapture();
    if (!listeningEnabledRef.current || blob.size < 1500) { busyRef.current = false; if (listeningEnabledRef.current) { setState('listening'); void startMicrophoneCapture(); } return; }
    busyRef.current = true; setState('listening'); setInput('');
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
      const transcript = await window.jarvis.transcribeAudio(btoa(binary), blob.type || 'audio/webm');
      if (!transcript) { setError('I did not catch that. Check your microphone level and try again.'); busyRef.current = false; if (listeningEnabledRef.current) { setState('listening'); void startMicrophoneCapture(); } return; }
      setInput(transcript); busyRef.current = false; await submitRef.current(transcript);
    } catch (err) {
      busyRef.current = false; setError(err instanceof Error ? err.message : 'Voice transcription failed.');
      if (listeningEnabledRef.current) { setState('listening'); void startMicrophoneCapture(); } else setState('idle');
    }
  };
  const startVoice = () => {
    if (state === 'speaking') { stopSpeech(); if (!listeningEnabledRef.current) { listeningEnabledRef.current = true; setListening(true); } setError(''); void startMicrophoneCapture(); return; }
    if (listeningEnabledRef.current) {
      listeningEnabledRef.current = false; stopMicrophoneCapture();
      if (recordingSpeechRef.current) { recorderRef.current?.onstop && (recorderRef.current.onstop = null); recorderRef.current?.stop(); recorderRef.current = null; recordingSpeechRef.current = false; }
      setListening(false); setState('idle'); setInput(''); return;
    }
    listeningEnabledRef.current = true; busyRef.current = false; setError(''); setListening(true); void startMicrophoneCapture();
  };
  const saveCredential = async (name: 'groq'|'fish-audio'|'openai', value: string, clear: (value: string) => void) => { try { await window.jarvis.saveCredential(name, value); const [chatReady, status] = await Promise.all([window.jarvis.hasApiKey(), window.jarvis.getCredentialStatus()]); setKeyReady(chatReady); setGroqReady(status.groq); setFishReady(status.fish); setOpenAIReady(status.openai); clear(''); setError(''); } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save credential.'); } };
  const createSession = () => { if(state==='thinking') return; const time=Date.now(); const session:ConversationSession={id:crypto.randomUUID(),title:'New conversation',createdAt:time,updatedAt:time,messages:[]}; setSessions(prev=>[session,...prev]);setActiveSessionId(session.id);setMessages([]);setError('');setConnection(null);followLatestRef.current=true; };
  const openSession = (session:ConversationSession) => { if(state==='thinking') return;setActiveSessionId(session.id);setMessages(session.messages);setError('');followLatestRef.current=true; };
  const runConnectionCheck = async () => { setCheckingConnection(true);setConnection(null);try{setConnection(await window.jarvis.checkConnection());}catch(err){setConnection({ok:false,provider:'Unknown',model:'—',source:'—',message:err instanceof Error?err.message:'Connection check failed.'});}finally{setCheckingConnection(false);} };
  const connectGmail = async () => { setGmailBusy(true); setError(''); try { await window.jarvis.connectGmail(gmailClientId, gmailClientSecret); const status = await window.jarvis.gmailStatus(); setGmailConnected(status.connected); setCalendarReady(status.calendarReady); setContactsReady(status.contactsReady); setGmailClientSecret(''); } catch (err) { setError(err instanceof Error ? err.message : 'Google account connection failed.'); } finally { setGmailBusy(false); } };
  const saveSchoolProfile = async () => { try { await window.jarvis.saveSchoolProfile(schoolProfile); setSchoolProfileSaved(true); window.setTimeout(() => setSchoolProfileSaved(false), 2500); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save school details.'); } };
  const saveSmsConfiguration = async () => { try { const result = await window.jarvis.saveSmsConfig({ accountSid: twilioSid, authToken: twilioToken, from: twilioFrom, to: twilioTo }); setSmsConfigured(result.configured); setTwilioToken(''); setTwilioAuthTokenSet(Boolean(result.configured)); setSmsSaved(true); window.setTimeout(() => setSmsSaved(false), 2500); setError(''); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save SMS settings.'); } };
  const disconnectGmail = async () => { await window.jarvis.disconnectGmail(); setGmailConnected(false); setCalendarReady(false); setContactsReady(false); setPendingEmail(null); };
  const visibleSessions = [...sessions].sort((a,b)=>b.updatedAt-a.updatedAt).filter(session=>{const term=sessionSearch.trim().toLowerCase();return !term||session.title.toLowerCase().includes(term)||session.messages.some(message=>message.content.toLowerCase().includes(term));});

  return <main className="app-shell">
    <div className="ambient-grid" /><div className="scanline" />
    <header className="topbar"><div className="brand"><div className="brand-mark"><span>J</span></div><div><div className="brand-name">STARK <b>INDUSTRIES</b></div><div className="brand-sub">ARTIFICIAL INTELLIGENCE SYSTEMS</div></div></div><div className="system-center"><span className="live-dot"/> J.A.R.V.I.S. <span className="system-center-dash">/</span> PERSONAL ASSISTANT <span className="version">SYS v.4.2.09</span></div><WindowControls /></header>
    <section className="workspace">
      <aside className="side-rail left-rail"><div className="panel-label">LOCAL TIME</div><div className="clock-digits">{now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',hour12:false})}<span className="clock-seconds">:{String(now.getSeconds()).padStart(2,'0')}</span></div><div className="date-line">{now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}).toUpperCase()}</div><div className="rail-rule"/><div className="panel-label">SYSTEM LOAD</div><Metric label="CPU" value={cpu} /><Metric label="MEMORY" value={memory} /><div className="rail-rule"/><div className="panel-label">SECURITY</div><div className="status-line"><ShieldCheck size={14}/><span>LOCAL ENCRYPTION</span><i>ACTIVE</i></div><div className="status-line"><Activity size={14}/><span>NETWORK LINK</span><i className={keyReady?'':'muted'}>{keyReady?'READY':'STANDBY'}</i></div><div className="side-footer">NODE 01 <span>•</span> PRIVATE SESSION</div></aside>
      <section className="center-stage">
        <div className="stage-topline"><span>HOLOGRAPHIC INTERFACE</span><span>SECURE CHANNEL <b>ENABLED</b></span></div>
        <div className="reactor-wrap"><Reactor state={state}/><div className="reactor-label"><span className={`state-dot ${state}`}/>{state==='idle'?'SYSTEM STANDBY':state==='thinking'?'PROCESSING REQUEST':state==='listening'?'VOICE INPUT ACTIVE':'RESPONSE IN PROGRESS'}</div></div>
        <div className="response-area"><div className="response-overline-row"><div className="response-overline">{messages.some(m=>m.role==='assistant')?'LATEST RESPONSE':'ONLINE · AWAITING INPUT'}</div>{state==='speaking'&&<div className="speech-controls"><button className="speech-control" onClick={speechPaused?resumeSpeech:pauseSpeech} aria-label={speechPaused?'Resume JARVIS speaking':'Pause JARVIS speaking'} aria-pressed={speechPaused} title={speechPaused?'Resume':'Pause'}>{speechPaused?<Play size={13}/>:<Pause size={13}/>}</button><button className="speech-control" onClick={stopSpeech} aria-label="Stop JARVIS speaking" title="Stop"><Square size={12}/></button></div>}</div><div className="response-text">{messages.filter(m=>m.role==='assistant').at(-1)?.content || (keyReady?'All systems are operational. How may I assist?':'Interface online. Add an API key to establish a secure link.')}{state==='thinking'&&<span className="typing-cursor"/>}</div></div>
        <div className="conversation" ref={logRef} onScroll={e=>{const el=e.currentTarget;followLatestRef.current=el.scrollHeight-el.scrollTop-el.clientHeight<36;}}>{messages.map(m=><div key={m.id} className={`message ${m.role}`}><time>{new Date(m.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false})}</time><span className="message-name">{m.role==='user'?'OPERATOR':'JARVIS'}</span><p>{m.content}{m.id==='streaming'&&<span className="typing-cursor"/>}</p></div>)}</div>
        {error&&<div className="error-banner"><span>{error}</span><button onClick={()=>setError('')} aria-label="Dismiss"><X size={14}/></button></div>}
        {pendingEmail&&<section className="email-confirmation" aria-label="Email awaiting your reply"><div className="email-confirm-head"><span>EMAIL DRAFT · NOT SENT</span><MailIcon/></div><div><b>TO</b><span>{pendingEmail.to}</span></div><div><b>SUBJECT</b><span>{pendingEmail.subject}</span></div><p>{pendingEmail.body}</p><div className="email-chat-hint">Review the draft in the conversation, then reply <b>YES</b> to send or <b>NO</b> to cancel.</div></section>}
        {!messages.length&&<div className="suggestions">{suggestions.map(s=><button key={s} onClick={()=>void submit(s)}>{s}<span>↗</span></button>)}</div>}
        <div className="composer"><span className="prompt-mark">›</span><input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') void submit();}} placeholder={!historyReady?'RESTORING LOCAL HISTORY…':listening?'Hands-free active — speak, then pause':'Enter a command or ask a question'} disabled={!historyReady||state==='thinking'} /><button className={`icon-action ${voiceOn?'active':''}`} title={voiceOn?'Disable voice responses':'Enable voice responses'} onClick={()=>setVoiceOn(v=>!v)}>{voiceOn?<AudioLines size={17}/>:<VolumeX size={17}/>}</button><button className={`icon-action ${listening?'active':''}`} title={listening?'Turn off hands-free microphone':'Start hands-free microphone'} aria-label={listening?'Turn off hands-free microphone':'Start hands-free microphone'} aria-pressed={listening} onClick={startVoice}><Mic size={17}/></button><button className="send-button" onClick={()=>void submit()} disabled={!historyReady||!input.trim()||state==='thinking'}><Send size={15}/><span>SEND</span></button></div>
        <div className="composer-hint"><span>{!historyReady?'LOADING CONVERSATIONS':listening?'MIC ON · SPEAK NATURALLY':'↵ TO SEND'}</span><span><kbd>⌘</kbd> + <kbd>K</kbd> NEW SESSION</span></div>
      </section>
      <aside className="side-rail right-rail"><div className="rail-head"><div className="panel-label">CONVERSATIONS</div><button onClick={createSession} title="New session" disabled={state==='thinking'}><Plus size={15}/></button></div><div className="session-card"><div className="session-icon"><Command size={15}/></div><div className="session-card-copy"><strong>{sessions.find(session=>session.id===activeSessionId)?.title || 'New conversation'}</strong><span>{messages.length} messages</span></div><ChevronDown size={13} className="chevron"/></div><input className="session-search" value={sessionSearch} onChange={e=>setSessionSearch(e.target.value)} placeholder="Search conversations" aria-label="Search conversations"/><div className="history-list">{visibleSessions.map(session=><button key={session.id} className={`history-item ${session.id===activeSessionId?'selected':''}`} onClick={()=>openSession(session)} disabled={state==='thinking'}><strong>{session.title}</strong><span>{session.messages.length} messages · {new Date(session.updatedAt).toLocaleDateString([], {month:'short',day:'numeric'})}</span></button>)}{!visibleSessions.length&&<div className="no-sessions">No matching conversations</div>}</div><button className="settings-button" onClick={()=>setActionsOpen(true)} style={{ marginTop: 9 }}><Activity size={15}/> OPEN WORKBENCH <span>↗</span></button><div className="rail-rule"/><div className="panel-label">CAPABILITIES</div><div className="capability"><span className="cap-dot"/>GROQ CONVERSATION <em>{keyReady?'READY':'SET KEY'}</em></div><div className="capability"><span className="cap-dot"/>FISH AUDIO <em>{fishReady?'READY':'SET KEY'}</em></div><div className="capability"><span className="cap-dot"/>INVITATION IMAGES <em>{openAIReady?'READY':'SET KEY'}</em></div><div className="capability"><span className="cap-dot"/>LOCAL HISTORY</div><div className="right-spacer"/><button className="settings-button" onClick={()=>setSettingsOpen(true)}><Settings2 size={15}/> CONFIGURATION <span>↗</span></button><div className="build-label">STARK OS <span>•</span> BUILD 2025.04</div></aside>
    </section>
    {actionsOpen&&<ActionCenter onClose={()=>setActionsOpen(false)}/>}
    {settingsOpen&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSettingsOpen(false);}}><div className="settings-modal"><div className="modal-header"><div><span className="panel-label">SYSTEM CONFIGURATION</span><h2>Connection settings</h2></div><button onClick={()=>setSettingsOpen(false)}><X size={18}/></button></div><p className="modal-copy">Add your API credentials here. JARVIS encrypts them on this device and keeps them in Electron's main process. Invitation images require the OpenAI key and Gmail connection; OpenAI may charge for image generation.</p><Credential label="GROQ_API_KEY" ready={groqReady} value={draftGroq} onChange={setDraftGroq} onSave={()=>void saveCredential('groq',draftGroq,setDraftGroq)} placeholder="gsk_…" saveLabel="SAVE GROQ KEY" removeLabel="REMOVE GROQ KEY"/><Credential label="FISH_AUDIO_API_KEY" ready={fishReady} value={draftFish} onChange={setDraftFish} onSave={()=>void saveCredential('fish-audio',draftFish,setDraftFish)} placeholder="Fish Audio API key" saveLabel="SAVE FISH KEY" removeLabel="REMOVE FISH KEY"/><div className="modal-note"><ShieldCheck size={14}/> Fish Audio voice ID: 612b878b113047d9a770c069c8b4fdfe</div><Credential label="OPENAI API KEY · CHAT FALLBACK + INVITATION IMAGES" ready={openAIReady} value={draftOpenAI} onChange={setDraftOpenAI} onSave={()=>void saveCredential('openai',draftOpenAI,setDraftOpenAI)} placeholder="sk-…" saveLabel="SAVE OPENAI KEY" removeLabel="REMOVE OPENAI KEY"/><section className="school-profile-settings"><div className="field-label">PALMS + YOUR SCHOOL SCHEDULE</div><p className="modal-copy">JARVIS checks Palms bell schedules and its public calendar live for school-planning questions. Add your own classes, regular activities, homework blocks, or other commitments below so he can compare them. Saved encrypted on this device; the profile and relevant Calendar event titles/times go to your configured AI provider only for school or planning questions.</p><textarea className="school-profile-textarea" value={schoolProfile} onChange={e=>{setSchoolProfile(e.target.value);setSchoolProfileSaved(false);}} rows={5} maxLength={5000} placeholder="Example: Grade 7. My classes are Mon–Fri. Robotics club Tuesdays until 4 PM. I usually need 90 minutes for homework. No activities on Fridays."/><button className="credential-save" onClick={()=>void saveSchoolProfile()}>{schoolProfileSaved?'SAVED LOCALLY':'SAVE SCHOOL DETAILS'}</button><div className="school-source-links"><a href="https://palmsms.lausd.org/apps/bell_schedules/" target="_blank" rel="noreferrer">Palms bell schedules ↗</a><a href="https://palmsms.lausd.org/apps/events/" target="_blank" rel="noreferrer">Palms school calendar ↗</a></div></section><section className="gmail-connection"><div className="field-label">GOOGLE ACCOUNT ACCESS</div><div className="google-scope-status"><span>GMAIL SEND <b className={gmailConnected?'credential-ready':'credential-missing'}>{gmailConnected?'CONNECTED':'NOT CONNECTED'}</b></span><span>CALENDAR EDIT ACCESS <b className={calendarReady?'credential-ready':'credential-missing'}>{calendarReady?'CONNECTED':'PERMISSION NEEDED'}</b></span><span>CONTACTS READ-ONLY <b className={contactsReady?'credential-ready':'credential-missing'}>{contactsReady?'CONNECTED':'PERMISSION NEEDED'}</b></span></div><p className="modal-copy">Connect Google to send emails you explicitly request, prepare separate drafts for review, read and edit Calendar events when you ask, and find email addresses in your Google Contacts. Contacts access is read-only.</p>{(!gmailConnected||!calendarReady||!contactsReady)&&<><input value={gmailClientId} onChange={e=>setGmailClientId(e.target.value)} placeholder="Google OAuth Desktop client ID" autoComplete="off"/><input type="password" value={gmailClientSecret} onChange={e=>setGmailClientSecret(e.target.value)} placeholder="OAuth client secret (blank uses saved secret)" autoComplete="new-password"/><button className="credential-save" onClick={()=>void connectGmail()} disabled={gmailBusy||!gmailClientId.trim()}>{gmailBusy?'WAITING FOR GOOGLE…':gmailConnected?(calendarReady?'GRANT CONTACTS READ ACCESS':'GRANT GOOGLE ACCESS'):'CONNECT GOOGLE ACCOUNT'}</button></>}{gmailConnected&&calendarReady&&contactsReady&&<button className="credential-save" onClick={()=>void disconnectGmail()}>DISCONNECT GOOGLE ACCOUNT</button>}<div className="modal-note"><ShieldCheck size={13}/> OAuth tokens and client secret are encrypted on this device. Google credentials stay encrypted on this device. Contact names and addresses are only used to resolve email recipients; they are not sent to your AI provider.</div><div className="school-source-links"><a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">Enable Google Calendar API ↗</a><a href="https://developers.google.com/workspace/calendar/api/auth" target="_blank" rel="noreferrer">Calendar edit permission details ↗</a><a href="https://console.cloud.google.com/apis/library/people.googleapis.com" target="_blank" rel="noreferrer">Enable Google People API ↗</a><a href="https://developers.google.com/people/api/rest/v1/people.connections/list" target="_blank" rel="noreferrer">Contacts permission details ↗</a></div></section><section className="gmail-connection sms-configuration"><div className="field-label">TEXT MESSAGES · TWILIO <b className={smsConfigured?'credential-ready':'credential-missing'}>{smsConfigured?'CONFIGURED':'NOT SET'}</b></div><p className="modal-copy">Configure an SMS-enabled Twilio number and your phone number in international format (for example, +14155550123). JARVIS will text only your saved number, and only when you ask. Twilio charges for its number and messages; have a parent or guardian manage the account and billing.</p><input value={twilioSid} onChange={e=>setTwilioSid(e.target.value)} placeholder="Twilio Account SID (AC…)" autoComplete="off"/><input type="password" value={twilioToken} onChange={e=>setTwilioToken(e.target.value)} placeholder={twilioAuthTokenSet?'Auth Token saved securely · blank keeps current token':'Twilio Auth Token'} autoComplete="new-password"/><input value={twilioFrom} onChange={e=>setTwilioFrom(e.target.value)} placeholder="Twilio SMS number · +1…" autoComplete="off"/><input value={twilioTo} onChange={e=>setTwilioTo(e.target.value)} placeholder="Your phone number · +1…" autoComplete="off"/><button className="credential-save" onClick={()=>void saveSmsConfiguration()}>{smsSaved?'SAVED SECURELY':'SAVE SMS SETTINGS'}</button><div className="modal-note"><ShieldCheck size={13}/> The account token and phone numbers are encrypted in JARVIS on this PC. Never paste your Auth Token into chat.</div></section><div className="connection-check"><button className="credential-save" onClick={()=>void runConnectionCheck()} disabled={checkingConnection}>{checkingConnection?'CHECKING…':'TEST PROVIDER CONNECTION'}</button>{connection&&<div className={`connection-result ${connection.ok?'success':'failure'}`}><strong>{connection.ok?'CONNECTED':'CHECK FAILED'} · {connection.provider}</strong><span>{connection.model} · {connection.source}</span><p>{connection.message}</p></div>}</div><div className="modal-actions"><button className="cancel-btn" onClick={()=>setSettingsOpen(false)}>CLOSE</button></div></div></div>}
  </main>;
}
function Metric({label,value}:{label:string;value:number}) { return <div className="metric"><div><span>{label}</span><b>{value}<small>%</small></b></div><div className="meter"><i style={{width:`${value}%`}}/></div></div>; }
function MailIcon() { return <span aria-hidden="true">✉</span>; }
function Credential({label,ready,value,onChange,onSave,placeholder,saveLabel,removeLabel}:{label:string;ready:boolean;value:string;onChange:(value:string)=>void;onSave:()=>void;placeholder:string;saveLabel:string;removeLabel:string}) { return <div className="credential-field"><label className="field-label">{label} <span className={ready?'credential-ready':'credential-missing'}>{ready?'CONNECTED':'NOT SET'}</span></label><input type="password" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} autoComplete="off"/><div className="credential-actions"><span className="modal-note"><ShieldCheck size={13}/> Encrypted on this device</span><button className="credential-save" onClick={onSave}>{value?saveLabel:removeLabel}</button></div></div>; }
