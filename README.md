# JARVIS Desktop

A Windows desktop AI assistant built with Electron, React, TypeScript, Vite, and Tailwind CSS. JARVIS supports streaming chat, optional voice input and speech, persistent local conversations, Google Calendar actions, Gmail and Contacts integration, invitation images, Blender model creation, OpenSCAD source generation, Bambu Studio handoff, and LotusLamp Bluetooth controls.

## Run locally

1. Install Node.js 20 or newer.
2. In this folder, run `npm install`.
3. Run `npm run dev` to start JARVIS.
4. Open **Configuration** and add provider credentials.

You can enter API keys in Configuration; Electron encrypts them with `safeStorage` and keeps them in the main process. Alternatively, copy `.env.example` to `.env` and add `GROQ_API_KEY` and `FISH_AUDIO_API_KEY`. Never commit `.env` or share API keys. Groq powers chat and Whisper transcription. Fish Audio powers spoken responses. An optional OpenAI API key enables invitation image generation and chat fallback; provider usage may incur charges.

`Run JARVIS.bat` builds and starts the app after dependencies are installed. `npm run build` creates production bundles, and `npm start` launches the built app.

## Google integrations

In Google Cloud, enable the Gmail API, Google Calendar API, and People API. Create a Desktop OAuth client, configure the OAuth consent screen, and add your account as a test user if the app is in testing mode. Connect Google in JARVIS Configuration using the Desktop client ID and secret. JARVIS requests Gmail send, Calendar event, Contacts read-only, OpenID, and email scopes. Calendar events can be created, edited, or deleted when explicitly requested. Invitation cards are sent to the connected Google account for review.

## Voice

JARVIS uses Electron's microphone permission for hands-free input and Groq Whisper for transcription. Fish Audio provides spoken replies; system speech synthesis is used as a fallback. If Windows asks, select the microphone and allow access for desktop apps in Windows Privacy settings.

## Workbench

- **Blender:** JARVIS creates an editable `.blend` project from validated basic geometry and opens it in Blender. Review dimensions and geometry; models are not automatically prepared for 3D printing.
- **OpenSCAD:** JARVIS generates parametric source files under its local app data. OpenSCAD must render and export a printable mesh.
- **Bambu Studio:** JARVIS opens a selected model for review and slicing. It does not start a physical print.
- **LotusLamp X:** Install Python 3.10 or newer, then run `Install LotusLamp support.bat`. This installs the Bluetooth helper dependencies locally. Keep the light nearby and disconnect the LotusLamp phone app before issuing a command.

## Privacy

Conversation history, generated files, Google tokens, and saved credentials are stored locally in the app's user data folder. Google event details are sent to the configured chat provider only when relevant to a calendar or planning question. `.env`, generated output, dependency folders, local history, and credentials are excluded by `.gitignore`.
