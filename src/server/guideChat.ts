import type {
  AppPageId,
  GuideChatContext,
  GuideChatResponse,
} from '../types/medguard.ts';

export const VALID_GUIDE_PAGES: AppPageId[] = [
  'home',
  'scan',
  'remediation',
  'test-cases',
  'cell',
  'mechanism',
  'facility',
  'pharmacist',
];

export const FEATURE_REQUIREMENTS_KNOWLEDGE = `
MEDGUARD APPLICATION FEATURES & EXACT USER REQUIREMENTS:

1. Scan Here (pageId: "scan")
   - Purpose: Upload a prescription or tablet strip, extract medicines automatically, validate dosages and pediatric safety against MedGuard's backend RAG knowledge base (CDSCO, IAP, WHO formulary), check disease/age/weight match, screen for pack recalls, and get spoken explanations in English, Tamil, or Hindi.
   - Required inputs from user:
     a) Prescription source: upload an image (PNG/JPG/WEBP), PDF (.pdf), Word document (.docx), or text/CSV/Markdown/HTML/RTF/XML file, OR paste/type prescription lines manually, OR pick a quick preset.
     b) Patient Context: Diagnosed Disease/Condition (e.g., "Viral Fever", "Type 2 Diabetes", "Acute Otitis Media") and Patient Age in years (supports decimal infant ages like 0.5 for 6 months).
     c) Child Weight in kg: Strongly recommended/required whenever checking pediatric patients or weight-dependent medicines (e.g., Paracetamol, Ibuprofen, Amoxicillin, Azithromycin, Cetirizine) so the backend RAG validation returns exact mg/kg/dose and mg/kg/day warnings in the result section.
     d) User Confirmation checkbox before final clinical audit.

1b. To-Do Next Plan (pageId: "remediation")
   - Purpose: Dedicated page opened from the "To-Do Next Plan" button in Scan Here results. Generates a step-by-step To-Do remediation checklist, next safety measures/labs to undergo, and authoritative clinical sources (FDA DailyMed, WHO, ADA, NICE, CDSCO, IAP, NIH MedlinePlus) at the end of the plan based on whether the dosage or medicine matched the given condition.
   - Required inputs from user: Complete a prescription scan in Scan Here first, then click "To-Do Next Plan".

2. Test Cases (pageId: "test-cases")
   - Purpose: One-click curated clinical scenarios to see MedGuard's verification and backend RAG validation engine in action without uploading your own document.
   - Includes: Safe standard adult prescription, CYP3A4 clash (Clarithromycin + Simvastatin), Paracetamol daily overdose, CDSCO banned FDC alert, Pediatric Amoxicillin weight check (6y, 16kg), and Pediatric Nimesulide <12 yrs contraindication.
   - Required inputs from user: None — pick any card to load into Scan Here and verify automatically.

3. Cell Structure 3D (pageId: "cell")
   - Purpose: Interactive Three.js 3D eukaryotic cell cutaway atlas showing which organelles (Smooth ER, Plasma Membrane Ion Channels, Mitochondria, Cytosol) medicines target.
   - Required inputs from user: WebGL-enabled browser. Running a scan first highlights the active prescription's target organelles automatically.

5. AlphaFold 3D (pageId: "mechanism")
   - Purpose: 3D molecular pocket visualizer for CYP3A4 (UniProt P08684 / PDB 1TQN), CYP2D6, hERG, P-gp, AMPK, and COX-2 showing substrate vs inhibitor clash geometry plus direct validation links to Mol* AlphaFold DB, RCSB PDB, and NIH DailyMed FDA drug labels.
   - Required inputs from user: Select any target protein (or jump directly from a Scan Here or Pediatric RAG DB finding).

6. Facility Watchlist (pageId: "facility")
   - Purpose: Clinic and pharmacy inventory batch traceback — manage held medicine stock batches and run reverse-match sweeps against incoming CDSCO, WHO, and FDA safety alerts/recalls.
   - Required inputs from user: For custom stock items, enter Product Name, Active Ingredients, Batch Number, Manufacturer, Quantity, and Shelf Location (pre-loaded demo stock is already ready for instant reverse-match sweeps).

7. Pharmacist Queue (pageId: "pharmacist")
   - Purpose: Clinical governance triage workspace for pharmacists to review unverified predicted protein-drug structural hypotheses and either Escalate for Clinical Check or Dismiss.
   - Required inputs from user: Pharmacist/clinical reviewer judgment; click Escalate or Dismiss with optional reviewer name.

8. Personalization & Account Features
   - Sign in (Google or Email) to save verified prescription checks in your Firestore history and persist your preferred language (English / Tamil / Hindi).
   - Auto-Voice summary readout and Tamil/Hindi plain-language translation available in Scan Here and the Home banner.
`;

export function buildGuideSystemInstruction(context: GuideChatContext): string {
  const langLabel =
    context.language === 'ta'
      ? 'Tamil (தமிழ்)'
      : context.language === 'hi'
        ? 'Hindi (हिन्दी)'
        : 'English';

  const personaLabel =
    context.persona === 'pediatric'
      ? 'Parent / Caregiver checking a child/pediatric medicine dose'
      : context.persona === 'pharmacist'
        ? 'Pharmacist / Clinic operator auditing batches, recalls, or clinical escalations'
        : context.persona === 'explorer'
          ? 'Student / Researcher exploring 3D cellular organelles and AlphaFold protein pockets'
          : 'Patient / Family caregiver verifying a prescription';

  const userDetails = context.isSignedIn
    ? `Signed-in user: ${context.userName || 'MedGuard Member'} (${context.savedChecksCount ?? 0} saved prescription checks${
        context.recentSavedSummary ? `; most recent: ${context.recentSavedSummary}` : ''
      }).`
    : 'Guest session (not signed in; remind gently only if they ask about saving history).';

  const reportDetails = context.latestReport
    ? `Latest active verification report in this session: verdict=${context.latestReport.overallVerdict}, condition="${context.latestReport.patientCondition}", age=${context.latestReport.patientAge}, primaryMechanism=${context.latestReport.primaryMechanismId}, packAlerts=${context.latestReport.packAlerts}, dosageIssues=${context.latestReport.dosageIssues}, regimenFlags=${context.latestReport.regimenFlags}, ragFlags=${context.latestReport.ragFlags}.`
    : 'No prescription verified yet in this session.';

  return `You are "MedGuard Guide", a warm, concise, personalized interactive concierge inside the MedGuard web application.
Your job is to guide the user around the application, recommend the exact MedGuard feature(s) that match their goal, clearly list the exact inputs/requirements needed before using that feature, and tailor advice to their current session state.

CURRENT PERSONALIZED USER CONTEXT:
- ${userDetails}
- Preferred UI language: ${langLabel} (respond naturally in ${langLabel}; keep MedGuard feature names like "Scan Here" or "Pediatric RAG DB" clear).
- Current page user is viewing: "${context.activePage}"
- User's stated focus/role: ${personaLabel}
- ${reportDetails}

${FEATURE_REQUIREMENTS_KNOWLEDGE}

RESPONSE FORMAT & CLINICAL BOUNDARIES:
- Return JSON matching the schema:
  - "reply": clear, helpful, well-structured answer (max ~150 words; use short bullet lines when listing requirements or steps; personalize using their name/role/current page/active report when relevant).
  - "suggestedPages": 1 to 3 relevant pageIds from [${VALID_GUIDE_PAGES.join(', ')}] that the user can click to jump straight there.
  - "suggestedQuestions": 2 to 3 short, natural follow-up questions tailored to what the user might ask next.
- Never fabricate clinical diagnoses or override MedGuard's deterministic verifier; direct prescription safety checks to "Scan Here" or "Pediatric RAG DB".`;
}

export function buildFallbackGuideReply(
  userMessage: string,
  context: GuideChatContext
): GuideChatResponse {
  const q = userMessage.toLowerCase();
  const greetingPrefix = context.userName ? `${context.userName}, ` : '';

  if (/child|pediatric|baby|infant|kid|weight|kg|amoxicillin|paracetamol|ibuprofen|nimesulide/.test(q)) {
    return {
      reply: `${greetingPrefix}for checking children's medicines, use **Scan Here** (or pick a pediatric scenario in **Test Cases**):\n\n• **What you need**: Child's exact age (supports decimals like \`0.5\` for 6 months), child's weight in \`kg\` (required for weight-based mg/kg checks), and the medicine name or uploaded prescription.\n• **What happens on scan**: MedGuard automatically validates the prescription against the backend Pediatric RAG database (CDSCO/IAP/WHO) and displays weight-calculated dose ranges, contraindications, and recommended actions in the result section.`,
      suggestedPages: ['scan', 'test-cases'],
      suggestedQuestions: [
        'How do I enter an infant under 1 year?',
        'What file formats can I upload in Scan Here?',
        'Run a sample pediatric check in Test Cases',
      ],
      source: 'guide-fallback',
    };
  }

  if (/batch|recall|stock|facility|pharmacist|queue|inventory|clinic/.test(q)) {
    return {
      reply: `${greetingPrefix}for pharmacy inventory and clinical governance workflows:\n\n• **Facility Watchlist**: Check held batches against CDSCO, WHO, and FDA recalls. *Requirements*: Product name, active ingredient, batch number, manufacturer, and shelf location (or sweep pre-loaded stock immediately).\n• **Pharmacist Queue**: Review and escalate or dismiss predicted protein-interaction hypotheses.`,
      suggestedPages: ['facility', 'pharmacist'],
      suggestedQuestions: [
        'How does batch reverse-matching work?',
        'Show me the Pharmacist Queue requirements',
      ],
      source: 'guide-fallback',
    };
  }

  if (/3d|cell|alphafold|protein|cyp|pdb|mechanism|organelle|dailymed|molstar/.test(q)) {
    return {
      reply: `${greetingPrefix}you can explore drug mechanisms visually in two 3D workspaces:\n\n• **Cell Structure 3D**: Shows where medicines act inside the ER, mitochondria, and membrane ion channels.\n• **AlphaFold 3D**: Inspects protein pockets (like CYP3A4 P08684 / PDB 1TQN) with inhibitor clash distances and NIH DailyMed / RCSB PDB citations.\n• *Requirement*: A WebGL browser—or run **Scan Here** first to highlight your prescription's exact protein target automatically.`,
      suggestedPages: ['mechanism', 'cell', 'scan'],
      suggestedQuestions: [
        'Explain why CYP3A4 causes drug clashes',
        'How do I highlight my own prescription in 3D?',
      ],
      source: 'guide-fallback',
    };
  }

  if (/upload|pdf|docx|photo|image|scan|document|prescrip|verify|how|start|begin|requir/.test(q)) {
    return {
      reply: `${greetingPrefix}to verify a prescription in **Scan Here**, prepare:\n\n1. **Document or Photo**: PNG/JPG photo, digital PDF, Word (\`.docx\`), or text file (\`.txt\`, \`.csv\`, \`.md\`)—or paste prescription lines directly.\n2. **Patient Details**: Diagnosed condition, patient age (years), and child weight (\`kg\`) if pediatric.\n3. **Scan & Verify**: Confirm extracted medicines to run backend RAG dosage validation, pack recall screening, and Tamil/Hindi voice readout.`,
      suggestedPages: ['scan', 'test-cases'],
      suggestedQuestions: [
        'What file formats can I upload?',
        'Can I try a demo without uploading a file?',
        'How do I get voice explanation in Tamil or Hindi?',
      ],
      source: 'guide-fallback',
    };
  }

  if (context.latestReport) {
    return {
      reply: `${greetingPrefix}based on your active **${context.latestReport.overallVerdict}** report (${context.latestReport.patientCondition}, age ${context.latestReport.patientAge}), I recommend:\n\n• Open **AlphaFold 3D** to inspect the primary target **${context.latestReport.primaryMechanismId}** inside the cell.\n• Open **Cell Structure 3D** to see which organelle is affected, or return to **Scan Here** to adjust doses or weight.`,
      suggestedPages: ['mechanism', 'cell', 'scan'],
      suggestedQuestions: [
        `Why was ${context.latestReport.primaryMechanismId} highlighted?`,
        'What should I check next for this prescription?',
      ],
      source: 'guide-fallback',
    };
  }

  return {
    reply: `${greetingPrefix}welcome to MedGuard! Here is the fastest path based on what you want to do:\n\n• **Check a real prescription or child dose**: Open **Scan Here** (needs a photo/PDF/DOCX/text file + condition, age, and weight in kg for pediatrics).\n• **Try instant examples**: Open **Test Cases** (no upload required).\n• **Explore drug science**: Open **Cell 3D** or **AlphaFold 3D**.`,
    suggestedPages: ['scan', 'test-cases', 'mechanism'],
    suggestedQuestions: [
      'What do I need to upload in Scan Here?',
      'How do I check a child’s dosage safely?',
      'How do pharmacists use Facility Watchlist?',
    ],
    source: 'guide-fallback',
  };
}
