import { GoogleGenAI, Type, Modality } from "@google/genai";
import * as dotenv from 'dotenv';
import { UserProfile, MealEntry, WorkoutPlan, WeeklyMealPlan, WeeklyWorkoutPlan } from '../types';

dotenv.config();

// Ported from the frontend's services/geminiService.ts. Logic, prompts, and schemas
// are unchanged from the original client-side implementation \u2014 only the API key
// location moved (now lives server-side only, never shipped to any client).
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is missing in environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || "" });

/**
 * Retry with exponential backoff for transient Gemini errors (quota/overload).
 */
async function callGemini<T>(apiCall: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: any;
  let delay = 2000;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await apiCall();
    } catch (error: any) {
      lastError = error;
      const errorMsg = error?.message || "";
      const isQuotaError = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota");
      const isServerError = errorMsg.includes("500") || errorMsg.includes("503") || errorMsg.includes("overloaded");

      if ((isQuotaError || isServerError) && i < maxRetries) {
        console.warn(`Gemini API busy (Attempt ${i + 1}/${maxRetries + 1}). Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }
      break;
    }
  }
  throw lastError;
}

/**
 * Robust sanitization to prevent "circular structure to JSON" errors.
 */
const sanitize = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') return obj;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    const seen = new WeakSet();
    const safeClone = (val: any): any => {
      if (val === null || typeof val !== 'object') return val;
      if (seen.has(val)) return undefined;
      seen.add(val);
      if (Array.isArray(val)) return val.map(v => safeClone(v));
      const clone: any = {};
      for (const key in val) {
        if (Object.prototype.hasOwnProperty.call(val, key)) {
          clone[key] = safeClone(val[key]);
        }
      }
      return clone;
    };
    return safeClone(obj);
  }
};

export const nutritionSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    calories: { type: Type.NUMBER },
    protein: { type: Type.NUMBER },
    carbs: { type: Type.NUMBER },
    fats: { type: Type.NUMBER },
    sodium: { type: Type.NUMBER },
    potassium: { type: Type.NUMBER },
    fiber: { type: Type.NUMBER },
    healthScore: { type: Type.NUMBER },
    type: { type: Type.STRING }
  },
  required: ['name', 'calories', 'protein', 'carbs', 'fats', 'sodium', 'potassium', 'healthScore', 'type']
};

const slimNutritionSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    calories: { type: Type.NUMBER },
    protein: { type: Type.NUMBER },
    carbs: { type: Type.NUMBER },
    fats: { type: Type.NUMBER },
    healthScore: { type: Type.NUMBER },
    sodium: { type: Type.NUMBER },
    potassium: { type: Type.NUMBER },
    fiber: { type: Type.NUMBER },
    type: { type: Type.STRING }
  },
  required: ['name', 'calories', 'protein', 'carbs', 'fats', 'healthScore', 'type']
};

export const weeklyNutritionSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      day: { type: Type.STRING },
      meals: { type: Type.ARRAY, items: slimNutritionSchema }
    },
    required: ['day', 'meals']
  }
};

export const groceryListSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      category: { type: Type.STRING },
      items: {
        type: Type.ARRAY, items: {
          type: Type.OBJECT,
          properties: { name: { type: Type.STRING }, amount: { type: Type.STRING } },
          required: ['name', 'amount']
        }
      }
    },
    required: ['category', 'items']
  }
};

export const workoutSchema = {
  type: Type.OBJECT,
  properties: {
    exercises: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          sets: { type: Type.NUMBER },
          reps: { type: Type.NUMBER },
          description: { type: Type.STRING },
          notes: { type: Type.STRING }
        },
        required: ['name', 'sets', 'reps', 'description']
      }
    },
    intensity: { type: Type.STRING },
    rationale: { type: Type.STRING },
    analysis: { type: Type.STRING }
  },
  required: ['exercises', 'intensity', 'rationale', 'analysis']
};

export const weeklyWorkoutSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: { day: { type: Type.STRING }, workout: workoutSchema },
    required: ['day', 'workout']
  }
};

async function getLocationContext() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const isIndia = tz.toLowerCase().includes('kolkata') || tz.toLowerCase().includes('asia/calcutta');
    let context = `Location: ${tz}. `;
    if (isIndia) context += `Prioritize Indian staples. No Beef/Pork.`;
    return context;
  } catch { return "Use regional staples."; }
}

export async function analyzeMealImage(base64Image: string, profile: UserProfile): Promise<Partial<MealEntry>> {
  return callGemini(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
          { text: `Analyze meal image for: ${sanitize(profile.dietaryPatterns)}. Goals: ${sanitize(profile.medicalGoals)}. JSON ONLY.` }
        ]
      },
      config: { responseMimeType: "application/json", responseSchema: nutritionSchema }
    });
    return JSON.parse(response.text || '{}');
  });
}

export async function parseMealText(text: string, profile: UserProfile): Promise<Partial<MealEntry>> {
  return callGemini(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze: "${text}". Constraints: ${sanitize(profile.dietaryPatterns)}. JSON ONLY.`,
      config: { responseMimeType: "application/json", responseSchema: nutritionSchema }
    });
    return JSON.parse(response.text || '{}');
  });
}

export async function generateWeeklyMealPlan(profile: UserProfile): Promise<WeeklyMealPlan> {
  const loc = await getLocationContext();

  let mealCountRange = "3 to 4";
  if (profile.medicalGoals.includes('Weight Loss')) {
    mealCountRange = "2 to 3";
  } else if (profile.medicalGoals.includes('Build Muscle') || profile.medicalGoals.includes('Weight Gain') || profile.medicalGoals.includes('Body Recomposition')) {
    mealCountRange = "5 to 6";
  } else if (profile.medicalGoals.includes('Diabetic Friendly')) {
    mealCountRange = "4 to 5";
  } else if (profile.medicalGoals.includes('Endurance Training (5k/Marathon)')) {
    mealCountRange = "5 or more";
  }

  return callGemini(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Create a 7-day nutritional framework. ${loc} 
      Profile: ${sanitize(profile)}. 
      TDEE Budget: ${profile.tdee} kcal.
      Strict Feeding Protocol: Exactly ${mealCountRange} meals per day as per clinical targets. 
      JSON ONLY.`,
      config: { responseMimeType: "application/json", responseSchema: weeklyNutritionSchema }
    });
    const rawArray = JSON.parse(response.text || '[]');
    const plan: WeeklyMealPlan = {};
    rawArray.forEach((item: any) => { plan[item.day] = item.meals; });
    return plan;
  });
}

export async function generateWeeklyWorkoutPlan(profile: UserProfile): Promise<WeeklyWorkoutPlan> {
  return callGemini(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate a 7-day PERFORMANCE LOGIC matrix. 
      Profile: ${sanitize(profile)}. 
      
      STRICT CLINICAL PERFORMANCE PROTOCOLS:
      1. HYPERTROPHY (Build Muscle): Target RPE 8-9 (1-2 reps shy of failure). Focus on volume and time under tension.
      2. ENDURANCE: Target Zone 2-4 aerobic capacity. Focus on duration and sustained power output.
      3. BODY RECOMPOSITION: Target RPE 7-8. Mix of compound strength and metabolic conditioning.
      4. MOBILITY & FLEXIBILITY: Target RPE 3-5. Focus on active range of motion, PNF stretching, and isometric holds.
      
      CRITICAL BIOMETRIC OFFSETS:
      - OCCUPATIONAL: If Occupation is 'heavy_lifting', REDUCE baseline set volume by 30% to prevent CNS overreaching.
      - RECOVERY: If Sleep < 6h or Stress > 8/10, MANDATE a 'Deload' or 'Active Recovery' day in the 7-day cycle.
      
      Ensure every exercise includes a specific RPE target in the notes. JSON ONLY.`,
      config: { responseMimeType: "application/json", responseSchema: weeklyWorkoutSchema }
    });
    const rawArray = JSON.parse(response.text || '[]');
    const plan: WeeklyWorkoutPlan = {};
    rawArray.forEach((item: any) => {
      const dayWorkout = item.workout;
      dayWorkout.dayName = item.day;
      dayWorkout.id = Math.random().toString(36).substr(2, 9);
      plan[item.day] = dayWorkout;
    });
    return plan;
  });
}

export async function generateGroceryList(mealPlan: WeeklyMealPlan): Promise<any[]> {
  return callGemini(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Grocery list from: ${JSON.stringify(sanitize(mealPlan))}. JSON ONLY.`,
      config: { responseMimeType: "application/json", responseSchema: groceryListSchema }
    });
    return JSON.parse(response.text || '[]');
  });
}

export async function generateMealAlternative(profile: UserProfile, type: string, currentMeal: string): Promise<Partial<MealEntry>> {
  return callGemini(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Alternative for ${type}: "${currentMeal}". Constraints: ${sanitize(profile.dietaryPatterns)}. JSON ONLY.`,
      config: { responseMimeType: "application/json", responseSchema: slimNutritionSchema }
    });
    return JSON.parse(response.text || '{}');
  });
}

export async function recalibrateRemainingPlan(profile: UserProfile, currentPlan: WeeklyWorkoutPlan, missedDays: string[]): Promise<WeeklyWorkoutPlan> {
  return callGemini(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Emergency recalibration of training matrix. Current: ${JSON.stringify(sanitize(currentPlan))}. Missed Days: ${missedDays.join(', ')}. 
      Adjust volume and intensity to maintain progress while mitigating injury risk. Profile: ${sanitize(profile)}. JSON ONLY.`,
      config: { responseMimeType: "application/json", responseSchema: weeklyWorkoutSchema }
    });
    const rawArray = JSON.parse(response.text || '[]');
    const plan: WeeklyWorkoutPlan = {};
    rawArray.forEach((item: any) => {
      const dayWorkout = item.workout;
      dayWorkout.dayName = item.day;
      dayWorkout.id = Math.random().toString(36).substr(2, 9);
      plan[item.day] = dayWorkout;
    });
    return plan;
  });
}

export async function generateDailyWorkout(profile: UserProfile, fatigueLevel: number, historyNotes: string): Promise<WorkoutPlan> {
  return callGemini(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Daily session adjustment. Current Fatigue: ${fatigueLevel}/10. 
      Apply recovery filter if fatigue > 7. Profile: ${sanitize(profile)}. JSON ONLY.`,
      config: { responseMimeType: "application/json", responseSchema: workoutSchema }
    });
    const data = JSON.parse(response.text || '{}');
    return { ...data, id: Math.random().toString(36).substr(2, 9), date: new Date().toISOString() };
  });
}

export async function generateSpecializedWorkout(profile: UserProfile, target: string, muscles: string[]): Promise<WorkoutPlan> {
  return callGemini(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Specialized target protocol. Area: ${target}. Muscles: ${muscles.join(', ')}. 
      Adhere to clinical RPE based on profile: ${sanitize(profile)}. JSON ONLY.`,
      config: { responseMimeType: "application/json", responseSchema: workoutSchema }
    });
    const data = JSON.parse(response.text || '{}');
    return { ...data, id: Math.random().toString(36).substr(2, 9), date: new Date().toISOString() };
  });
}

/**
 * Mints a short-lived ephemeral token for the Gemini Live API (used for the
 * voice-to-text meal logging feature in NutritionLog). The client uses this
 * token directly to open its own low-latency audio-streaming connection to
 * Gemini's Live servers, so audio never has to relay through this backend -
 * but the long-lived GEMINI_API_KEY never leaves this server either. The
 * token is single-use and must be used to open a session within 60 seconds.
 */
export async function createLiveSessionToken(): Promise<{ token: string }> {
  return callGemini(async () => {
    const authToken = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            systemInstruction: 'You are a nutrition logger. Simply transcribe the food items the user mentions.'
          }
        }
      }
    });
    return { token: authToken.name || '' };
  });
}

export async function getCoachingAdvice(profile: UserProfile, dailyStats: any, message: string): Promise<string> {
  return callGemini(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `AuraFit Head Coach analysis for message: "${message}". 
      Context: ${sanitize(profile)}. Stats: ${JSON.stringify(sanitize(dailyStats))}. 
      Direct, clinical, and data-driven guidance.`
    });
    return response.text || "Synchronizing core intelligence...";
  });
}
