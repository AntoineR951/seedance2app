import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface PromptData {
  baseIdea: string;
  subject: string;
  environment: string;
  camera: string;
  lighting: string;
  style: string;
}

export async function generateSeedancePrompt(data: PromptData): Promise<string> {
  const prompt = `
    Agis comme un "Prompt Engineer" expert et réalisateur pour le générateur de vidéos IA "Seedance 2.0".
    Ton but est de créer un prompt vidéo ultra-détaillé, structuré plan par plan, basé sur les informations suivantes fournies par l'utilisateur :

    - Idée de base : ${data.baseIdea || "Non spécifié"}
    - Sujet principal et Action : ${data.subject || "Non spécifié"}
    - Environnement / Décor : ${data.environment || "Non spécifié"}
    ${data.camera ? `- Mouvement de caméra : ${data.camera}` : "- Mouvement de caméra : Laisser l'IA choisir en fonction de l'action"}
    ${data.lighting ? `- Éclairage et Atmosphère : ${data.lighting}` : "- Éclairage et Atmosphère : Laisser l'IA choisir en fonction de l'ambiance"}
    ${data.style ? `- Style visuel : ${data.style}` : "- Style visuel : Laisser l'IA choisir (par défaut réaliste/cinématique)"}

    RÈGLES STRICTES :
    1. Le prompt final DOIT être rédigé en ANGLAIS.
    2. Structure le prompt de manière claire : commence par FORMAT et STYLE, puis décris plan par plan (Shot 01, Shot 02, etc.), et termine par STYLE NOTES.
    3. Utilise un vocabulaire très descriptif, technique et cinématographique.
    4. Décris précisément les mouvements de caméra continus ou les coupes, pour chaque plan.
    5. Le prompt doit faire 4000 caractères maximum.

    Renvoie UNIQUEMENT le prompt final en anglais, prêt à être copié-collé. Pas d'introduction, pas de conclusion.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        temperature: 0.7,
      }
    });

    return response.text || "Erreur lors de la génération du prompt.";
  } catch (error) {
    console.error("Erreur Gemini API:", error);
    throw new Error("Impossible de générer le prompt. Veuillez réessayer.");
  }
}

export async function generateStartingImage(promptText: string): Promise<string> {
  try {
    const imagePrompt = `Create a highly detailed, photorealistic cinematic opening frame (Shot 01) based on this video prompt. Focus on the visual style, lighting, and the description of the first shot. Do not include any text or UI elements in the image.\n\nVideo prompt context:\n${promptText}`;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: imagePrompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
        }
      }
    });
    
    const candidates = response.candidates;
    if (candidates && candidates.length > 0) {
      const parts = candidates[0].content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData) {
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          }
        }
      }
    }
    throw new Error("Aucune image générée.");
  } catch (error) {
    console.error("Erreur Gemini Image API:", error);
    throw new Error("Impossible de générer l'image de départ.");
  }
}
