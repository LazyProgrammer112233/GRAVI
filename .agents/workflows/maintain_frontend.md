---
description: How to maintain and deploy GRAVI Vision Engine
---
# GRAVI Maintenance Workflow

## 1. Updating the Frontend Application
To modify the React UI or add new pages:
1. Locate the React components inside `/src/pages/`.
2. Ensure you reuse the UI library tools (Lucide icons, Glassmorphism CSS).
3. If connecting to a new Google Gemini endpoint or vision model, update `/src/lib/inference.js` securely.
4. Test changes locally by starting development server.
```bash
npm run dev
```

// turbo
5. Deploy changes to your Vercel project by committing via Git.
```bash
npm run build
git add .
git commit -m "feat: new dashboard"
git push
```

## 2. API Key Architecture
The project runs entirely on **Bring-Your-Own-Key (BYOK)**.
- **Gemini API Key**: stored locally in `gravi_gemini_key`.
- This ensures zero active server billing.
- You must always query localStorage on `UploadPage.jsx` and pass it contextually to `fetch()`.

## 3. Storage
If you need to save history:
- Database architecture uses Supabase JSON. 
- Look across `src/lib/supabase.js`.
