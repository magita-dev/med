import type {
  DrugAllergyId,
  FatalRiskFactorId,
  LanguageCode,
  MechanismTargetId,
  PatientHealthQuiz,
  SurgicalHistoryStatus,
} from '../types/medguard.ts';

export const EMPTY_PATIENT_HEALTH_QUIZ: PatientHealthQuiz = {
  decision: 'pending',
  completed: false,
  surgeryStatus: 'none',
  surgeryDetails: '',
  allergies: [],
  customAllergies: '',
  fatalRiskFactors: [],
  currentMedicationsNote: '',
  additionalHistoryNote: '',
};

export interface AllergyOptionMeta {
  id: DrugAllergyId;
  label: Record<LanguageCode, string>;
  fatalWarningHint: Record<LanguageCode, string>;
  matchedIngredients: string[];
  mechanismTargetId?: MechanismTargetId;
  source: string;
}

export const DRUG_ALLERGY_OPTIONS: AllergyOptionMeta[] = [
  {
    id: 'penicillin_beta_lactam',
    label: {
      en: 'Penicillin / Amoxicillin / Beta-Lactam Allergy',
      ta: 'பெனிசிலின் / அமோக்ஸிசிலின் ஒவ்வாமை',
      hi: 'पेनिसिलिन / एमोक्सिसिलिन एलर्जी',
    },
    fatalWarningHint: {
      en: 'Severe IgE anaphylaxis, airway swelling & shock risk with Amoxicillin / Augmentin.',
      ta: 'அமோக்ஸிசிலின் போன்ற மருந்துகளால் உயிருக்கு ஆபத்தான மூச்சுத்திணறல் (Anaphylaxis) அபாயம்.',
      hi: 'एमोक्सिसिलिन से जानलेवा एनाफिलेक्सिस और सांस रुकने का खतरा।',
    },
    matchedIngredients: ['amoxicillin', 'ampicillin', 'clavulan', 'penicillin', 'augmentin', 'mox'],
    source: 'FDA DailyMed Amoxicillin Boxed Hypersensitivity Warning / WHO Formulary',
  },
  {
    id: 'nsaid_aspirin',
    label: {
      en: 'NSAID / Aspirin / Painkiller Allergy (Ibuprofen, Diclofenac)',
      ta: 'வலி நிவாரணி (NSAID / ஆஸ்பிரின் / இபுப்ரோஃபன்) ஒவ்வாமை',
      hi: 'NSAID / एस्पिरिन / इबुप्रोफेन दर्द निवारक एलर्जी',
    },
    fatalWarningHint: {
      en: 'Triggers fatal bronchospasm, angioedema, or anaphylactoid collapse via COX pathway.',
      ta: 'வலி நிவாரணிகளால் கடுமையான மூச்சுக்குழாய் சுருக்கம் மற்றும் முகம்/தொண்டை வீக்கம் ஏற்படும்.',
      hi: 'दर्द निवारक दवाओं से घातक ब्रोंकोस्पैज़्म या गंभीर एलर्जिक शॉक का खतरा।',
    },
    matchedIngredients: ['ibuprofen', 'diclofenac', 'nimesulide', 'etodolac', 'aspirin', 'naproxen', 'ketorolac', 'aceclofenac'],
    mechanismTargetId: 'COX2',
    source: 'FDA NSAID Hypersensitivity Guidance / NICE',
  },
  {
    id: 'macrolide',
    label: {
      en: 'Macrolide Antibiotic Allergy (Azithromycin / Clarithromycin)',
      ta: 'மேக்ரோலைடு நுண்ணுயிர் எதிர்ப்பி (அசித்ரோமைசின் / கிளாரித்ரோமைசின்) ஒவ்வாமை',
      hi: 'मैक्रोलाइड एंटीबायोटिक (एज़िथ्रोमाइसिन / क्लैरिथ्रोमाइसिन) एलर्जी',
    },
    fatalWarningHint: {
      en: 'Recurrent hypersensitivity, Stevens-Johnson reaction, or CYP3A4 / QT toxicity.',
      ta: 'கடுமையான தோல் எதிர்வினை மற்றும் இதய துடிப்பு பாதிப்பு அபாயம்.',
      hi: 'गंभीर त्वचा प्रतिक्रिया, लिवर और हृदय विषाक्तता का खतरा।',
    },
    matchedIngredients: ['azithromycin', 'clarithromycin', 'erythromycin', 'roxithromycin'],
    mechanismTargetId: 'CYP3A4',
    source: 'FDA DailyMed Macrolide Hypersensitivity Label',
  },
  {
    id: 'statin_myopathy',
    label: {
      en: 'Prior Statin Muscle Damage / Rhabdomyolysis or Allergy',
      ta: 'கொலஸ்ட்ரால் மருந்து (Statin) தசைச் சிதைவு / ஒவ்வாமை',
      hi: 'स्टैटिन मांसपेशी क्षति (Rhabdomyolysis) या एलर्जी इतिहास',
    },
    fatalWarningHint: {
      en: 'Re-challenge can trigger fatal rhabdomyolysis and acute kidney failure.',
      ta: 'மீண்டும் எடுத்துக்கொள்வது கடுமையான தசைச் சிதைவு மற்றும் சிறுநீரக செயலிழப்பை ஏற்படுத்தும்.',
      hi: 'दोबारा लेने पर घातक रबडोमायोलिसिस और एक्यूट किडनी फेलियर का खतरा।',
    },
    matchedIngredients: ['atorvastatin', 'simvastatin', 'rosuvastatin', 'pravastatin'],
    mechanismTargetId: 'CYP3A4',
    source: 'FDA Statin Myopathy / Rhabdomyolysis Label',
  },
  {
    id: 'fluoroquinolone',
    label: {
      en: 'Fluoroquinolone Allergy / Tendon Rupture History (Ciprofloxacin)',
      ta: 'சிப்ரோஃப்ளோக்சாசின் (Fluoroquinolone) ஒவ்வாமை / தசைநார் பாதிப்பு',
      hi: 'सिप्रोफ्लोक्सासिन / फ्लोरोक्विनोलोन एलर्जी या टेंडन क्षति',
    },
    fatalWarningHint: {
      en: 'Risk of anaphylaxis, aortic dissection, tendon rupture, and CNS toxicity.',
      ta: 'தசைநார் கிழிவு, நரம்பு பாதிப்பு மற்றும் இதய தமனி ஆபத்து.',
      hi: 'एनाफिलेक्सिस, टेंडन टूटने और गंभीर तंत्रिका क्षति का खतरा।',
    },
    matchedIngredients: ['ciprofloxacin', 'levofloxacin', 'ofloxacin', 'moxifloxacin'],
    mechanismTargetId: 'HERG',
    source: 'FDA Boxed Warning for Fluoroquinolones',
  },
  {
    id: 'sulfa',
    label: {
      en: 'Sulfa Drug Allergy (Co-trimoxazole / Sulfamethoxazole)',
      ta: 'சல்ஃபா (Sulfa) மருந்து ஒவ்வாமை',
      hi: 'सल्फा दवा एलर्जी',
    },
    fatalWarningHint: {
      en: 'High risk of fatal Stevens-Johnson Syndrome (SJS/TEN) and hemolytic crisis.',
      ta: 'உயிருக்கு ஆபத்தான Stevens-Johnson தோல் அழற்சி ஏற்படும் அபாயம்.',
      hi: 'घातक स्टीवंस-जॉनसन सिंड्रोम (SJS/TEN) का खतरा।',
    },
    matchedIngredients: ['sulfamethoxazole', 'trimethoprim', 'sulfasalazine', 'sulfa', 'bactrim', 'septran'],
    source: 'WHO Essential Medicines Hypersensitivity Precaution',
  },
  {
    id: 'paracetamol',
    label: {
      en: 'Paracetamol / Acetaminophen Severe Allergy',
      ta: 'பாராசிட்டமால் (Paracetamol) தீவிர ஒவ்வாமை',
      hi: 'पैरासिटामोल / एसिटामिनोफेन गंभीर एलर्जी',
    },
    fatalWarningHint: {
      en: 'Can cause angioedema, shock, or severe mucocutaneous reactions.',
      ta: 'தொண்டை வீக்கம் மற்றும் கடுமையான தோல் எதிர்வினை ஏற்படும் அபாயம்.',
      hi: 'सांस नली में सूजन और गंभीर त्वचा प्रतिक्रिया का खतरा।',
    },
    matchedIngredients: ['paracetamol', 'acetaminophen'],
    source: 'CDSCO / FDA Acetaminophen Hypersensitivity Warning',
  },
];

export interface SurgicalOptionMeta {
  id: SurgicalHistoryStatus;
  label: Record<LanguageCode, string>;
  detail: Record<LanguageCode, string>;
}

export const SURGICAL_STATUS_OPTIONS: SurgicalOptionMeta[] = [
  {
    id: 'none',
    label: {
      en: 'No recent or upcoming surgery',
      ta: 'சமீபத்தில் அல்லது விரைவில் அறுவை சிகிச்சை இல்லை',
      hi: 'हाल में कोई सर्जरी नहीं हुई और न ही निर्धारित है',
    },
    detail: {
      en: 'No surgical wounds, bleeding episodes, or anesthesia in the last 30 days.',
      ta: 'கடந்த 30 நாட்களில் அறுவை சிகிச்சை அல்லது இரத்தக்கசிவு இல்லை.',
      hi: 'पिछले 30 दिनों में कोई सर्जरी या सक्रिय रक्तस्राव नहीं।',
    },
  },
  {
    id: 'recent_30_days',
    label: {
      en: 'Recent surgery undergone (within past 30 days)',
      ta: 'சமீபத்தில் அறுவை சிகிச்சை செய்தவர் (கடந்த 30 நாட்களில்)',
      hi: 'हाल ही में सर्जरी हुई है (पिछले 30 दिनों के भीतर)',
    },
    detail: {
      en: 'High risk of post-operative internal bleeding with NSAIDs/Aspirin and lactic acidosis with Metformin.',
      ta: 'அறுவை சிகிச்சைக்குப் பிந்தைய இரத்தக்கசிவு மற்றும் மருந்து நச்சு அபாயம் அதிகம்.',
      hi: 'सर्जरी के बाद आंतरिक रक्तस्राव (NSAIDs) और लैक्टिक एसिडोसिस (Metformin) का उच्च जोखिम।',
    },
  },
  {
    id: 'upcoming_within_14_days',
    label: {
      en: 'Scheduled for surgery within 14 days',
      ta: 'அடுத்த 14 நாட்களில் அறுவை சிகிச்சை திட்டமிடப்பட்டுள்ளது',
      hi: 'अगले 14 दिनों के भीतर सर्जरी निर्धारित है',
    },
    detail: {
      en: 'Many antiplatelets, NSAIDs, and diabetes drugs must be held before anesthesia.',
      ta: 'மயக்க மருந்து மற்றும் அறுவை சிகிச்சைக்கு முன் சில மருந்துகளை நிறுத்த வேண்டும்.',
      hi: 'एनेस्थीसिया से पहले कुछ दर्द निवारक, खून पतला करने वाली और डायबिटीज दवाएं रोकनी होती हैं।',
    },
  },
  {
    id: 'active_bleeding_or_trauma',
    label: {
      en: 'Active bleeding, major trauma, or post-op hemorrhage risk',
      ta: 'தற்போதைய இரத்தக்கசிவு அல்லது தீவிர காயம்',
      hi: 'सक्रिय रक्तस्राव, बड़ा आघात या पोस्ट-ऑप ब्लीडिंग का खतरा',
    },
    detail: {
      en: 'NSAIDs, Aspirin, and anticoagulants can become rapidly fatal during active hemorrhage.',
      ta: 'வலி நிவாரணிகள் மற்றும் இரத்தம் உறையாத மருந்துகள் உயிருக்கு ஆபத்தாகலாம்.',
      hi: 'सक्रिय रक्तस्राव के दौरान NSAIDs या एस्पिरिन घातक हो सकते हैं।',
    },
  },
];

export interface FatalRiskOptionMeta {
  id: FatalRiskFactorId;
  label: Record<LanguageCode, string>;
  fatalRationale: Record<LanguageCode, string>;
  mechanismTargetId: MechanismTargetId;
}

export const FATAL_RISK_FACTOR_OPTIONS: FatalRiskOptionMeta[] = [
  {
    id: 'severe_liver_disease',
    label: {
      en: 'Severe Liver Disease / Cirrhosis / Acute Hepatitis',
      ta: 'கடுமையான கல்லீரல் நோய் / சிரோசிஸ் / மஞ்சள் காமாலை',
      hi: 'गंभीर लिवर रोग / सिरोसिस / हेपेटाइटिस',
    },
    fatalRationale: {
      en: 'Paracetamol, Nimesulide, and high-dose Statins can trigger fatal acute hepatic failure.',
      ta: 'பாராசிட்டமால், நிமிசுலைடு மற்றும் ஸ்டேடின்கள் உயிருக்கு ஆபத்தான கல்லீரல் செயலிழப்பை ஏற்படுத்தும்.',
      hi: 'पैरासिटामोल, निमेसुलाइड और स्टैटिन से घातक एक्यूट लिवर फेलियर हो सकता है।',
    },
    mechanismTargetId: 'CYP3A4',
  },
  {
    id: 'severe_kidney_ckd',
    label: {
      en: 'Severe Kidney Failure / CKD (eGFR < 30) / Dialysis',
      ta: 'கடுமையான சிறுநீரக செயலிழப்பு (CKD / Dialysis)',
      hi: 'गंभीर किडनी रोग / CKD (eGFR < 30) / डायलिसिस',
    },
    fatalRationale: {
      en: 'Metformin causes fatal lactic acidosis; NSAIDs trigger acute renal shutdown.',
      ta: 'மெட்ஃபார்மின் உயிருக்கு ஆபத்தான லாக்டிக் அமிலத்தன்மையையும், NSAIDs சிறுநீரக செயலிழப்பையும் ஏற்படுத்தும்.',
      hi: 'मेटफॉर्मिन से घातक लैक्टिक एसिडोसिस और NSAIDs से किडनी बंद होने का खतरा।',
    },
    mechanismTargetId: 'AMPK',
  },
  {
    id: 'cardiac_qt_or_arrhythmia',
    label: {
      en: 'Heart Rhythm Disorder / Long QT Syndrome / Heart Failure',
      ta: 'இதய துடிப்பு கோளாறு (Long QT) / இதய செயலிழப்பு',
      hi: 'हृदय गति विकार / लॉन्ग QT सिंड्रोम / हार्ट फेलियर',
    },
    fatalRationale: {
      en: 'Macrolides, Domperidone & Fluoroquinolones block hERG channels causing fatal Torsades de Pointes.',
      ta: 'அசித்ரோமைசின் மற்றும் டோம்பெரிடோன் இதய துடிப்பை நிறுத்தும் அபாயம் (hERG block).',
      hi: 'मैक्रोलाइड्स और डॉमपेरिडोन hERG चैनल ब्लॉक कर घातक अतालता (Torsades) पैदा कर सकते हैं।',
    },
    mechanismTargetId: 'HERG',
  },
  {
    id: 'gi_ulcer_or_bleed',
    label: {
      en: 'History of Stomach Ulcer / GI Bleeding / Vomiting Blood',
      ta: 'வயிற்றுப் புண் (Ulcer) / குடல் இரத்தக்கசிவு வரலாறு',
      hi: 'पेट का अल्सर या गैस्ट्रोइंटेस्टाइनल रक्तस्राव का इतिहास',
    },
    fatalRationale: {
      en: 'COX inhibition from NSAIDs or Aspirin can trigger life-threatening GI perforation or hemorrhage.',
      ta: 'வலி நிவாரணிகள் குடலில் கடுமையான இரத்தக்கசிவை ஏற்படுத்தி உயிருக்கு ஆபத்தாகலாம்.',
      hi: 'NSAIDs या एस्पिरिन से पेट में जानलेवा रक्तस्राव या छिद्र हो सकता है।',
    },
    mechanismTargetId: 'COX2',
  },
  {
    id: 'anticoagulant_therapy',
    label: {
      en: 'Taking Blood Thinners (Warfarin, Clopidogrel, Apixaban, Heparin)',
      ta: 'இரத்தம் உறையாத மருந்துகள் (Warfarin / Clopidogrel) பயன்பாடு',
      hi: 'खून पतला करने की दवाएं (वारफरिन, क्लोपिडोग्रेल, एपिक्सैबन)',
    },
    fatalRationale: {
      en: 'Combining blood thinners with NSAIDs or high-dose aspirin multiplies fatal brain/GI bleed risk.',
      ta: 'வலி நிவாரணிகளுடன் சேர்த்து எடுத்தால் மூளை மற்றும் வயிற்றில் கடுமையான இரத்தக்கசிவு ஏற்படும்.',
      hi: 'NSAIDs के साथ लेने पर घातक आंतरिक या मस्तिष्क रक्तस्राव का खतरा कई गुना बढ़ जाता है।',
    },
    mechanismTargetId: 'COX2',
  },
  {
    id: 'asthma_or_nsaid_triad',
    label: {
      en: 'Severe Asthma or Aspirin / Painkiller-Triggered Wheezing',
      ta: 'தீவிர ஆஸ்துமா / வலி நிவாரணியால் மூச்சுத்திணறல்',
      hi: 'गंभीर अस्थमा या दर्द निवारक से सांस फूलने की समस्या',
    },
    fatalRationale: {
      en: 'NSAIDs / Aspirin can precipitate fatal bronchospasm (Samter triad / AERD).',
      ta: 'இபுப்ரோஃபன்/ஆஸ்பிரின் உயிருக்கு ஆபத்தான ஆஸ்துமா தாக்குதலைத் தூண்டலாம்.',
      hi: 'NSAIDs/एस्पिरिन से जानलेवा अस्थमा अटैक (ब्रोंकोस्पैज़्म) हो सकता है।',
    },
    mechanismTargetId: 'COX2',
  },
  {
    id: 'pregnancy_or_breastfeeding',
    label: {
      en: 'Pregnant or Currently Breastfeeding',
      ta: 'கர்ப்பிணி அல்லது தாய்ப்பால் கொடுப்பவர்',
      hi: 'गर्भवती या स्तनपान कराने वाली महिला',
    },
    fatalRationale: {
      en: 'Statins, ARBs (Telmisartan), and late-trimester NSAIDs risk fetal toxicity or ductus closure.',
      ta: 'சில கொலஸ்ட்ரால், இரத்த அழுத்த மற்றும் வலி மருந்துகள் கருவில் உள்ள குழந்தைக்கு ஆபத்தானவை.',
      hi: 'स्टैटिन, टेल्मिसार्टन और NSAIDs गर्भस्थ शिशु के लिए गंभीर रूप से हानिकारक हो सकते हैं।',
    },
    mechanismTargetId: 'COX2',
  },
  {
    id: 'chronic_alcohol_use',
    label: {
      en: 'Regular / Heavy Daily Alcohol Use (≥ 3 drinks/day)',
      ta: 'தினசரி மது அருந்தும் பழக்கம் (கல்லீரல் சுமை)',
      hi: 'नियमित / अत्यधिक शराब का सेवन (≥ 3 पेग/दिन)',
    },
    fatalRationale: {
      en: 'Depletes liver glutathione, making even moderate Paracetamol doses hepatotoxic.',
      ta: 'கல்லீரலின் பாதுகாப்பு நொதியைக் குறைத்து, பாராசிட்டமால் நச்சாகும் அபாயத்தை அதிகரிக்கிறது.',
      hi: 'लिवर ग्लूटाथियोन कम होने से पैरासिटामोल की सामान्य खुराक भी लिवर को नुकसान पहुंचा सकती है।',
    },
    mechanismTargetId: 'CYP3A4',
  },
  {
    id: 'dehydration_or_sepsis',
    label: {
      en: 'Severe Dehydration, Persistent Vomiting, or Suspected Dengue',
      ta: 'தீவிர நீரிழப்பு, தொடர் வாந்தி அல்லது டெங்கு சந்தேகம்',
      hi: 'गंभीर निर्जलीकरण, लगातार उल्टी या डेंगू की आशंका',
    },
    fatalRationale: {
      en: 'NSAIDs worsen dengue hemorrhage & acute kidney injury; Metformin risks lactic acidosis.',
      ta: 'டெங்கு/நீரிழப்பில் NSAIDs இரத்தக்கசிவையும் சிறுநீரக பாதிப்பையும் ஏற்படுத்தும்.',
      hi: 'डेंगू/निर्जलीकरण में NSAIDs रक्तस्राव और किडनी चोट का खतरा बढ़ाते हैं।',
    },
    mechanismTargetId: 'COX2',
  },
];

export function hasActiveQuizRisks(quiz?: PatientHealthQuiz | null): boolean {
  if (!quiz) return false;
  return (
    quiz.surgeryStatus !== 'none' ||
    quiz.allergies.length > 0 ||
    quiz.customAllergies.trim().length > 0 ||
    quiz.fatalRiskFactors.length > 0
  );
}

export function summarizeQuizProfile(
  quiz: PatientHealthQuiz,
  language: LanguageCode = 'en'
): string {
  if (quiz.decision === 'pending') {
    return language === 'ta'
      ? 'மருத்துவ பாதுகாப்பு வினாடி-வினா இன்னும் எடுக்கப்படவில்லை'
      : language === 'hi'
        ? 'स्वास्थ्य सुरक्षा प्रश्नावली अभी पूरी नहीं हुई है'
        : 'Health & Fatal-Risk Quiz not yet answered';
  }
  if (quiz.decision === 'skipped' && !quiz.completed && !hasActiveQuizRisks(quiz)) {
    return language === 'ta'
      ? 'வினாடி-வினா தவிர்க்கப்பட்டது — அறுவை சிகிச்சை/ஒவ்வாமை தகவல்கள் சேர்க்கப்படவில்லை'
      : language === 'hi'
        ? 'प्रश्नावली छोड़ी गई — एलर्जी/सर्जरी विवरण जोड़ा नहीं गया'
        : 'Quiz skipped — no personal allergy, surgery, or fatal-risk factors locked in yet';
  }

  const parts: string[] = [];
  if (quiz.surgeryStatus !== 'none') {
    const surg = SURGICAL_STATUS_OPTIONS.find((s) => s.id === quiz.surgeryStatus);
    parts.push(surg ? surg.label[language] : quiz.surgeryStatus);
  }
  if (quiz.allergies.length > 0 || quiz.customAllergies.trim()) {
    const names = quiz.allergies
      .map((id) => DRUG_ALLERGY_OPTIONS.find((a) => a.id === id)?.label[language] ?? id);
    if (quiz.customAllergies.trim()) names.push(quiz.customAllergies.trim());
    parts.push(`Allergies: ${names.join(', ')}`);
  }
  if (quiz.fatalRiskFactors.length > 0) {
    const names = quiz.fatalRiskFactors
      .map((id) => FATAL_RISK_FACTOR_OPTIONS.find((f) => f.id === id)?.label[language] ?? id);
    parts.push(`Fatal-risk factors: ${names.join(', ')}`);
  }

  if (parts.length === 0) {
    return language === 'ta'
      ? 'வினாடி-வினா முடிந்தது: அறியப்பட்ட ஒவ்வாமை, சமீபத்திய அறுவை சிகிச்சை அல்லது தீவிர ஆபத்து காரணிகள் இல்லை.'
      : language === 'hi'
        ? 'प्रश्नावली पूर्ण: कोई ज्ञात एलर्जी, हाल की सर्जरी या घातक जोखिम कारक दर्ज नहीं।'
        : 'Quiz completed: No recent surgery, drug allergies, or fatal organ risk factors reported.';
  }

  return parts.join(' · ');
}
