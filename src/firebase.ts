import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage'; // Import du service Storage
import firebaseConfig from '../firebase-applet-config.json';

// Initialisation de l'application Firebase
const app = initializeApp(firebaseConfig);

// Export des instances des services
export const db = getFirestore(app);
export const storage = getStorage(app); // Instance pour l'upload d'images
export const auth = getAuth(app);

// Configuration de l'authentification Google
export const googleProvider = new GoogleAuthProvider();

/**
 * Connecte l'utilisateur via une fenêtre surgissante Google
 */
export const signInWithGoogle = async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error("Erreur lors de la connexion Google:", error);
    throw error;
  }
};

/**
 * Déconnecte l'utilisateur de l'application
 */
export const logOut = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Erreur lors de la déconnexion:", error);
  }
};
