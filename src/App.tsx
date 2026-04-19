import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wand2, Copy, Check, Video, Camera, Sun, ImageIcon, Sparkles, RefreshCw, ChevronRight, History, LogIn, LogOut, X } from 'lucide-react';
import { generateSeedancePrompt, generateStartingImage, PromptData } from './services/geminiService';
import { auth, db, signInWithGoogle, logOut } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, doc, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase'; // Importez l'instance storage que vous venez d'ajouter


const CAMERA_OPTIONS = [
  "Dynamique (FPV, Drone)",
  "Lent et fluide (Steadicam)",
  "Plan serré (Macro, Close-up)",
  "Travelling avant/arrière (Dolly)",
  "Panoramique (Panning)",
  "Caméra à l'épaule (Handheld)",
  "Plongée (High angle)",
  "Contre-plongée (Low angle)",
  "Plan grue (Crane shot)",
  "Zoom optique",
  "Plan fixe (Static)",
  "Whip pan (Panoramique filé)"
];

const LIGHTING_OPTIONS = [
  "Cinématique (Contraste élevé)",
  "Heure dorée (Golden hour)",
  "Heure bleue (Blue hour)",
  "Néon Cyberpunk",
  "Studio professionnel",
  "Sombre et mystérieux (Low key)",
  "Clair et lumineux (High key)",
  "Lumière naturelle",
  "Éclairage volumétrique (God rays)",
  "Clair-obscur (Chiaroscuro)"
];

const STYLE_OPTIONS = [
  "Photoréaliste (8k, Ultra-détaillé)",
  "Film 35mm (Grain, Nostalgique)",
  "Film 8mm (Vintage)",
  "Animation 3D (Pixar/Disney)",
  "Anime japonais",
  "Peinture numérique",
  "Rendu Unreal Engine 5",
  "Aquarelle",
  "Cyberpunk",
  "Steampunk",
  "Stop-motion (Claymation)"
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const [formData, setFormData] = useState<PromptData>(() => {
    const saved = localStorage.getItem('seedance_formData');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved formData", e);
      }
    }
    return {
      baseIdea: '',
      subject: '',
      environment: '',
      camera: '',
      lighting: '',
      style: '',
    };
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(() => {
    return localStorage.getItem('seedance_generatedPrompt') || null;
  });
  const [generatedImage, setGeneratedImage] = useState<string | null>(() => {
    return localStorage.getItem('seedance_generatedImage') || null;
  });
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Ensure user document exists
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

  useEffect(() => {
    localStorage.setItem('seedance_formData', JSON.stringify(formData));
  }, [formData]);

  useEffect(() => {
    if (generatedPrompt) {
      localStorage.setItem('seedance_generatedPrompt', generatedPrompt);
    } else {
      localStorage.removeItem('seedance_generatedPrompt');
    }
  }, [generatedPrompt]);

  useEffect(() => {
    if (generatedImage) {
      localStorage.setItem('seedance_generatedImage', generatedImage);
    } else {
      localStorage.removeItem('seedance_generatedImage');
    }
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
      // 1. Génération du prompt et de l'image
      const prompt = await generateSeedancePrompt(formData);
      setGeneratedPrompt(prompt);
      
      const image = await generateStartingImage(prompt);
      setGeneratedImage(image);

      if (user) {
        let finalImageUrl = null;

        // 2. Si une image a été générée, on l'envoie vers Storage
        if (image && image.startsWith('data:')) {
          try {
            // Création d'une référence unique dans Storage
            const storageRef = ref(storage, `users/${user.uid}/history/${Date.now()}.png`);
            
            // Upload du base64 vers Storage
            await uploadString(storageRef, image, 'data_url');
            
            // Récupération de l'URL finale
            finalImageUrl = await getDownloadURL(storageRef);
          } catch (uploadErr) {
            console.error("Erreur lors de l'upload vers Storage:", uploadErr);
            // Optionnel : on garde l'image null ou on gère l'erreur
          }
        } else {
          // Si l'image est déjà une URL (http...), on l'utilise directement
          finalImageUrl = image;
        }

        // 3. Enregistrement dans Firestore avec l'URL (très légère)
        await addDoc(collection(db, `users/${user.uid}/history`), {
          uid: user.uid,
          formData,
          generatedPrompt: prompt,
          generatedImage: finalImageUrl, // On stocke l'URL Firebase Storage ici
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
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
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
      console.error("Login error:", err);
      if (err.code === 'auth/popup-blocked' || (err.message && err.message.includes('INTERNAL ASSERTION FAILED'))) {
        setError("La fenêtre de connexion a été bloquée par le navigateur. ⚠️ Pour vous connecter, vous DEVEZ ouvrir l'application dans un nouvel onglet en cliquant sur l'icône en haut à droite de cette fenêtre d'aperçu.");
      } else if (err.code !== 'auth/cancelled-popup-request' && err.code !== 'auth/popup-closed-by-user') {
        setError("Erreur de connexion : " + err.message);
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
            <button
              onClick={() => setShowHistory(true)}
              className="flex items-center px-4 py-2 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 rounded-xl text-sm font-medium transition-all backdrop-blur-md"
            >
              <History className="w-4 h-4 mr-2" />
              Historique
            </button>
            <button
              onClick={logOut}
              className="flex items-center px-4 py-2 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-red-400 rounded-xl text-sm font-medium transition-all backdrop-blur-md"
              title="Se déconnecter"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button
            onClick={handleLogin}
            className="flex items-center px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 rounded-xl text-sm font-medium transition-all backdrop-blur-md"
          >
            <LogIn className="w-4 h-4 mr-2" />
            Connexion pour Historique
          </button>
        )}
      </div>

      {/* History Sidebar */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-full md:w-96 bg-zinc-950 border-l border-zinc-800 z-50 flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="text-xl font-semibold text-white flex items-center">
                  <History className="w-5 h-5 mr-2 text-indigo-400" />
                  Mon Historique
                </h3>
                <button onClick={() => setShowHistory(false)} className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-900 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {history.length === 0 ? (
                  <p className="text-zinc-500 text-center mt-8">Aucun historique pour le moment.</p>
                ) : (
                  history.map((item) => (
                    <div 
                      key={item.id} 
                      onClick={() => loadHistoryItem(item)}
                      className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 cursor-pointer hover:bg-zinc-800 hover:border-indigo-500/50 transition-all group"
                    >
                      <p className="text-zinc-300 font-medium text-sm line-clamp-2 mb-2 group-hover:text-indigo-300 transition-colors">
                        {item.formData.baseIdea}
                      </p>
                      {item.generatedImage && (
                        <div className="w-full h-24 rounded-lg overflow-hidden mb-2">
                          <img src={item.generatedImage} alt="Miniature" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                        </div>
                      )}
                      <p className="text-xs text-zinc-600">
                        {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('fr-FR', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                        }) : 'Récemment'}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="max-w-4xl mx-auto w-full flex-grow mt-12 md:mt-0">
        
        {/* Header */}
        <header className="mb-12 text-center">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center justify-center p-3 mb-4 rounded-2xl bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20"
          >
            <Video className="w-8 h-8" />
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl font-bold tracking-tight mb-4 bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent"
          >
            Seedance 2.0 Prompt Crafter
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-zinc-400 max-w-2xl mx-auto text-lg"
          >
            Générez des prompts vidéo en béton armé. Décrivez votre vision, l'IA s'occupe de la direction artistique et technique.
          </motion.p>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Form Section */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className={`${generatedPrompt ? 'lg:col-span-5' : 'lg:col-span-12'} transition-all duration-500 ease-in-out`}
          >
            <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/50 rounded-3xl p-6 md:p-8 shadow-2xl">
              <form onSubmit={handleSubmit} className="space-y-6">
                
                {/* Base Idea */}
                <div className="space-y-2">
                  <label className="flex items-center text-sm font-medium text-zinc-300">
                    <Sparkles className="w-4 h-4 mr-2 text-indigo-400" />
                    Idée de base
                  </label>
                  <textarea
                    name="baseIdea"
                    value={formData.baseIdea}
                    onChange={handleInputChange}
                    placeholder="Ex: Un astronaute qui danse le tango sur Mars..."
                    className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-4 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all resize-none h-24"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Subject */}
                  <div className="space-y-2">
                    <label className="flex items-center text-sm font-medium text-zinc-300">
                      <ChevronRight className="w-4 h-4 mr-1 text-indigo-400" />
                      Sujet & Action
                    </label>
                    <input
                      type="text"
                      name="subject"
                      value={formData.subject}
                      onChange={handleInputChange}
                      placeholder="Ex: Astronaute en combinaison brillante, mouvements fluides"
                      className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                    />
                  </div>

                  {/* Environment */}
                  <div className="space-y-2">
                    <label className="flex items-center text-sm font-medium text-zinc-300">
                      <ImageIcon className="w-4 h-4 mr-2 text-indigo-400" />
                      Environnement
                    </label>
                    <input
                      type="text"
                      name="environment"
                      value={formData.environment}
                      onChange={handleInputChange}
                      placeholder="Ex: Cratères martiens, ciel étoilé, poussière rouge"
                      className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-zinc-800/50">
                  {/* Camera */}
                  <div className="space-y-2">
                    <label className="flex items-center text-sm font-medium text-zinc-300">
                      <Camera className="w-4 h-4 mr-2 text-indigo-400" />
                      Caméra
                    </label>
                    <select
                      name="camera"
                      value={formData.camera}
                      onChange={handleInputChange}
                      className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all appearance-none"
                    >
                      <option value="">Laisser l'IA choisir</option>
                      {CAMERA_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  {/* Lighting */}
                  <div className="space-y-2">
                    <label className="flex items-center text-sm font-medium text-zinc-300">
                      <Sun className="w-4 h-4 mr-2 text-indigo-400" />
                      Éclairage
                    </label>
                    <select
                      name="lighting"
                      value={formData.lighting}
                      onChange={handleInputChange}
                      className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all appearance-none"
                    >
                      <option value="">Laisser l'IA choisir</option>
                      {LIGHTING_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  {/* Style */}
                  <div className="space-y-2">
                    <label className="flex items-center text-sm font-medium text-zinc-300">
                      <Wand2 className="w-4 h-4 mr-2 text-indigo-400" />
                      Style visuel
                    </label>
                    <select
                      name="style"
                      value={formData.style}
                      onChange={handleInputChange}
                      className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all appearance-none"
                    >
                      <option value="">Laisser l'IA choisir</option>
                      {STYLE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isGenerating || !formData.baseIdea.trim()}
                  className="w-full mt-8 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-4 px-6 rounded-xl flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_30px_rgba(79,70,229,0.5)]"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                      Génération en cours...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-5 h-5 mr-2" />
                      Créer le Prompt Seedance 2.0
                    </>
                  )}
                </button>

                {error && (
                  <p className="text-red-400 text-sm text-center mt-4">{error}</p>
                )}
              </form>
            </div>
          </motion.div>

          {/* Result Section */}
          <AnimatePresence>
            {generatedPrompt && (
              <motion.div
                initial={{ opacity: 0, x: 20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="lg:col-span-7"
              >
                <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800 rounded-3xl p-6 md:p-8 shadow-2xl h-full flex flex-col relative overflow-hidden">
                  
                  {/* Decorative background glow */}
                  <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                  <div className="flex items-center justify-between mb-6 relative z-10">
                    <h2 className="text-xl font-semibold text-white flex items-center">
                      <Sparkles className="w-5 h-5 mr-2 text-indigo-400" />
                      Votre Prompt Final
                    </h2>
                    <div className="flex gap-2">
                      <button
                        onClick={copyToClipboard}
                        className="flex items-center px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm font-medium transition-colors"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-4 h-4 mr-2 text-green-400" />
                            Copié !
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4 mr-2" />
                            Copier
                          </>
                        )}
                      </button>
                      <button
                        onClick={resetForm}
                        className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors"
                        title="Nouveau prompt"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex-grow relative z-10 overflow-y-auto custom-scrollbar pr-2">
                    <div className="flex flex-col gap-4">
                      {generatedImage && (
                        <div className="w-full rounded-xl overflow-hidden border border-zinc-800/80 shadow-lg shrink-0">
                          <img src={generatedImage} alt="Image de départ générée" className="w-full h-auto object-cover" />
                        </div>
                      )}
                      <div className="bg-zinc-950/50 rounded-xl border border-zinc-800/80 p-6 shrink-0">
                        <p className="text-zinc-300 font-mono text-sm leading-relaxed whitespace-pre-wrap">
                          {generatedPrompt}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-zinc-800/50 relative z-10 shrink-0">
                    <p className="text-xs text-zinc-500 flex items-center">
                      <Video className="w-3 h-3 mr-1" />
                      Copiez ce texte et collez-le directement dans Seedance 2.0. Le prompt a été généré en anglais pour des résultats optimaux.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </main>
      </div>

      {/* Footer discret */}
      <footer className="mt-12 text-left">
        <a 
          href="https://www.antoine-rousseau.fr/" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-zinc-400 hover:text-indigo-400 text-sm font-medium transition-colors duration-300 drop-shadow-md"
        >
          antoine-rousseau.fr
        </a>
      </footer>
    </div>
  );
}
