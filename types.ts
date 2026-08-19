// Mirrors the frontend's types.ts (aurafit-ai/types.ts).
// Kept in sync manually since this is a separate repo from the frontend.

export enum ActivityLevel {
  SEDENTARY = 'SEDENTARY',
  LIGHTLY_ACTIVE = 'LIGHTLY_ACTIVE',
  MODERATELY_ACTIVE = 'MODERATELY_ACTIVE',
  VERY_ACTIVE = 'VERY_ACTIVE',
  ATHLETE = 'ATHLETE'
}

export enum Equipment {
  FULL_GYM = 'FULL_GYM',
  DUMBBELLS = 'DUMBBELLS',
  BODYWEIGHT = 'BODYWEIGHT'
}

export interface UserProfile {
  age: number;
  gender: 'male' | 'female' | 'other';
  weight: number; // in kg
  height: number; // in cm
  bodyFat?: number;
  activityLevel: ActivityLevel;
  dietaryPatterns: string[];
  allergies: string[];
  medicalGoals: string[];
  equipment: Equipment;
  tdee: number;
  baseTdee: number;
  macros: {
    protein: number;
    carbs: number;
    fats: number;
  };
  occupation: 'sitting' | 'standing' | 'heavy_lifting';
  commuteStyle: 'active' | 'passive';
  screenTime: number;
  sleepHours: number;
  sleepQuality: 'poor' | 'fair' | 'good' | 'excellent';
  stressLevel: number;
  habits: 'none' | 'occasional' | 'frequent';
}

export interface MealEntry {
  id: string;
  name: string;
  timestamp: number;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  sodium: number;
  potassium: number;
  healthScore: number;
  vitamins?: Record<string, string>;
  minerals?: Record<string, string>;
  fiber?: number;
  type: string;
  isSuggested?: boolean;
  dayName?: string;
}

export interface WeeklyMealPlan {
  [key: string]: Partial<MealEntry>[];
}

export interface WorkoutExercise {
  name: string;
  sets: number;
  reps: number;
  description?: string;
  notes?: string;
  completed?: boolean;
  stepImages?: string[];
}

export interface WorkoutPlan {
  id: string;
  date: string;
  dayName: string;
  exercises: WorkoutExercise[];
  intensity: 'low' | 'medium' | 'high';
  rationale: string;
  analysis?: string;
  completed?: boolean;
}

export interface WeeklyWorkoutPlan {
  [key: string]: WorkoutPlan;
}
