import { db } from '@/config/firebase';
import { GEMINI_API_KEY, GEMINI_MODEL } from '@/constants/gemini-config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { doc, getDoc, setDoc } from 'firebase/firestore';

/** Returns today's UTC date as YYYY-MM-DD */
function todayUTC(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Asks Gemini for a single random first name to use in the "Swipe left if you lied" prompt. */
async function generateRandomName(): Promise<string> {
  const prompt = `Give me one single random human first name. It can be any name from any culture — be creative and varied. Return ONLY the name itself with no punctuation, explanation, or extra text.`;

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const result = await model.generateContent(prompt);
  const name = result.response.text().trim().replace(/[^a-zA-Z'\- ]/g, '').trim();
  if (!name) throw new Error('Gemini returned an empty name');
  return name;
}

/**
 * Returns today's daily name for the "Swipe left if you lied" prompt.
 *
 * - Reads from Firestore `random/{utcDate}`.
 * - If the document doesn't exist (or has a different date), generates a new
 *   name via Gemini, writes it to `random/{utcDate}`, and returns it.
 * - Multiple clients hitting this at the same time may write the same doc
 *   concurrently, which is harmless (last write wins with the same date key).
 */
export async function getDailyName(): Promise<string> {
  const dateKey = todayUTC();
  const docRef = doc(db, 'random', dateKey);

  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const stored = snap.data() as { name: string; createdAt: string };
      if (stored.name) return stored.name;
    }

    // Not found or missing name — generate a fresh one
    const name = await generateRandomName();
    await setDoc(docRef, { name, createdAt: new Date().toISOString() });
    return name;
  } catch (e) {
    console.error('getDailyName failed:', e);
    // Fallback so the UI still renders something sensible
    return 'buddy';
  }
}
