import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RotateCcw, Sparkles } from 'lucide-react';
import type { LanguageCode, MechanismTargetId } from '../types/medguard.ts';

export type OrganelleId =
  | 'membrane'
  | 'er'
  | 'mitochondrion'
  | 'nucleus'
  | 'nucleolus'
  | 'golgi'
  | 'lysosome'
  | 'ribosome'
  | 'peroxisome'
  | 'centrosome';

interface OrganelleMeta {
  id: OrganelleId;
  name: Record<LanguageCode, string>;
  role: Record<LanguageCode, string>;
  medicineLink: Record<LanguageCode, string>;
  color: string;
  focusTarget: [number, number, number];
  cameraOffset: [number, number, number];
  linkedMechanisms: MechanismTargetId[];
}

export const ORGANELLES: OrganelleMeta[] = [
  {
    id: 'er',
    name: {
      en: 'Endoplasmic Reticulum (Smooth & Rough ER)',
      ta: 'எண்டோபிளாஸ்மிக் ரெட்டிகுலம் (ER)',
      hi: 'एंडोप्लाज्मिक रेटिकुलम (ER)',
    },
    role: {
      en: 'Folded lipid-bilayer network continuous with the nuclear envelope. Smooth ER hosts drug-metabolising enzymes; Rough ER folds proteins.',
      ta: 'உட்கருவைச் சுற்றியுள்ள மடிந்த சவ்வு வலையமைப்பு. மென்மையான ER மருந்துகளைச் சிதைக்கும் நொதிகளைக் கொண்டுள்ளது.',
      hi: 'केंद्रक झिल्ली से जुड़ा मुड़ा हुआ झिल्ली तंत्र। स्मूथ ER में दवा-चयापचय एंजाइम होते हैं।',
    },
    medicineLink: {
      en: 'Hosts CYP3A4, CYP2D6, and COX-2. Clarithromycin blocks CYP3A4 here, causing Simvastatin/Atorvastatin buildup.',
      ta: 'CYP3A4, CYP2D6 மற்றும் COX-2 இங்கு உள்ளன. Clarithromycin இங்கு CYP3A4-ஐத் தடுப்பதால் Simvastatin அளவு அதிகமாகிறது.',
      hi: 'यहाँ CYP3A4, CYP2D6 और COX-2 होते हैं। क्लैरिथ्रोमाइसिन यहाँ CYP3A4 को रोकता है।',
    },
    color: '#C96A3B',
    focusTarget: [1.3, 0.2, 0.6],
    cameraOffset: [4.2, 2.5, 4.8],
    linkedMechanisms: ['CYP3A4', 'CYP2D6', 'COX2'],
  },
  {
    id: 'mitochondrion',
    name: {
      en: 'Mitochondrion (ATP Cristae)',
      ta: 'மைட்டோகாண்ட்ரியா (ஆற்றல் மையம்)',
      hi: 'माइटोकॉन्ड्रिया (ऊर्जा केंद्र)',
    },
    role: {
      en: 'Double-membraned powerhouse generating cellular ATP via inner cristae oxidative phosphorylation.',
      ta: 'உள் மடிப்புகள் மூலம் செல்லுக்குத் தேவையான ATP ஆற்றலை உருவாக்கும் இரட்டைச் சவ்வு உறுப்பு.',
      hi: 'भीतरी क्रिस्टी द्वारा कोशिकीय ATP ऊर्जा उत्पन्न करने वाला दोहरी झिल्ली वाला अंग।',
    },
    medicineLink: {
      en: 'Metformin gently modulates Complex I here to activate AMPK. High-dose Paracetamol or Statin overload can stress mitochondrial respiration.',
      ta: 'Metformin இங்கு Complex I மூலம் AMPK-ஐச் செயல்படுத்துகிறது. அதிக அளவு பாராசிட்டமால் அல்லது ஸ்டேட்டின் மைட்டோகாண்ட்ரியாவை அழுத்தலாம்.',
      hi: 'मेटफॉर्मिन यहाँ कॉम्प्लेक्स I के माध्यम से AMPK सक्रिय करता है। अधिक पैरासिटामोल तनाव पैदा कर सकता है।',
    },
    color: '#2F74B5',
    focusTarget: [-2.1, -0.5, 1.4],
    cameraOffset: [-4.5, 2.2, 4.6],
    linkedMechanisms: ['AMPK'],
  },
  {
    id: 'membrane',
    name: {
      en: 'Plasma Membrane & Ion Pores',
      ta: 'செல் சவ்வு & அயனித் துளைகள்',
      hi: 'प्लाज्मा झिल्ली और आयन चैनल',
    },
    role: {
      en: 'Semi-permeable phospholipid bilayer studded with selective ion channels and ATP-driven efflux pumps.',
      ta: 'செலுக்குள் மருந்துகள் செல்வதையும் வெளியேறுவதையும் கட்டுப்படுத்தும் பாஸ்போலிப்பிட் இரட்டை அடுக்கு.',
      hi: 'चयनात्मक आयन चैनलों और पंपों से युक्त अर्ध-पारगम्य लिपिड झिल्ली।',
    },
    medicineLink: {
      en: 'Contains cardiac hERG potassium pores (blocked by Azithromycin + Domperidone) and P-gp (ABCB1) efflux pumps.',
      ta: 'இதயத்தின் hERG பொட்டாசியம் துளைகள் (Azithromycin + Domperidone தடுப்பது) மற்றும் P-gp பம்புகள் இங்குள்ளன.',
      hi: 'यहाँ हृदय के hERG पोटैशियम चैनल और P-gp पंप स्थित होते हैं।',
    },
    color: '#7E9439',
    focusTarget: [0, 0, 0],
    cameraOffset: [0, 4.0, 9.2],
    linkedMechanisms: ['HERG', 'PGP'],
  },
  {
    id: 'nucleus',
    name: {
      en: 'Nucleus & Chromatin Core',
      ta: 'உட்கரு (நியூக்ளியஸ்)',
      hi: 'केंद्रक (न्यूक्लियस)',
    },
    role: {
      en: 'Houses chromosomal DNA and nuclear pores that regulate gene transcription for metabolic enzymes.',
      ta: 'மரபணு DNA மற்றும் வளர்சிதை மாற்ற நொதிகளின் உற்பத்தியைக் கட்டுப்படுத்தும் மையம்.',
      hi: 'डीएनए और चयापचय एंजाइमों के जीन प्रतिलेखन को नियंत्रित करने वाला केंद्र।',
    },
    medicineLink: {
      en: 'Nuclear receptors (PXR/CAR) sense drugs and upregulate CYP3A4 production; nuclear envelope houses COX-2.',
      ta: 'மருந்துகளை உணர்ந்து CYP3A4 உற்பத்தியை உட்கரு ஒழுங்குபடுத்துகிறது; COX-2 உட்கரு சவ்விலும் உள்ளது.',
      hi: 'दवाओं की पहचान करके CYP3A4 उत्पादन को नियंत्रित करता है; COX-2 केंद्रक झिल्ली पर भी होता है।',
    },
    color: '#8B6BB1',
    focusTarget: [0, 0.3, -0.3],
    cameraOffset: [2.8, 2.6, 5.4],
    linkedMechanisms: ['COX2'],
  },
  {
    id: 'ribosome',
    name: {
      en: 'Ribosomes (Protein Factories)',
      ta: 'ரைபோசோம்கள் (புரதத் தொழிற்சாலை)',
      hi: 'राइबोसोम (प्रोटीन कारखाना)',
    },
    role: {
      en: 'Ribonucleoprotein complexes translating mRNA transcripts into cellular proteins.',
      ta: 'mRNA தகவல்களைப் படித்துப் புரதங்களை உருவாக்கும் நுண்ணிய அமைப்புகள்.',
      hi: 'mRNA निर्देशों को पढ़कर प्रोटीन का निर्माण करने वाले कण।',
    },
    medicineLink: {
      en: 'Macrolide antibiotics like Clarithromycin and Azithromycin inhibit bacterial 50S ribosomes to stop infection.',
      ta: 'Clarithromycin, Azithromycin போன்ற ஆன்டிபயாட்டிக்குகள் பாக்டீரியாவின் ரைபோசோம்களைத் தடுத்து நோயைத் தீர்க்கின்றன.',
      hi: 'क्लैरिथ्रोमाइसिन और एज़िथ्रोमाइसिन जैसे एंटीबायोटिक बैक्टीरियल राइबोसोम को रोकते हैं।',
    },
    color: '#8C4D2D',
    focusTarget: [1.5, 0.9, 0.2],
    cameraOffset: [4.0, 2.8, 4.4],
    linkedMechanisms: [],
  },
  {
    id: 'golgi',
    name: {
      en: 'Golgi Apparatus',
      ta: 'கோல்கை உறுப்பு',
      hi: 'गॉल्जी काय',
    },
    role: {
      en: 'Stacked cisternae that glycosylate, sort, and ship proteins to the plasma membrane or lysosomes.',
      ta: 'புரதங்களை மாற்றியமைத்து, தரம் பிரித்து செல் சவ்விற்கு அனுப்பும் தட்டைப் பைகள்.',
      hi: 'प्रोटीन को संशोधित कर झिल्ली या लाइसोसोम तक पहुँचाने वाला तंत्र।',
    },
    medicineLink: {
      en: 'Traffics newly folded hERG ion channels and P-gp transporters to the outer cell surface.',
      ta: 'புதிய hERG அயனித் துளைகளையும் P-gp பம்புகளையும் செல் சவ்விற்குக் கொண்டு செல்கிறது.',
      hi: 'नए hERG चैनलों और P-gp ट्रांसपोर्टरों को कोशिका सतह पर भेजता है।',
    },
    color: '#C99A2E',
    focusTarget: [-1.4, 0.8, -1.6],
    cameraOffset: [-4.2, 3.0, 4.2],
    linkedMechanisms: ['HERG', 'PGP'],
  },
  {
    id: 'lysosome',
    name: {
      en: 'Lysosomes & Vacuolar Vesicles',
      ta: 'லைசோசோம்கள் & செல் குமிழ்கள்',
      hi: 'लाइसोसोम और वेसिकल',
    },
    role: {
      en: 'Acidic digestive vesicles and metabolic bodies clearing damaged organelles and lipid peroxides.',
      ta: 'சேதமடைந்த செல் பகுதிகளையும் நச்சுப் பொருட்களையும் உடைத்துச் சுத்தம் செய்யும் உறுப்புகள்.',
      hi: 'क्षतिग्रस्त अंगों और लिपिड पेरोक्साइड को साफ करने वाली थैलियाँ।',
    },
    medicineLink: {
      en: 'Weak-base medicines (like macrolides and antihistamines) can concentrate inside acidic lysosomes.',
      ta: 'சில மருந்துகள் அமிலத் தன்மையுள்ள லைசோசோம்களில் தேங்கி பக்கவிளைவுகளைக் காட்டலாம்.',
      hi: 'कुछ दवाएँ अम्लीय लाइसोसोम में जमा हो सकती हैं।',
    },
    color: '#5B9A42',
    focusTarget: [2.0, -1.0, -1.4],
    cameraOffset: [4.8, 1.8, 4.0],
    linkedMechanisms: [],
  },
  {
    id: 'centrosome',
    name: {
      en: 'Centrosome & Microtubules',
      ta: 'சென்ட்ரோசோம்',
      hi: 'सेंट्रोसोम',
    },
    role: {
      en: 'Microtubule-organising center maintaining intracellular transport tracks and cell division.',
      ta: 'செல்லின் உள் போக்குவரத்துப் பாதைகளையும் செல் பிரிவையும் ஒழுங்குபடுத்தும் மையம்.',
      hi: 'सूक्ष्मनलिकाओं और कोशिका विभाजन को व्यवस्थित करने वाला केंद्र।',
    },
    medicineLink: {
      en: 'Antimitotic agents target centrosome microtubule spindles.',
      ta: 'சில மருந்துகள் சென்ட்ரோசோம் நுண்குழாய்களை இலக்காகக் கொள்கின்றன.',
      hi: 'कुछ विशेष दवाएँ माइक्रोट्यूब्यूल स्पिंडल को लक्षित करती हैं।',
    },
    color: '#B56345',
    focusTarget: [-0.9, 1.8, 0.9],
    cameraOffset: [-3.4, 3.6, 5.2],
    linkedMechanisms: [],
  },
];

interface CellStructure3DProps {
  language: LanguageCode;
  highlightedMechanisms?: MechanismTargetId[];
  onInspectMechanism?: (targetId: MechanismTargetId) => void;
}

export function CellStructure3D({
  language,
  highlightedMechanisms = ['CYP3A4'],
  onInspectMechanism,
}: CellStructure3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState<OrganelleId>('er');
  const [autoRotate, setAutoRotate] = useState(true);
  const autoRotateRef = useRef(true);
  const selectedIdRef = useRef<OrganelleId>('er');
  const highlightedRef = useRef<MechanismTargetId[]>(highlightedMechanisms);
  const focusCameraRef = useRef<(id: OrganelleId) => void>(() => {});
  const resetCameraRef = useRef<() => void>(() => {});

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    highlightedRef.current = highlightedMechanisms;
  }, [highlightedMechanisms]);

  const highlightedOrganelles = useMemo(() => {
    const set = new Set<OrganelleId>();
    for (const org of ORGANELLES) {
      if (org.linkedMechanisms.some((m) => highlightedMechanisms.includes(m))) {
        set.add(org.id);
      }
    }
    return set;
  }, [highlightedMechanisms]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 340);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#EFE7DA');
    scene.fog = new THREE.FogExp2('#EFE7DA', 0.032);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0.6, 4.1, 9.2);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Soft botanical textbook lighting on warm parchment
    const hemi = new THREE.HemisphereLight(0xfffdf8, 0xd8cbb6, 1.1);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff8eb, 1.55);
    keyLight.position.set(6, 9, 7);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xb8c99a, 0.9);
    rimLight.position.set(-7, -3, -6);
    scene.add(rimLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 4.2;
    controls.maxDistance = 15;
    controls.maxPolarAngle = Math.PI * 0.85;

    const cellRoot = new THREE.Group();
    scene.add(cellRoot);

    const clickableMeshes: THREE.Object3D[] = [];
    const organelleGroups = new Map<OrganelleId, THREE.Group>();
    const disposables: Array<{ dispose: () => void }> = [];

    const register = <T extends { dispose: () => void }>(item: T): T => {
      disposables.push(item);
      return item;
    };

    const tagOrganelle = (obj: THREE.Object3D, id: OrganelleId) => {
      obj.userData.organelleId = id;
      clickableMeshes.push(obj);
    };

    // 1. Cutaway Cell Wall & Plasma Membrane (Warm Sage Olive shell matching reference illustration)
    const membraneGroup = new THREE.Group();
    const outerMembraneGeo = register(
      new THREE.SphereGeometry(3.85, 48, 36, 0, Math.PI * 2, 0.55, Math.PI - 0.55)
    );
    const outerMembraneMat = register(
      new THREE.MeshPhysicalMaterial({
        color: 0x8fa34b,
        emissive: 0x3b4817,
        emissiveIntensity: 0.14,
        roughness: 0.42,
        metalness: 0.04,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    const outerMembrane = new THREE.Mesh(outerMembraneGeo, outerMembraneMat);
    outerMembrane.rotation.x = Math.PI * 0.62;
    tagOrganelle(outerMembrane, 'membrane');
    membraneGroup.add(outerMembrane);

    const poreGeo = register(new THREE.CylinderGeometry(0.14, 0.14, 0.42, 16, 1, true));
    const poreMat = register(
      new THREE.MeshStandardMaterial({
        color: 0x556b22,
        emissive: 0x2f3b11,
        emissiveIntensity: 0.2,
        roughness: 0.4,
        metalness: 0.15,
        side: THREE.DoubleSide,
      })
    );
    const poreAngles = [0.2, 1.3, 2.5, 3.8, 5.1];
    poreAngles.forEach((ang, i) => {
      const pore = new THREE.Mesh(poreGeo, poreMat);
      const r = 3.78;
      const y = i % 2 === 0 ? -0.9 : -1.5;
      pore.position.set(Math.cos(ang) * r * 0.9, y, Math.sin(ang) * r * 0.9);
      pore.lookAt(0, 0, 0);
      pore.rotateX(Math.PI / 2);
      tagOrganelle(pore, 'membrane');
      membraneGroup.add(pore);
    });
    organelleGroups.set('membrane', membraneGroup);
    cellRoot.add(membraneGroup);

    // 2. Nucleus & Nucleolus (Lavender-purple shell + deep plum core)
    const nucleusGroup = new THREE.Group();
    const nucGeo = register(new THREE.SphereGeometry(1.05, 36, 28, 0, Math.PI * 1.55));
    const nucMat = register(
      new THREE.MeshStandardMaterial({
        color: 0x8b6bb1,
        emissive: 0x3b2857,
        emissiveIntensity: 0.18,
        roughness: 0.45,
        metalness: 0.08,
        side: THREE.DoubleSide,
      })
    );
    const nucShell = new THREE.Mesh(nucGeo, nucMat);
    nucShell.position.set(0, 0.25, -0.25);
    nucShell.rotation.set(0.3, -0.5, 0.2);
    tagOrganelle(nucShell, 'nucleus');
    nucleusGroup.add(nucShell);

    const nucleolusGeo = register(new THREE.SphereGeometry(0.42, 24, 24));
    const nucleolusMat = register(
      new THREE.MeshStandardMaterial({
        color: 0x5e4280,
        emissive: 0x2c1b40,
        emissiveIntensity: 0.22,
        roughness: 0.35,
        metalness: 0.12,
      })
    );
    const nucleolus = new THREE.Mesh(nucleolusGeo, nucleolusMat);
    nucleolus.position.set(0, 0.25, -0.25);
    tagOrganelle(nucleolus, 'nucleus');
    nucleusGroup.add(nucleolus);
    organelleGroups.set('nucleus', nucleusGroup);
    cellRoot.add(nucleusGroup);

    // 3. Endoplasmic Reticulum (Terracotta folded ribbon tubes wrapping around nucleus)
    const erGroup = new THREE.Group();
    const erMat = register(
      new THREE.MeshStandardMaterial({
        color: 0xc96a3b,
        emissive: 0x6b2f13,
        emissiveIntensity: 0.18,
        roughness: 0.42,
        metalness: 0.1,
      })
    );
    for (let ring = 0; ring < 3; ring++) {
      const pts: THREE.Vector3[] = [];
      const radius = 1.38 + ring * 0.34;
      for (let t = 0; t <= 28; t++) {
        const a = (t / 28) * Math.PI * 1.45 - 0.55;
        const wave = Math.sin(t * 1.35 + ring) * 0.22;
        pts.push(
          new THREE.Vector3(
            Math.cos(a) * radius + 0.15,
            wave + (ring - 1) * 0.32 + 0.1,
            Math.sin(a) * radius - 0.1
          )
        );
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tubeGeo = register(new THREE.TubeGeometry(curve, 56, 0.11, 12, false));
      const tube = new THREE.Mesh(tubeGeo, erMat);
      tagOrganelle(tube, 'er');
      erGroup.add(tube);
    }
    organelleGroups.set('er', erGroup);
    cellRoot.add(erGroup);

    // 4. Mitochondria (Cobalt blue capsules with pale blue inner cristae)
    const mitoGroup = new THREE.Group();
    const mitoOuterMat = register(
      new THREE.MeshPhysicalMaterial({
        color: 0x2f74b5,
        emissive: 0x163d63,
        emissiveIntensity: 0.16,
        roughness: 0.35,
        metalness: 0.08,
        transparent: true,
        opacity: 0.88,
      })
    );
    const cristaMat = register(
      new THREE.MeshStandardMaterial({
        color: 0x7fb4e0,
        emissive: 0x1d4f7d,
        emissiveIntensity: 0.22,
        roughness: 0.4,
      })
    );
    const mitoGeo = register(new THREE.CapsuleGeometry(0.32, 0.72, 10, 20));
    const cristaGeo = register(new THREE.TorusGeometry(0.18, 0.045, 8, 18));
    const mitoCoords: Array<{ pos: [number, number, number]; rot: [number, number, number] }> = [
      { pos: [-2.15, -0.45, 1.35], rot: [0.4, 0.8, 1.1] },
      { pos: [1.95, -1.15, 1.2], rot: [-0.3, 0.4, 0.8] },
      { pos: [-1.4, -1.35, -1.65], rot: [0.6, -0.5, 1.3] },
    ];
    mitoCoords.forEach(({ pos, rot }) => {
      const mWrap = new THREE.Group();
      mWrap.position.set(...pos);
      mWrap.rotation.set(...rot);
      const body = new THREE.Mesh(mitoGeo, mitoOuterMat);
      tagOrganelle(body, 'mitochondrion');
      mWrap.add(body);
      for (let c = -1; c <= 1; c++) {
        const cr = new THREE.Mesh(cristaGeo, cristaMat);
        cr.position.y = c * 0.22;
        cr.rotation.x = Math.PI / 2;
        tagOrganelle(cr, 'mitochondrion');
        mWrap.add(cr);
      }
      mitoGroup.add(mWrap);
    });
    organelleGroups.set('mitochondrion', mitoGroup);
    cellRoot.add(mitoGroup);

    // 5. Golgi Apparatus (Golden marigold stacked cisternae)
    const golgiGroup = new THREE.Group();
    const golgiMat = register(
      new THREE.MeshStandardMaterial({
        color: 0xc99a2e,
        emissive: 0x6b4e11,
        emissiveIntensity: 0.16,
        roughness: 0.38,
        metalness: 0.12,
      })
    );
    for (let s = 0; s < 4; s++) {
      const pts = [
        new THREE.Vector3(-0.7 + s * 0.06, 0, -0.25),
        new THREE.Vector3(0, 0.14 * Math.sin(s + 1), 0.15),
        new THREE.Vector3(0.7 - s * 0.06, 0, -0.25),
      ];
      const curve = new THREE.CatmullRomCurve3(pts);
      const gTube = register(new THREE.TubeGeometry(curve, 24, 0.09, 10, false));
      const mesh = new THREE.Mesh(gTube, golgiMat);
      mesh.position.set(-1.45, 0.55 + s * 0.2, -1.45);
      mesh.rotation.y = 0.6;
      tagOrganelle(mesh, 'golgi');
      golgiGroup.add(mesh);
    }
    organelleGroups.set('golgi', golgiGroup);
    cellRoot.add(golgiGroup);

    // 6. Lysosomes & Vesicles (Leaf-green bodies)
    const lysoGroup = new THREE.Group();
    const lysoGeo = register(new THREE.SphereGeometry(0.26, 20, 20));
    const lysoMat = register(
      new THREE.MeshStandardMaterial({
        color: 0x5b9a42,
        emissive: 0x264c18,
        emissiveIntensity: 0.16,
        roughness: 0.35,
        metalness: 0.1,
      })
    );
    const lysoPositions: Array<[number, number, number]> = [
      [2.1, -0.95, -1.3],
      [2.4, 0.2, -0.9],
      [-2.35, 0.55, 0.2],
      [0.8, -1.7, 1.9],
    ];
    lysoPositions.forEach((p) => {
      const sp = new THREE.Mesh(lysoGeo, lysoMat);
      sp.position.set(...p);
      tagOrganelle(sp, 'lysosome');
      lysoGroup.add(sp);
    });
    organelleGroups.set('lysosome', lysoGroup);
    cellRoot.add(lysoGroup);

    // 7. Ribosomes (Warm umber-terracotta granules)
    const riboGroup = new THREE.Group();
    const riboGeo = register(new THREE.SphereGeometry(0.065, 10, 10));
    const riboMat = register(
      new THREE.MeshStandardMaterial({
        color: 0x8c4d2d,
        emissive: 0x472210,
        roughness: 0.45,
        metalness: 0.1,
      })
    );
    const riboCount = 48;
    const riboInst = new THREE.InstancedMesh(riboGeo, riboMat, riboCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < riboCount; i++) {
      const a = i * 0.68;
      const r = 1.45 + (i % 5) * 0.36;
      dummy.position.set(
        Math.cos(a) * r,
        Math.sin(i * 1.1) * 1.15,
        Math.sin(a) * r
      );
      dummy.updateMatrix();
      riboInst.setMatrixAt(i, dummy.matrix);
    }
    riboInst.instanceMatrix.needsUpdate = true;
    riboInst.computeBoundingSphere();
    tagOrganelle(riboInst, 'ribosome');
    riboGroup.add(riboInst);
    organelleGroups.set('ribosome', riboGroup);
    cellRoot.add(riboGroup);

    // 8. Centrosome (Warm ochre centriole pair)
    const centroGroup = new THREE.Group();
    const centGeo = register(new THREE.CylinderGeometry(0.09, 0.09, 0.45, 9));
    const centMat = register(
      new THREE.MeshStandardMaterial({
        color: 0xb56345,
        emissive: 0x5c2918,
        emissiveIntensity: 0.18,
        roughness: 0.38,
        metalness: 0.15,
      })
    );
    const c1 = new THREE.Mesh(centGeo, centMat);
    c1.position.set(-0.9, 1.65, 0.85);
    const c2 = new THREE.Mesh(centGeo, centMat);
    c2.position.set(-0.7, 1.72, 0.95);
    c2.rotation.z = Math.PI / 2;
    tagOrganelle(c1, 'centrosome');
    tagOrganelle(c2, 'centrosome');
    centroGroup.add(c1, c2);
    organelleGroups.set('centrosome', centroGroup);
    cellRoot.add(centroGroup);

    const desiredTarget = new THREE.Vector3(0, 0, 0);
    const desiredCamPos = new THREE.Vector3(0.6, 4.1, 9.2);
    let transitioning = false;

    focusCameraRef.current = (id: OrganelleId) => {
      const meta = ORGANELLES.find((o) => o.id === id);
      if (!meta) return;
      desiredTarget.set(...meta.focusTarget);
      desiredCamPos.set(...meta.cameraOffset);
      transitioning = true;
      requestRender();
    };

    resetCameraRef.current = () => {
      desiredTarget.set(0, 0, 0);
      desiredCamPos.set(0.6, 4.1, 9.2);
      transitioning = true;
      requestRender();
    };

    controls.addEventListener('start', () => {
      transitioning = false;
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const onPointerDown = (ev: PointerEvent) => {
      downX = ev.clientX;
      downY = ev.clientY;
    };

    const onPointerUp = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length > 0) {
        const hitId = hits[0].object.userData.organelleId as OrganelleId | undefined;
        if (hitId) {
          setSelectedId(hitId);
          focusCameraRef.current(hitId);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    let renderBusy = false;
    let renderDirty = false;

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        const dt = Math.min(clock.getDelta(), 0.05);

        if (transitioning) {
          const factor = 1 - Math.exp(-5.5 * dt);
          controls.target.lerp(desiredTarget, factor);
          camera.position.lerp(desiredCamPos, factor);
          if (
            controls.target.distanceTo(desiredTarget) < 0.03 &&
            camera.position.distanceTo(desiredCamPos) < 0.05
          ) {
            transitioning = false;
          }
        }

        if (autoRotateRef.current && !transitioning) {
          cellRoot.rotation.y += dt * 0.18;
        }

        controls.update();
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty || autoRotateRef.current || transitioning) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    controls.addEventListener('change', requestRender);
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    requestRender();

    const ro = new ResizeObserver(() => {
      if (!container || disposed) return;
      const w = Math.max(container.clientWidth, 320);
      const h = Math.max(container.clientHeight, 340);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    });
    ro.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    };
  }, []);

  const selectedMeta = ORGANELLES.find((o) => o.id === selectedId) ?? ORGANELLES[0];

  return (
    <div className="organelle-panel rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[#D5C8B4] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-[#1E221D]">
            {language === 'ta'
              ? 'செல்லின் உள் அமைப்பு — ஊடாடும் 3D பார்வை'
              : language === 'hi'
                ? 'कोशिका की आंतरिक संरचना — 3D दृश्य'
                : 'Cell Inner Structure Explorer (3D Cutaway)'}
          </h3>
          <p className="text-xs text-[#555A50]">
            {language === 'ta'
              ? 'சுழற்ற இழுக்கவும் · உள் உறுப்பைத் தட்டி மருந்து செயல்பாட்டைப் பார்க்கவும்'
              : 'Drag to orbit · Click any organelle to see where your medicines act inside the cell'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setAutoRotate((v) => !v)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#C6B69E] bg-[#EFE7DA] text-[#1E221D] hover:bg-[#E5DAC7] transition-colors whitespace-nowrap"
          >
            {autoRotate ? 'Pause Orbit' : 'Resume Orbit'}
          </button>
          <button
            type="button"
            onClick={() => resetCameraRef.current()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#C6B69E] bg-[#EFE7DA] text-[#1E221D] hover:bg-[#E5DAC7] transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset View
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,1fr)]">
        {/* Isolated 3D WebGL Canvas Stage */}
        <div className="relative bg-[#EFE7DA] min-h-[380px] lg:min-h-[460px]">
          <div ref={mountRef} className="w-full h-[380px] lg:h-[460px] cursor-grab active:cursor-grabbing" />
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[#4F544C] bg-[#FCF9F4]/85 border border-[#D5C8B4] rounded-md px-2.5 py-1">
            <span>Selected: {selectedMeta.name.en}</span>
            <span>Eukaryotic Cell Cross-Section Cutaway</span>
          </div>
        </div>

        {/* Organelle Inspector & Medicine Action Panel */}
        <div className="p-5 border-t lg:border-t-0 lg:border-l border-[#D5C8B4] flex flex-col justify-between gap-4 bg-[#FCF9F4]">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-[#74559C] font-semibold">ORGANELLE COMPARTMENT</span>
              {highlightedOrganelles.has(selectedMeta.id) && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#245920]">
                  <Sparkles className="w-3.5 h-3.5" />
                  Active in Rx
                </span>
              )}
            </div>
            <h4 className="text-lg font-semibold text-[#1E221D]">{selectedMeta.name[language]}</h4>
            <p className="text-sm text-[#3C4138] leading-relaxed">{selectedMeta.role[language]}</p>

            <div className="organelle-subpanel rounded-lg p-3.5 space-y-1.5">
              <div className="text-xs font-mono text-[#8E3E1C] font-semibold">
                {language === 'ta' ? 'மருந்து தொடர்பு' : 'Medicine & AlphaFold Link'}
              </div>
              <p className="text-sm text-[#1E221D] leading-relaxed">
                {selectedMeta.medicineLink[language]}
              </p>
            </div>

            {selectedMeta.linkedMechanisms.length > 0 && onInspectMechanism && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {selectedMeta.linkedMechanisms.map((mechId) => (
                  <button
                    key={mechId}
                    type="button"
                    onClick={() => onInspectMechanism(mechId)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#E9F1F9] border border-[#B3CDE5] text-[#1A4B7A] hover:bg-[#DCEAF7] transition-colors whitespace-nowrap"
                  >
                    Open {mechId} in AlphaFold 3D →
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 pt-3 border-t border-[#D5C8B4]">
            <div className="text-xs font-mono text-[#555A50]">Organelles inside cell</div>
            <div className="grid grid-cols-2 gap-1.5">
              {ORGANELLES.map((org) => {
                const isSelected = org.id === selectedId;
                const isRxActive = highlightedOrganelles.has(org.id);
                return (
                  <button
                    key={org.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(org.id);
                      focusCameraRef.current(org.id);
                    }}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors border ${
                      isSelected
                        ? 'bg-[#EAF0DC] border-[#637928] text-[#1E221D] font-semibold'
                        : 'bg-[#F5EFE5] border-[#DDD0BC] text-[#3C4138] hover:border-[#B8A68B]'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: org.color }}
                    />
                    <span className="truncate">{org.name[language].split(' (')[0]}</span>
                    {isRxActive && (
                      <span className="ml-auto text-[10px] font-mono text-[#245920] font-semibold shrink-0">
                        Rx
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
