import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wand2, Copy, Check, Video, Camera, Sun, ImageIcon, Sparkles, RefreshCw, ChevronRight, History, LogIn, LogOut, X } from 'lucide-react';
import { generateSeedancePrompt, generateStartingImage, PromptData } from './services/geminiService';
// Importation de 'storage' depuis votre fichier firebase.ts
import { auth, db, storage, signInWithGoogle, logOut } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, doc, setDoc, getDoc } from 'firebase/firestore';
// Imports nécessaires pour Firebase Storage
import { ref, uploadString, getDownloadURL } from 'firebase/storage';

const CAMERA_OPTIONS = [
  "Dynamique (FPV, Drone)", "Lent et fluide (Steadicam)", "Plan serré (Macro, Close-up)",
  "Travelling avant/arrière (Dolly)", "Panoramique (Panning)", "Caméra à l'épaule (Handheld)",
  "Plongée (High angle)", "Contre-plongée (Low angle)", "Plan grue (Crane shot)",
  "Zoom optique", "Plan fixe (Static)", "Whip pan (Panoramique filé)"
];

const LIGHTING_OPTIONS = [
  "Cinématique (Contraste élevé)", "Heure dorée (Golden hour)", "Heure bleue (Blue hour)",
  "Néon Cyberpunk", "Studio professionnel", "Sombre et mystérieux (Low key)",
  "Clair et lumineux (High key)", "Lumière naturelle", "Éclairage volumétrique (God rays)",
  "Clair-obscur (Chiaroscuro)"
];

const STYLE_OPTIONS = [
  "Photoréaliste (8k, Ultra-détaillé)", "Film 35mm (Grain, Nostalgique)", "Film 8mm (Vintage)",
  "Animation 3D (Pixar/Disney)", "Anime japonais", "Peinture numérique",
  "Rendu Unreal Engine 5", "Aquarelle", "Cyberpunk", "Steampunk", "Stop-motion (Claymation)"
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const [formData, setFormData] = useState<PromptData>(() => {
    const saved = localStorage.getItem('seedance_formData');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error("Failed to parse saved formData", e); }
    }
    return { baseIdea: '', subject: '', environment: '', camera: '', lighting: '', style: '' };
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(() => localStorage.getItem('seedance_generatedPrompt'));
  const [generatedImage, setGeneratedImage] = useState<string | null>(() => localStorage.getItem('seedance_generatedImage'));
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName || '',
            createdAt: serverTimestamp()
          });
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }
    const q = query(collection(db, `users/${user.uid}/history`), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const historyData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHistory(historyData);
    }, (err) => {
      console.error("Error fetching history:", err);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => { localStorage.setItem('seedance_formData', JSON.stringify(formData)); }, [formData]);
  useEffect(() => { 
    generatedPrompt ? localStorage.setItem('seedance_generatedPrompt', generatedPrompt) : localStorage.removeItem('seedance_generatedPrompt'); 
  }, [generatedPrompt]);
  useEffect(() => { 
    generatedImage ? localStorage.setItem('seedance_generatedImage', generatedImage) : localStorage.removeItem('seedance_generatedImage'); 
  }, [generatedImage]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setError(null);
    setGeneratedPrompt(null);
    setGeneratedImage(null);
    setIsCopied(false);

    try {
      const prompt = await generateSeedancePrompt(formData);
      setGeneratedPrompt(prompt);
      
      const image = await generateStartingImage(prompt); // Suppose que c'est un base64 (Data URL)
      setGeneratedImage(image);

      if (user) {
        let imageUrlForFirestore = null;

        if (image) {
          // 1. Créer une référence unique dans Storage
          const storagePath = `users/${user.uid}/history/${Date.now()}.png`;
          const imageRef = ref(storage, storagePath);

          // 2. Upload de l'image (format Data URL / Base64)
          await uploadString(imageRef, image, 'data_url');

          // 3. Récupérer l'URL publique
          imageUrlForFirestore = await getDownloadURL(imageRef);
        }

        // 4. Sauvegarder dans Firestore avec l'URL courte
        await addDoc(collection(db, `users/${user.uid}/history`), {
          uid: user.uid,
          formData,
          generatedPrompt: prompt,
          generatedImage: imageUrlForFirestore,
          createdAt: serverTimestamp()
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    if (!generatedPrompt) return;
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) { console.error("Failed to copy text: ", err); }
  };

  const resetForm = () => {
    setGeneratedPrompt(null);
    setGeneratedImage(null);
    setIsCopied(false);
  };

  const handleLogin = async () => {
    try {
      setError(null);
      await signInWithGoogle();
    } catch (err: any) {
      if (err.code === 'auth/popup-blocked') {
        setError("Fenêtre bloquée. Ouvrez l'app dans un nouvel onglet.");
      } else {
        setError("Erreur : " + err.message);
      }
    }
  };

  const loadHistoryItem = (item: any) => {
    setFormData(item.formData);
    setGeneratedPrompt(item.generatedPrompt);
    setGeneratedImage(item.generatedImage);
    setShowHistory(false);
  };

  return (
    <div className="min-h-screen p-6 md:p-12 font-sans flex flex-col relative">
      {/* Top Navigation */}
      <div className="absolute top-6 right-6 md:top-12 md:right-12 flex items-center gap-4 z-50">
        {user ? (
          <>
            <button onClick={() => setShowHistory(true)} className="flex items-center px-4 py-2 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 rounded-xl text-sm font-medium transition-all backdrop-blur-md">
              <History className="w-4 h-4 mr-2" /> Historique
            </button>
            <button onClick={logOut} className="flex items-center px-4 py-2 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-red-400 rounded-xl text-sm font-medium transition-all backdrop-blur-md">
              <LogOut className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button onClick={handleLogin} className="flex items-center px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 rounded-xl text-sm font-medium transition-all backdrop-blur-md">
            <LogIn className="w-4 h-4 mr-2" /> Connexion
          </button>
        )}
      </div>

      {/* History Sidebar */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowHistory(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="fixed top-0 right-0 bottom-0 w-full md:w-96 bg-zinc-950 border-l border-zinc-800 z-50 flex flex-col shadow-2xl">
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="text-xl font-semibold text-white flex items-center"><History className="w-5 h-5 mr-2 text-indigo-400" /> Mon Historique</h3>
                <button onClick={() => setShowHistory(false)} className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-900 transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {history.length === 0 ? <p className="text-zinc-500 text-center mt-8">Aucun historique.</p> : 
                  history.map((item) => (
                    <div key={item.id} onClick={() => loadHistoryItem(item)} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 cursor-pointer hover:bg-zinc-800 hover:border-indigo-500/50 transition-all group">
                      <p className="text-zinc-300 font-medium text-sm line-clamp-2 mb-2 group-hover:text-indigo-300">{item.formData.baseIdea}</p>
                      {item.generatedImage && (
                        <div className="w-full h-24 rounded-lg overflow-hidden mb-2">
                          <img src={item.generatedImage} alt="Mini" className="w-full h-full object-cover opacity-80 group-hover:opacity-100" />
                        </div>
                      )}
                      <p className="text-xs text-zinc-600">{item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Récemment'}</p>
                    </div>
                  ))
                }
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="max-w-4xl mx-auto w-full flex-grow mt-12 md:mt-0">
        <header className="mb-12 text-center">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center justify-center p-3 mb-4 rounded-2xl bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20"><Video className="w-8 h-8" /></motion.div>
          <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-4xl md:text-5xl font-bold tracking-tight mb-4 bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent">Seedance 2.0 Prompt Crafter</motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-zinc-400 max-w-2xl mx-auto text-lg">Générez des prompts vidéo. L'IA s'occupe du reste.</motion.p>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className={`${generatedPrompt ? 'lg:col-span-5' : 'lg:col-span-12'} transition-all duration-500`}>
            <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/50 rounded-3xl p-6 md:p-8 shadow-2xl">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="flex items-center text-sm font-medium text-zinc-300"><Sparkles className="w-4 h-4 mr-2 text-indigo-400" /> Idée de base</label>
                  <textarea name="baseIdea" value={formData.baseIdea} onChange={handleInputChange} className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-4 text-zinc-100 focus:ring-2 focus:ring-indigo-500/50 transition-all h-24" required />
                </div>
                {/* Sélections */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">Sujet</label>
                    <input type="text" name="subject" value={formData.subject} onChange={handleInputChange} className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 text-zinc-100" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">Environnement</label>
                    <input type="text" name="environment" value={formData.environment} onChange={handleInputChange} className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 text-zinc-100" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-zinc-800/50">
                   <select name="camera" value={formData.camera} onChange={handleInputChange} className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 text-zinc-100">
                      <option value="">Caméra (Auto)</option>
                      {CAMERA_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                   </select>
                   <select name="lighting" value={formData.lighting} onChange={handleInputChange} className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 text-zinc-100">
                      <option value="">Éclairage (Auto)</option>
                      {LIGHTING_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                   </select>
                   <select name="style" value={formData.style} onChange={handleInputChange} className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 text-zinc-100">
                      <option value="">Style (Auto)</option>
                      {STYLE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                   </select>
                </div>
                <button type="submit" disabled={isGenerating || !formData.baseIdea.trim()} className="w-full mt-8 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-4 rounded-xl flex items-center justify-center transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(79,70,229,0.3)]">
                  {isGenerating ? <><RefreshCw className="w-5 h-5 mr-2 animate-spin" /> Génération...</> : <><Wand2 className="w-5 h-5 mr-2" /> Créer le Prompt</>}
                </button>
                {error && <p className="text-red-400 text-sm text-center mt-4">{error}</p>}
              </form>
            </div>
          </motion.div>

          <AnimatePresence>
            {generatedPrompt && (
              <motion.div initial={{ opacity: 0, x: 20, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="lg:col-span-7">
                <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800 rounded-3xl p-6 md:p-8 shadow-2xl h-full flex flex-col relative overflow-hidden">
                  <div className="flex items-center justify-between mb-6 relative z-10">
                    <h2 className="text-xl font-semibold text-white flex items-center"><Sparkles className="w-5 h-5 mr-2 text-indigo-400" /> Prompt Final</h2>
                    <div className="flex gap-2">
                      <button onClick={copyToClipboard} className="flex items-center px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm font-medium transition-colors">
                        {isCopied ? <><Check className="w-4 h-4 mr-2 text-green-400" /> Copié</> : <><Copy className="w-4 h-4 mr-2" /> Copier</>}
                      </button>
                      <button onClick={resetForm} className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg"><RefreshCw className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="flex-grow overflow-y-auto custom-scrollbar pr-2 relative z-10">
                    <div className="flex flex-col gap-4">
                      {generatedImage && <img src={generatedImage} alt="Preview" className="w-full rounded-xl border border-zinc-800/80 shadow-lg" />}
                      <div className="bg-zinc-950/50 rounded-xl border border-zinc-800/80 p-6">
                        <p className="text-zinc-300 font-mono text-sm whitespace-pre-wrap">{generatedPrompt}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
      <footer className="mt-12 text-left">
        <a href="https://www.antoine-rousseau.fr/" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-indigo-400 text-sm font-medium">antoine-rousseau.fr</a>
      </footer>
    </div>
  );
}
